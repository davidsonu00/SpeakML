

import os
import numpy as np
import pandas as pd
from sklearn.datasets import load_iris, load_wine, load_breast_cancer, load_digits, load_diabetes
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, RobustScaler, MinMaxScaler, LabelEncoder
from sklearn.model_selection import train_test_split

# ---- Node 1a: internal dataset library (Semantic Retrieval) ----
_LOADERS = {
    "iris": load_iris,
    "wine": load_wine,
    "breast_cancer": load_breast_cancer,
    "digits": load_digits,
    "diabetes": load_diabetes,
}


class KaggleFetcher:

    def fetch(self, domain: str):
        raise NotImplementedError(
            f"No network access in this environment. "
            f"Would fetch a dataset matching domain='{domain}' from Kaggle here."
        )


def load_csv_dataset(path: str, target_column: str = None):

    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Could not find '{path}'. Place the CSV in the working directory "
            f"or give a full path in the prompt (e.g. '/home/user/data.csv')."
        )

    df = pd.read_csv(path)

    if target_column is None or target_column not in df.columns:
        # No target named, or the named one doesn't match a real column
        # (e.g. user said "revenue" but the header is "Revenue_USD") ->
        # fall back to the last column, which is the most common CSV
        # convention for the label.
        resolved_target = df.columns[-1]
    else:
        resolved_target = target_column

    y_raw = df[resolved_target]
    X_df = df.drop(columns=[resolved_target])

    # One-hot encode any non-numeric feature columns.
    X_df = pd.get_dummies(X_df, drop_first=True)
    X = X_df.to_numpy(dtype=float)

    # Infer task from the target's actual values: non-numeric or few
    # unique values -> classification; many unique numeric values ->
    # regression.
    if y_raw.dtype == object or str(y_raw.dtype).startswith("category"):
        task = "classification"
        y = LabelEncoder().fit_transform(y_raw.astype(str))
    else:
        n_unique = y_raw.nunique()
        if n_unique <= max(20, int(0.05 * len(y_raw))):
            task = "classification"
            y = LabelEncoder().fit_transform(y_raw)
        else:
            task = "regression"
            y = y_raw.to_numpy(dtype=float)

    return X, y, task, resolved_target


def source_dataset(domain: str):
    """Semantic retrieval: map an intent domain to a concrete dataset."""
    if domain == "housing":
        # sklearn removed the old boston loader; diabetes is the closest
        # available regression dataset in the offline library, so we
        # redirect housing -> diabetes and log that substitution.
        domain = "diabetes"
    loader = _LOADERS.get(domain, _LOADERS["iris"])
    bunch = loader()
    X, y = bunch.data, bunch.target
    return X, y, domain


# ---- Node 1b: preprocessing policy (bandit over recipes) ----
_RECIPES = {
    "standard_impute":  {"scaler": StandardScaler, "impute_strategy": "mean", "clip_outliers": False},
    "robust_impute":     {"scaler": RobustScaler,   "impute_strategy": "median", "clip_outliers": True},
    "minmax_impute":     {"scaler": MinMaxScaler,   "impute_strategy": "mean", "clip_outliers": False},
}


class PreprocessingPolicy:
    """UCB1 multi-armed bandit over preprocessing recipes, keyed by domain.

    Each 'arm' is a recipe name. Reward is the downstream CV score reported
    back by the orchestrator's Global Feedback Bus after Node 3 runs.
    Learning persists only for the lifetime of the process (in-memory),
    matching the scope of this demo.
    """

    def __init__(self):
        self.counts = {name: 0 for name in _RECIPES}
        self.value_sums = {name: 0.0 for name in _RECIPES}
        self.total_pulls = 0

    def select(self) -> str:
        # Try every arm once before trusting UCB scores.
        untried = [name for name, c in self.counts.items() if c == 0]
        if untried:
            return untried[0]
        self.total_pulls += 1
        ucb_scores = {}
        for name in _RECIPES:
            mean_reward = self.value_sums[name] / self.counts[name]
            bonus = np.sqrt(2 * np.log(self.total_pulls) / self.counts[name])
            ucb_scores[name] = mean_reward + bonus
        return max(ucb_scores, key=ucb_scores.get)

    def update(self, recipe_name: str, reward: float):
        self.counts[recipe_name] += 1
        self.value_sums[recipe_name] += reward

    def best_known(self):
        tried = {k: v for k, v in self.value_sums.items() if self.counts[k] > 0}
        if not tried:
            return None
        return max(tried, key=lambda k: tried[k] / self.counts[k])


def apply_recipe(X, y, recipe_name: str, test_size=0.25, random_state=42):
    """Runs impute -> outlier clip -> scale -> split, per the chosen recipe."""
    recipe = _RECIPES[recipe_name]
    X = np.array(X, dtype=float)

    imputer = SimpleImputer(strategy=recipe["impute_strategy"])
    X = imputer.fit_transform(X)

    if recipe["clip_outliers"]:
        # Z-score clipping heuristic mentioned in Chapter 4.2.
        z = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-9)
        X = np.where(np.abs(z) > 3, np.sign(z) * 3 * X.std(axis=0) + X.mean(axis=0), X)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state
    )

    scaler = recipe["scaler"]()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    return X_train, X_test, y_train, y_test


if __name__ == "__main__":
    X, y, resolved = source_dataset("iris")
    print("resolved domain:", resolved, "shape:", X.shape)
    policy = PreprocessingPolicy()
    for _ in range(3):
        r = policy.select()
        print("policy picked:", r)
        policy.update(r, reward=np.random.rand())
    print("best known recipe so far:", policy.best_known())
