"""
SpeakML — Python ML microservice (Step 12 implementation)

This is the piece that was missing: orchestrator.py/main.py were CLI-only.
This file wraps run_pipeline() in a real HTTP server so the Node backend's
mlAdapter.js (ML_MODE=http) can call it, matching the exact request/response
contract that mockMlService.js already established.

Run it with:
    pip install -r requirements.txt
    uvicorn api_server:app --host 0.0.0.0 --port 8000

The Node backend's ML_SERVICE_URL should point at http://localhost:8000
(or wherever this is deployed).
"""

import os
import re
import json
import base64
import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from sklearn.metrics import (
    precision_score, recall_score, f1_score,
    mean_absolute_error, mean_squared_error,
)
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split

import orchestrator
from orchestrator import run_pipeline
from intent_layer import extract_intent as _extract_intent_original
from data_layer import load_csv_dataset, load_tabular_dataset, build_feature_matrix, apply_recipe, _RECIPES
from synth import generate_deployable_script, generate_performance_report

app = FastAPI(title="SpeakML ML Service")


def _fit_preprocessor(X, y, recipe_name, continuous_mask=None, test_size=0.25, random_state=42):
    """Replicates data_layer.apply_recipe() step-for-step, but ALSO returns
    the fitted imputer + scaler objects — apply_recipe() only returns
    transformed arrays, not the transformers themselves. We need the
    fitted objects so a single prediction-time input row can be scaled
    the exact same way training data was (fixes wildly-wrong predictions
    that come from feeding raw/unscaled values into a model that was
    trained on scaled ones, e.g. a Ridge model expecting area ~ -1..1
    instead of area = 8739).
    """
    recipe = _RECIPES[recipe_name]
    X = np.array(X, dtype=float)

    imputer = SimpleImputer(strategy=recipe["impute_strategy"])
    X = imputer.fit_transform(X)

    if recipe["clip_outliers"]:
        mask = np.ones(X.shape[1], dtype=bool) if continuous_mask is None else np.asarray(continuous_mask, dtype=bool)
        cols = np.where(mask)[0]
        if len(cols):
            sub = X[:, cols]
            mean = sub.mean(axis=0)
            std = sub.std(axis=0)
            z = (sub - mean) / (std + 1e-9)
            X[:, cols] = np.where(np.abs(z) > 3, np.sign(z) * 3 * std + mean, sub)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state
    )

    scaler = recipe["scaler"]()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    return imputer, scaler, X_train, X_test, y_train, y_test

# Common column names datasets use for the prediction target, independent
# of what the user's prompt says. Helps catch cases like a breast-cancer
# CSV whose target column is literally named "diagnosis" even though the
# user's prompt said "cancer"/"malignant" and never says the word
# "diagnosis" at all.
_COMMON_TARGET_NAMES = {
    "target", "label", "labels", "class", "outcome", "diagnosis",
    "result", "output", "y", "price", "status", "response",
}


def _tokenize(text: str):
    return set(re.findall(r"[a-z]+", text.lower()))


def guess_target_column(columns, prompt: str):
    """Fully automatic target-column detection: no user input required.

    Scores each CSV column by (a) word overlap with the prompt itself
    (e.g. prompt says 'price', column is 'SalePrice' -> match), and
    (b) whether the column name is a common target-name convention
    (e.g. 'diagnosis', 'target'). Highest-scoring column wins; ties/zero
    fall through to None, and data_layer.py's own last-column fallback
    takes over from there as a final safety net.
    """
    prompt_words = _tokenize(prompt)
    best_col, best_score = None, 0
    for col in columns:
        col_words = _tokenize(col)
        score = len(col_words & prompt_words) * 2
        score += len(col_words & _COMMON_TARGET_NAMES)
        if score > best_score:
            best_col, best_score = col, score
    return best_col

# In-memory registry: trainingId -> fitted model object + feature columns.
# Good enough for V1 (matches the rest of the project's "synchronous V1,
# swap later" philosophy). If the process restarts, old trainingIds'
# predict calls will 404 — that's fine for now, same as the mock.
_MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {}

ARTIFACT_DIR = os.environ.get("ARTIFACT_DIR", "./artifacts")


# ---------------------------------------------------------------------
# Request/response schemas — mirrors mlClient.js's payload shapes
# ---------------------------------------------------------------------

class TrainRequest(BaseModel):
    trainingId: str
    prompt: str
    datasetPath: str
    targetColumn: Optional[str] = None
    datasetMeta: Optional[Dict[str, Any]] = None


class PredictRequest(BaseModel):
    trainingId: str          # NOTE: Node side needs a small patch to send
                              # this — see accompanying message. Without it
                              # we can't know which model to load.
    task: str
    inputs: Dict[str, Any]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/internal/train")
def train(req: TrainRequest):
    # --- Target column: users never type this in — figure it out
    # ourselves.
    # 1) explicit targetColumn from the request, if one was passed
    # 2) auto-detected from the CSV's actual headers vs the prompt wording
    # 3) otherwise leave unset and let data_layer.py's last-column
    #    fallback handle it (existing safety net) ---
    resolved_target = req.targetColumn
    if not resolved_target:
        try:
            columns = pd.read_csv(req.datasetPath, nrows=0).columns.tolist()
            resolved_target = guess_target_column(columns, req.prompt)
        except Exception:
            resolved_target = None  # dataset not readable yet — fall through safely

    # --- Set the dataset path / target column DIRECTLY instead of
    # stitching text into the prompt for intent_layer's regex to re-parse.
    # Text-based extraction breaks on real-world paths (e.g. Windows paths
    # with spaces in the username, like 'C:\Users\Sonu Gupta\...') since
    # the regex only matches contiguous non-space characters. We already
    # know the exact path and target from the request — no need to guess
    # them back out of text. This monkeypatches extract_intent for the
    # duration of this call only, then restores it.
    #
    # NOTE: not thread-safe under concurrent requests (FastAPI can run sync
    # endpoints in parallel worker threads). Fine for this project's scope;
    # would need a lock or a proper param on run_pipeline() for production.
    def _patched_extract_intent(prompt):
        intent = _extract_intent_original(prompt)
        intent.custom_data_path = req.datasetPath
        if resolved_target:
            intent.target_column = resolved_target
        return intent

    orchestrator.extract_intent = _patched_extract_intent
    try:
        global_state = run_pipeline(req.prompt, dac_rounds=10)
    except Exception as exc:  # noqa: BLE001 - surface as a clean 500 to Node
        raise HTTPException(status_code=500, detail=f"Training pipeline failed: {exc}")
    finally:
        orchestrator.extract_intent = _extract_intent_original

    # --- Persist the fitted model + the EXACT one-hot column layout it was
    # trained on. This is the fix for the feature-mismatch bug: at predict
    # time, encoding a single input row with pd.get_dummies() independently
    # produces far fewer columns than training did (a lone row only has one
    # category per column, so there's nothing to one-hot against). We must
    # re-derive the same column list load_csv_dataset() used, and reindex
    # every prediction against it. ---
    final_model = global_state["_final_model"]

    load_report = global_state.get("load_report", {})
    feature_columns = load_report.get("feature_columns")
    feature_roles = load_report.get("feature_roles")
    frequency_maps = load_report.get("frequency_maps", {})
    if not feature_columns:
        # Backward-compatible fallback for built-in datasets or old pipeline
        # states that do not carry the custom tabular schema.
        df_full = pd.read_csv(req.datasetPath)
        training_target = global_state.get("resolved_target_column") or resolved_target
        X_df_full = df_full.drop(columns=[training_target]) if training_target in df_full.columns else df_full
        X_df_encoded = pd.get_dummies(X_df_full, drop_first=True)
        feature_columns = list(X_df_encoded.columns)

    _MODEL_REGISTRY[req.trainingId] = {
        "model": final_model,
        "task": global_state["task"],
        "feature_columns": feature_columns,
        "feature_roles": feature_roles,
        "frequency_maps": frequency_maps,
    }

    os.makedirs(os.path.join(ARTIFACT_DIR, req.trainingId), exist_ok=True)
    model_path = os.path.join(ARTIFACT_DIR, req.trainingId, "trained_model.pkl")
    joblib.dump(final_model, model_path)
    # Persist feature_columns alongside the model so a cold-started process
    # (server restart) can still serve predictions for old trainingIds.
    with open(os.path.join(ARTIFACT_DIR, req.trainingId, "feature_columns.json"), "w") as f:
        json.dump(feature_columns, f)
    with open(os.path.join(ARTIFACT_DIR, req.trainingId, "feature_schema.json"), "w") as f:
        json.dump({"roles": feature_roles, "frequency_maps": frequency_maps}, f)

    script_text = generate_deployable_script(global_state)
    report_dict = generate_performance_report(global_state)

    # --- Shape adapter for gap #3: convert global_state's report into
    # exactly what resultMapper.js / mockMlService.js already produce, so
    # trainingService.js on the Node side needs ZERO changes. ---
    task = global_state["task"]
    best = global_state["best"]
    reward = best["reward"]

    # Compute the full metric set (mae/rmse or precision/recall/f1) AND
    # fit the imputer/scaler that predict-time inputs must be transformed
    # through. Both come from the exact same reproducible split
    # (random_state=42), so this matches what the winning model was
    # actually evaluated on.
    imputer, scaler = None, None
    try:
        X_full, y_full, _, _, continuous_mask, _ = load_tabular_dataset(req.datasetPath, resolved_target)
        imputer, scaler, _, X_test, _, y_test = _fit_preprocessor(
            X_full, y_full, best["recipe"], continuous_mask=continuous_mask
        )
        preds = final_model.predict(X_test)

        if task == "classification":
            metrics = {
                "accuracy": round(reward, 4),
                "precision": round(precision_score(y_test, preds, average="weighted", zero_division=0), 4),
                "recall": round(recall_score(y_test, preds, average="weighted", zero_division=0), 4),
                "f1": round(f1_score(y_test, preds, average="weighted", zero_division=0), 4),
            }
        else:
            mae = mean_absolute_error(y_test, preds)
            rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
            metrics = {
                "r2": round(reward, 4),
                "mae": round(float(mae), 4),
                "rmse": round(rmse, 4),
            }
    except Exception:
        # Fall back to the single scalar reward if re-deriving the split
        # fails for any reason — never let metric computation break training.
        if task == "classification":
            metrics = {"accuracy": round(reward, 4), "precision": None, "recall": None, "f1": None}
        else:
            metrics = {"r2": round(reward, 4), "mae": None, "rmse": None}

    # Persist the fitted imputer + scaler so predict() can transform a raw
    # input row the same way training data was transformed. Without this,
    # a linear model trained on scaled features (mean~0, std~1) receives
    # raw magnitudes at predict time and produces nonsense output.
    _MODEL_REGISTRY[req.trainingId]["imputer"] = imputer
    _MODEL_REGISTRY[req.trainingId]["scaler"] = scaler
    if imputer is not None:
        joblib.dump(imputer, os.path.join(ARTIFACT_DIR, req.trainingId, "imputer.pkl"))
    if scaler is not None:
        joblib.dump(scaler, os.path.join(ARTIFACT_DIR, req.trainingId, "scaler.pkl"))

    response_shape = {
        "status": "completed",
        "task": task,
        "domain": global_state["resolved_domain"],
        "target_column": global_state.get("resolved_target_column", req.targetColumn),
        "dataset": {
            "rows": req.datasetMeta.get("rowCount") if req.datasetMeta else None,
            "columns": req.datasetMeta.get("columnCount") if req.datasetMeta else None,
        },
        "model": {
            "algorithm": best["template"],
            "hyperparameters": best["config"] or {},
        },
        "metrics": metrics,
        # Artifact CONTENTS are returned inline (base64 for the binary
        # model file) so Node's httpMlService.js can hand them straight to
        # storage.saveArtifact(), exactly like mockMlService.js does.
        "artifact_contents": {
            "model_b64": base64.b64encode(open(model_path, "rb").read()).decode("ascii"),
            "report_json": json.dumps(report_dict, indent=2, default=str),
            "script_py": script_text,
        },
    }
    return response_shape


@app.post("/internal/predict")
def predict(req: PredictRequest):
    entry = _MODEL_REGISTRY.get(req.trainingId)
    feature_columns = entry.get("feature_columns") if entry else None

    if entry is None or feature_columns is None:
        # Cold-start fallback: try loading from disk if the process
        # restarted since training.
        model_path = os.path.join(ARTIFACT_DIR, req.trainingId, "trained_model.pkl")
        columns_path = os.path.join(ARTIFACT_DIR, req.trainingId, "feature_columns.json")
        imputer_path = os.path.join(ARTIFACT_DIR, req.trainingId, "imputer.pkl")
        scaler_path = os.path.join(ARTIFACT_DIR, req.trainingId, "scaler.pkl")
        schema_path = os.path.join(ARTIFACT_DIR, req.trainingId, "feature_schema.json")
        if not os.path.exists(model_path):
            raise HTTPException(status_code=404, detail=f"No trained model found for trainingId '{req.trainingId}'")
        model = joblib.load(model_path)
        feature_columns = json.load(open(columns_path)) if os.path.exists(columns_path) else None
        schema = json.load(open(schema_path)) if os.path.exists(schema_path) else {}
        entry = {
            "model": model,
            "task": req.task,
            "feature_columns": feature_columns,
            "feature_roles": schema.get("roles"),
            "frequency_maps": schema.get("frequency_maps", {}),
            "imputer": joblib.load(imputer_path) if os.path.exists(imputer_path) else None,
            "scaler": joblib.load(scaler_path) if os.path.exists(scaler_path) else None,
        }
        _MODEL_REGISTRY[req.trainingId] = entry

    model = entry["model"]

    # Encode the input row the SAME way training data was encoded, then
    # reindex against the exact training-time column list — this is what
    # fixes the "X has N features but model expects M" mismatch. Any
    # dummy column the single input doesn't produce (e.g. a category the
    # user didn't select) is filled with 0, matching one-hot semantics.
    row = pd.DataFrame([req.inputs])
    if entry.get("feature_roles"):
        roles = entry["feature_roles"]
        row = row.reindex(columns=list(roles), fill_value=np.nan)
        row, _, _ = build_feature_matrix(row, roles, entry.get("frequency_maps"))
    else:
        row = pd.get_dummies(row, drop_first=True)

    if feature_columns:
        row = row.reindex(columns=feature_columns, fill_value=0)
    X = row.to_numpy(dtype=float)

    # Apply the SAME imputer + scaler fitted at training time — without
    # this, a model trained on scaled features (mean~0, std~1) gets raw
    # magnitudes at inference and produces nonsense predictions.
    try:
        if entry.get("imputer") is not None:
            X = entry["imputer"].transform(X)
        if entry.get("scaler") is not None:
            X = entry["scaler"].transform(X)
        pred = model.predict(X)[0]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Prediction failed — input shape/columns likely don't match training data: {exc}")

    result = {"prediction": pred.item() if hasattr(pred, "item") else pred}

    if req.task == "classification" and hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)[0]
        result["probability"] = float(np.max(proba))

    return result
