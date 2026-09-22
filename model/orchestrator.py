
import time
from sklearn.metrics import accuracy_score, r2_score

from intent_layer import extract_intent
from data_layer import source_dataset, load_csv_dataset, apply_recipe, PreprocessingPolicy
from model_selection import TemplateBandit
from dac_loop import run_dac_loop, _build_model


REWARD_THRESHOLD = {"classification": 0.75, "regression": 0.35}
MAX_BACKTRACKS = 2


def _log(global_state, stage, message):
    entry = {"t": round(time.time() - global_state["_start_time"], 3), "stage": stage, "message": message}
    global_state["log"].append(entry)
    print(f"[{entry['t']:>6.3f}s] ({stage}) {message}")


def run_pipeline(prompt: str, dac_rounds: int = 10):
    """Full agentic run: prompt -> intent -> data -> template -> tuned model.

    Returns the global_state dict (the 'blackboard') containing every
    intermediate decision, plus the final trained model and report.
    """
    global_state = {"_start_time": time.time(), "log": []}

    # --- Initialization: NLP layer extracts intent, writes to global state ---
    intent = extract_intent(prompt)
    global_state["intent"] = intent.to_dict()
    _log(global_state, "NODE1-INTENT",
         f"task={intent.task} domain={intent.domain} priority={intent.priority} confidence={intent.confidence}")

    if intent.custom_data_path:
        X, y, inferred_task, resolved_target = load_csv_dataset(intent.custom_data_path, intent.target_column)
        resolved_domain = f"custom:{intent.custom_data_path}"
        global_state["resolved_domain"] = resolved_domain
        global_state["resolved_target_column"] = resolved_target
        if inferred_task != intent.task:
            _log(global_state, "NODE1-SOURCE",
                 f"prompt implied task='{intent.task}' but target column '{resolved_target}' "
                 f"actually looks like '{inferred_task}' — using the data-driven task type.")
            intent.task = inferred_task
        _log(global_state, "NODE1-SOURCE",
             f"loaded custom CSV '{intent.custom_data_path}', target column='{resolved_target}', shape={X.shape}")
    else:
        X, y, resolved_domain = source_dataset(intent.domain)
        global_state["resolved_domain"] = resolved_domain
        _log(global_state, "NODE1-SOURCE", f"dataset resolved to '{resolved_domain}', shape={X.shape}")

    policy = PreprocessingPolicy()
    template_bandit = TemplateBandit(intent.task)

    best_overall = {"reward": -1e9}
    attempt = 0

    while attempt <= MAX_BACKTRACKS:
        attempt += 1
        # --- Step 1: Node 1 preprocessing policy selects + applies a recipe ---
        recipe_name = policy.select()
        X_train, X_test, y_train, y_test = apply_recipe(X, y, recipe_name)
        _log(global_state, "NODE1-PREP", f"attempt {attempt}: recipe='{recipe_name}'")

        # --- Step 2: Node 2 selects a template via bandit ---
        template_name, template_probe_reward = template_bandit.run(X_train, y_train, n_rounds=len(template_bandit.templates))
        _log(global_state, "NODE2-SELECT",
             f"template='{template_name}' (probe cv reward={template_probe_reward:.4f})")

        # --- Step 3: Node 3 DAC loop tunes the chosen template ---
        best_config, best_cv_reward, dac_log = run_dac_loop(
            template_name, lambda: template_bandit.instantiate(template_name),
            X_train, y_train, intent.task, n_rounds=dac_rounds,
        )
        _log(global_state, "NODE3-DAC",
             f"tuned '{template_name}' over {dac_rounds} rounds -> best cv reward={best_cv_reward:.4f}, config={best_config}")

        # Fit best config on full train set, evaluate on held-out test set
        final_model = _build_model(lambda: template_bandit.instantiate(template_name), best_config or {})
        final_model.fit(X_train, y_train)
        preds = final_model.predict(X_test)
        if intent.task == "classification":
            test_reward = accuracy_score(y_test, preds)
        else:
            test_reward = r2_score(y_test, preds)

        _log(global_state, "GLOBAL-FEEDBACK-BUS",
             f"held-out test reward={test_reward:.4f} (recipe={recipe_name}, template={template_name})")

        policy.update(recipe_name, reward=test_reward)

        if test_reward > best_overall["reward"]:
            best_overall = {
                "reward": test_reward,
                "recipe": recipe_name,
                "template": template_name,
                "config": best_config,
                "model": final_model,
                "attempt": attempt,
            }

        threshold = REWARD_THRESHOLD[intent.task]
        if test_reward >= threshold:
            _log(global_state, "GLOBAL-FEEDBACK-BUS",
                 f"reward {test_reward:.4f} meets threshold {threshold} — accepting model, no backtrack needed.")
            break
        else:
            if attempt <= MAX_BACKTRACKS:
                _log(global_state, "GLOBAL-FEEDBACK-BUS",
                     f"reward {test_reward:.4f} BELOW threshold {threshold} — backtracking to Node 1 "
                     f"(will try a different preprocessing recipe / re-probe templates).")
            else:
                _log(global_state, "GLOBAL-FEEDBACK-BUS",
                     f"reward {test_reward:.4f} still below threshold after {MAX_BACKTRACKS} backtracks — "
                     f"returning best model found (attempt {best_overall['attempt']}).")

    global_state["best"] = {
        "reward": best_overall["reward"],
        "recipe": best_overall["recipe"],
        "template": best_overall["template"],
        "config": best_overall["config"],
        "attempts_used": attempt,
    }
    global_state["_final_model"] = best_overall["model"]
    global_state["dac_log"] = dac_log
    global_state["task"] = intent.task
    return global_state


if __name__ == "__main__":
    run_pipeline("diagnose if a tumor is malignant, accuracy matters most", dac_rounds=6)
