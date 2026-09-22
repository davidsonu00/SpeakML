

import json

_TEMPLATE_IMPORTS = {
    "LogisticRegression": "from sklearn.linear_model import LogisticRegression as Model",
    "Ridge": "from sklearn.linear_model import Ridge as Model",
    "RandomForest_classification": "from sklearn.ensemble import RandomForestClassifier as Model",
    "RandomForest_regression": "from sklearn.ensemble import RandomForestRegressor as Model",
    "GradientBoosting_classification": "from sklearn.ensemble import GradientBoostingClassifier as Model",
    "GradientBoosting_regression": "from sklearn.ensemble import GradientBoostingRegressor as Model",
    "SVM_classification": "from sklearn.svm import SVC as Model",
    "SVM_regression": "from sklearn.svm import SVR as Model",
}


def _import_line(template_name, task):
    key = template_name if template_name in ("LogisticRegression", "Ridge") else f"{template_name}_{task}"
    return _TEMPLATE_IMPORTS[key]


def generate_deployable_script(global_state) -> str:
    best = global_state["best"]
    task = global_state["task"]
    domain = global_state["resolved_domain"]
    import_line = _import_line(best["template"], task)
    scaler_line = {
        "standard_impute": "StandardScaler",
        "robust_impute": "RobustScaler",
        "minmax_impute": "MinMaxScaler",
    }[best["recipe"]]
    impute_strategy = {"standard_impute": "mean", "robust_impute": "median", "minmax_impute": "mean"}[best["recipe"]]

    is_custom = domain.startswith("custom:")

    config = best["config"] or {}
    config_lines = ",\n    ".join(f"{k}={v!r}" for k, v in config.items())

    if is_custom:
        csv_path = domain.split("custom:", 1)[1]
        target_col = global_state.get("resolved_target_column", "")
        data_loading_block = f'''import pandas as pd

CSV_PATH = {csv_path!r}
TARGET_COLUMN = {target_col!r}


def load_data():
    df = pd.read_csv(CSV_PATH)
    y_raw = df[TARGET_COLUMN]
    X_df = pd.get_dummies(df.drop(columns=[TARGET_COLUMN]), drop_first=True)
    X = X_df.to_numpy(dtype=float)
    if y_raw.dtype == object:
        from sklearn.preprocessing import LabelEncoder
        y = LabelEncoder().fit_transform(y_raw.astype(str))
    else:
        y = y_raw.to_numpy(dtype=float)
    return X, y'''
        load_call = "X, y = load_data()"
    else:
        loader_line = {
            "iris": "from sklearn.datasets import load_iris as load_data",
            "wine": "from sklearn.datasets import load_wine as load_data",
            "breast_cancer": "from sklearn.datasets import load_breast_cancer as load_data",
            "digits": "from sklearn.datasets import load_digits as load_data",
            "diabetes": "from sklearn.datasets import load_diabetes as load_data",
        }[domain]
        data_loading_block = loader_line
        load_call = "data = load_data()\n    X, y = data.data, data.target"

    script = f'''"""
Auto-synthesized by SpeakML — Conversational Machine Learning Model Builder
Domain: {domain} | Task: {task} | Template: {best["template"]} | Held-out reward: {best["reward"]:.4f}
Generated recipe: {best["recipe"]} | Tuned config: {json.dumps(config)}
"""

import numpy as np
{data_loading_block}
{import_line}
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import {scaler_line}
from sklearn.model_selection import train_test_split
from sklearn.metrics import {"accuracy_score" if task == "classification" else "r2_score"}


def build_pipeline():
    model = Model({config_lines if config_lines else ""})
    return model


def main():
    {load_call}

    imputer = SimpleImputer(strategy="{impute_strategy}")
    X = imputer.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)

    scaler = {scaler_line}()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    model = build_pipeline()
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    score = {"accuracy_score(y_test, preds)" if task == "classification" else "r2_score(y_test, preds)"}
    print(f"Held-out {"accuracy" if task == "classification" else "R^2"}: {{score:.4f}}")


if __name__ == "__main__":
    main()
'''
    return script


def generate_performance_report(global_state) -> dict:
    return {
        "intent": global_state["intent"],
        "resolved_domain": global_state["resolved_domain"],
        "task": global_state["task"],
        "best_result": {
            "reward": global_state["best"]["reward"],
            "recipe": global_state["best"]["recipe"],
            "template": global_state["best"]["template"],
            "config": global_state["best"]["config"],
            "attempts_used": global_state["best"]["attempts_used"],
        },
        "dac_rounds_logged": len(global_state["dac_log"]),
        "pipeline_log": global_state["log"],
    }
