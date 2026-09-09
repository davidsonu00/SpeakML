

import numpy as np
from sklearn.model_selection import cross_val_score
from sklearn.ensemble import RandomForestRegressor

# Hyperparameter search spaces per template family. Kept small & generic
# so the loop works across the template zoo in model_selection.py.
_SEARCH_SPACE = {
    "RandomForest":     {"n_estimators": (50, 300), "max_depth": (2, 20)},
    "GradientBoosting": {"n_estimators": (50, 300), "learning_rate": (0.01, 0.3)},
    "SVM":               {"C": (0.1, 10.0)},
    "LogisticRegression": {"C": (0.01, 10.0)},
    "Ridge":              {"alpha": (0.01, 10.0)},
}

_INT_PARAMS = {"n_estimators", "max_depth"}


def _sample_config(space):
    cfg = {}
    for param, (lo, hi) in space.items():
        val = np.random.uniform(lo, hi)
        cfg[param] = int(round(val)) if param in _INT_PARAMS else round(val, 4)
    return cfg


def _build_model(template_ctor, config):
    model = template_ctor()
    for k, v in config.items():
        if hasattr(model, k):
            setattr(model, k, v)
    return model


def run_dac_loop(template_name, template_ctor, X_train, y_train, task,
                  n_rounds=15, candidates_per_round=4, seed=42):

    np.random.seed(seed)
    space = _SEARCH_SPACE.get(template_name)
    scoring = "accuracy" if task == "classification" else "r2"
    cv = 3 if len(X_train) >= 30 else 2

    log = []
    seen_configs, seen_rewards = [], []
    surrogate = None
    best_config, best_reward = None, -np.inf

    if not space:
        # No tunable params defined for this template -> single eval.
        model = template_ctor()
        reward = float(np.mean(cross_val_score(model, X_train, y_train, cv=cv, scoring=scoring)))
        log.append({"round": 1, "config": {}, "reward": round(reward, 4), "pruned": False})
        return {}, reward, log

    def to_vec(cfg):
        return np.array([cfg.get(p, 0.0) for p in space])

    for round_i in range(1, n_rounds + 1):
        candidates = [_sample_config(space) for _ in range(candidates_per_round)]

        if surrogate is not None and len(seen_configs) >= 4:
            preds = surrogate.predict(np.array([to_vec(c) for c in candidates]))
            ranked = [c for _, c in sorted(zip(preds, candidates), key=lambda t: -t[0])]
            to_evaluate = ranked[:max(1, candidates_per_round // 2)]
            pruned = ranked[max(1, candidates_per_round // 2):]
            for p in pruned:
                log.append({"round": round_i, "config": p, "reward": None, "pruned": True})
        else:
            to_evaluate = candidates

        for cfg in to_evaluate:
            model = _build_model(template_ctor, cfg)
            try:
                reward = float(np.mean(cross_val_score(model, X_train, y_train, cv=cv, scoring=scoring)))
            except Exception:
                reward = -1.0
            log.append({"round": round_i, "config": cfg, "reward": round(reward, 4), "pruned": False})
            seen_configs.append(cfg)
            seen_rewards.append(reward)
            if reward > best_reward:
                best_reward, best_config = reward, cfg

        if len(seen_configs) >= 4:
            surrogate = RandomForestRegressor(n_estimators=30, random_state=seed)
            surrogate.fit(np.array([to_vec(c) for c in seen_configs]), seen_rewards)

    return best_config, best_reward, log


if __name__ == "__main__":
    from sklearn.datasets import load_iris
    from sklearn.ensemble import RandomForestClassifier
    X, y = load_iris(return_X_y=True)
    cfg, reward, log = run_dac_loop("RandomForest", lambda: RandomForestClassifier(random_state=42), X, y, "classification", n_rounds=5)
    print("best config:", cfg, "reward:", reward)
    print("rounds logged:", len(log))
