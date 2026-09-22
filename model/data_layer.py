"""
Node 1: Architectural Data layer ("The Sourcer / Preparer")
-------------------------------------------------------------
Two responsibilities, matching Chapter 4.2 of the synopsis:

 1. Semantic Retrieval — pick a dataset matching the extracted domain from
    a curated internal library (stand-in for a live Kaggle-fetch), OR load
    any user-supplied tabular file (CSV / TSV / Excel / JSON).

 2. General-purpose preprocessing — real-world tabular data almost never
    arrives as a clean numeric matrix like the sklearn toy datasets. A
    single CSV can mix numbers, categories, dates, booleans, ID columns,
    free-text columns, and missing values, all at once. This module
    inspects each column and decides how to handle it automatically,
    instead of assuming every column is already numeric.

    On top of that, a UCB1 multi-armed bandit still chooses AND learns
    which downstream recipe (scaler + imputer strategy + outlier
    handling) works best for the resulting numeric feature matrix — this
    is the "Policy Gradient / RL-agent learns the optimal sequence" idea
    from the synopsis.
"""

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
    """Pluggable stand-in for 'Autonomic Data Sourcing' from Chapter 1.1.

    In a networked deployment this would call the Kaggle API
    (kaggle.api.dataset_download_files) using the domain string resolved
    by the intent layer. Left as a stub here because this environment has
    no outbound network access — calling it raises clearly rather than
    failing silently.
    """
    def fetch(self, domain: str):
        raise NotImplementedError(
            f"No network access in this environment. "
            f"Would fetch a dataset matching domain='{domain}' from Kaggle here."
        )


# =====================================================================
# General-purpose tabular file loading (any column mix, any file type)
# =====================================================================

_READERS = {
    ".csv": lambda p: pd.read_csv(p),
    ".tsv": lambda p: pd.read_csv(p, sep="\t"),
    ".txt": lambda p: pd.read_csv(p, sep=None, engine="python"),
    ".xlsx": lambda p: pd.read_excel(p),
    ".xls": lambda p: pd.read_excel(p),
    ".json": lambda p: pd.read_json(p),
    ".parquet": lambda p: pd.read_parquet(p),
}

# Column-cardinality thresholds used to decide how to encode a categorical
# column. Tunable, but generous enough for typical tabular datasets.
_MAX_ONE_HOT_CATEGORIES = 30
_MAX_ONE_HOT_RATIO = 0.10       # a column is "low cardinality" if unique/rows <= this, OR under the raw cap above
_ID_LIKE_RATIO = 0.95           # a column this close to all-unique is almost certainly an identifier, not a signal


def _read_any_table(path: str) -> pd.DataFrame:
    ext = os.path.splitext(path)[1].lower()
    reader = _READERS.get(ext)
    if reader is None:
        raise ValueError(
            f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(_READERS))}."
        )
    return reader(path)


def _is_text_dtype(series: pd.Series) -> bool:
    """True for anything that should be treated as text/categorical —
    covers both the classic pandas 'object' dtype and the newer pandas
    StringDtype ('str'/'string'), which recent pandas versions can use by
    default for plain text columns instead of 'object'."""
    return pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series)


def _looks_like_datetime(series: pd.Series) -> bool:
    """Heuristic: a text column parses cleanly as a date for almost all
    its non-null values, and isn't just short numeric-looking strings
    (which would false-positive on things like zip codes)."""
    if not _is_text_dtype(series):
        return False
    non_null = series.dropna()
    if len(non_null) == 0:
        return False
    sample = non_null if len(non_null) <= 200 else non_null.sample(200, random_state=0)
    parsed = pd.to_datetime(sample, errors="coerce", format="mixed")
    hit_rate = parsed.notna().mean()
    # Guard against plain integers/short codes being misread as dates.
    avg_len = sample.astype(str).str.len().mean()
    return hit_rate > 0.9 and avg_len >= 6


def infer_column_roles(df: pd.DataFrame, target_column: str) -> dict:
    """Classifies every non-target column into one role:
      - 'numeric'              already a number, used as-is
      - 'boolean'               True/False, used as 0/1
      - 'datetime'              parsed into year/month/day/weekday features
      - 'categorical_low_card'  few distinct values -> one-hot encoded
      - 'categorical_high_card' many distinct values -> frequency-encoded
                                  (replaced by how common that value is,
                                  instead of exploding into hundreds of columns)
      - 'id_like'               looks like an identifier (near-unique per row)
                                  -> dropped, since it carries no generalizable signal
      - 'constant'              only one distinct value everywhere -> dropped
    """
    roles = {}
    n = len(df)
    for col in df.columns:
        if col == target_column:
            continue
        series = df[col]

        if series.dtype == bool:
            roles[col] = "boolean"
            continue

        nunique = series.nunique(dropna=True)
        if nunique <= 1:
            roles[col] = "constant"
            continue

        if pd.api.types.is_numeric_dtype(series):
            roles[col] = "numeric"
            continue

        if _looks_like_datetime(series):
            roles[col] = "datetime"
            continue

        # Remaining columns are text/categorical.
        uniqueness_ratio = nunique / max(n, 1)
        if uniqueness_ratio >= _ID_LIKE_RATIO and nunique > 20:
            roles[col] = "id_like"
        elif nunique <= _MAX_ONE_HOT_CATEGORIES or uniqueness_ratio <= _MAX_ONE_HOT_RATIO:
            roles[col] = "categorical_low_card"
        else:
            roles[col] = "categorical_high_card"

    return roles


def build_feature_matrix(df: pd.DataFrame, roles: dict, frequency_maps=None):
    """Turns the raw DataFrame into a fully numeric feature matrix, using
    the role assigned to each column. Returns (X_df, continuous_mask, report)
    where continuous_mask marks which output columns are genuinely
    continuous (safe to outlier-clip) vs. binary/one-hot flags (should not
    be clipped), and report is a human-readable dict of what happened to
    each column, for the pipeline log.
    """
    parts = []
    continuous_flags = []
    report = {"dropped": [], "numeric": [], "boolean": [], "datetime_expanded": [],
              "one_hot": [], "frequency_encoded": []}

    numeric_cols = [c for c, r in roles.items() if r == "numeric"]
    if numeric_cols:
        block = df[numeric_cols].apply(pd.to_numeric, errors="coerce")
        parts.append(block)
        continuous_flags += [True] * block.shape[1]
        report["numeric"] = numeric_cols

    bool_cols = [c for c, r in roles.items() if r == "boolean"]
    if bool_cols:
        block = df[bool_cols].astype(float)
        parts.append(block)
        continuous_flags += [False] * block.shape[1]
        report["boolean"] = bool_cols

    datetime_cols = [c for c, r in roles.items() if r == "datetime"]
    for c in datetime_cols:
        dt = pd.to_datetime(df[c], errors="coerce", format="mixed")
        block = pd.DataFrame({
            f"{c}_year": dt.dt.year,
            f"{c}_month": dt.dt.month,
            f"{c}_day": dt.dt.day,
            f"{c}_weekday": dt.dt.weekday,
        })
        parts.append(block)
        continuous_flags += [True] * block.shape[1]
        report["datetime_expanded"].append(c)

    low_card_cols = [c for c, r in roles.items() if r == "categorical_low_card"]
    if low_card_cols:
        cat_df = df[low_card_cols].apply(lambda s: s.fillna("missing").astype(str))
        block = pd.get_dummies(cat_df, columns=low_card_cols, drop_first=True)
        parts.append(block)
        continuous_flags += [False] * block.shape[1]
        report["one_hot"] = low_card_cols

    high_card_cols = [c for c, r in roles.items() if r == "categorical_high_card"]
    for c in high_card_cols:
        filled = df[c].fillna("missing").astype(str)
        freq_map = (frequency_maps or {}).get(c) or filled.value_counts(normalize=True).to_dict()
        block = pd.DataFrame({f"{c}_freq": filled.map(freq_map)})
        parts.append(block)
        continuous_flags += [True] * block.shape[1]
        report["frequency_encoded"].append(c)

    report["dropped"] = [c for c, r in roles.items() if r in ("id_like", "constant")]

    if parts:
        X_df = pd.concat(parts, axis=1)
    else:
        # Every column was dropped (all-constant/all-id) — fall back to a
        # single zero column so downstream code doesn't crash on an empty
        # matrix; this dataset genuinely has no usable signal.
        X_df = pd.DataFrame({"_no_usable_features": np.zeros(len(df))})
        continuous_flags = [True]

    continuous_mask = np.array(continuous_flags, dtype=bool)
    return X_df, continuous_mask, report


def load_tabular_dataset(path: str, target_column: str = None):
    """Loads ANY supported tabular file (CSV/TSV/Excel/JSON/Parquet) and
    turns it into a clean numeric (X, y) pair, handling whatever mix of
    numeric / categorical / datetime / boolean / ID-like columns the file
    actually contains — rather than assuming it's already a clean numeric
    matrix.

    Returns: X (numpy array), y (numpy array), task ("classification" or
    "regression"), resolved_target (str), continuous_mask (bool array,
    same width as X — True where a column is safe to outlier-clip),
    report (dict describing exactly what happened to every column, for
    the pipeline log / performance report).
    """
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Could not find '{path}'. Place the file in the working directory "
            f"or give a full path in the prompt (e.g. '/home/user/data.csv')."
        )

    df = _read_any_table(path)

    if target_column is None or target_column not in df.columns:
        resolved_target = df.columns[-1]
    else:
        resolved_target = target_column

    # Drop rows with a missing target — they carry no learnable signal.
    n_before = len(df)
    df = df.dropna(subset=[resolved_target])
    n_dropped_missing_target = n_before - len(df)

    # Drop exact duplicate rows.
    n_before_dupes = len(df)
    df = df.drop_duplicates()
    n_dropped_duplicates = n_before_dupes - len(df)

    df = df.reset_index(drop=True)

    y_raw = df[resolved_target]
    roles = infer_column_roles(df, resolved_target)
    frequency_maps = {
        c: df[c].fillna("missing").astype(str).value_counts(normalize=True).to_dict()
        for c, role in roles.items() if role == "categorical_high_card"
    }
    X_df, continuous_mask, column_report = build_feature_matrix(df, roles, frequency_maps)
    X = X_df.to_numpy(dtype=float)

    # Infer task from the target's ACTUAL values, not the prompt's guess.
    if y_raw.dtype == bool:
        task = "classification"
        y = y_raw.astype(int).to_numpy()
    elif _is_text_dtype(y_raw) or str(y_raw.dtype).startswith("category"):
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

    report = {
        "rows_dropped_missing_target": n_dropped_missing_target,
        "rows_dropped_duplicates": n_dropped_duplicates,
        "final_rows": len(df),
        "final_feature_columns": X.shape[1],
        "feature_columns": list(X_df.columns),
        "feature_roles": roles,
        "frequency_maps": frequency_maps,
        "column_roles": column_report,
    }

    return X, y, task, resolved_target, continuous_mask, report


def load_csv_dataset(path: str, target_column: str = None):
    """Backwards-compatible alias — older code called this for CSV-only
    loading. New code should use load_tabular_dataset, which also handles
    TSV/Excel/JSON/Parquet and is what this now delegates to.
    """
    X, y, task, resolved_target, _continuous_mask, _report = load_tabular_dataset(path, target_column)
    return X, y, task, resolved_target


def source_dataset(domain: str):
    """Semantic retrieval: map an intent domain to a concrete built-in
    dataset. Built-in datasets are already fully numeric, so their
    continuous_mask is simply all-True.
    """
    if domain == "housing":
        # sklearn removed the old boston loader; diabetes is the closest
        # available regression dataset in the offline library, so we
        # redirect housing -> diabetes and log that substitution.
        domain = "diabetes"
    loader = _LOADERS.get(domain, _LOADERS["iris"])
    bunch = loader()
    X, y = bunch.data, bunch.target
    continuous_mask = np.ones(X.shape[1], dtype=bool)
    return X, y, domain, continuous_mask


# =====================================================================
# Node 1b: preprocessing policy (bandit over recipes)
# =====================================================================
_RECIPES = {
    "standard_impute":  {"scaler": StandardScaler, "impute_strategy": "mean", "clip_outliers": False},
    "robust_impute":     {"scaler": RobustScaler,   "impute_strategy": "median", "clip_outliers": True},
    "minmax_impute":     {"scaler": MinMaxScaler,   "impute_strategy": "mean", "clip_outliers": False},
}


class PreprocessingPolicy:
    """UCB1 multi-armed bandit over preprocessing recipes.

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


def apply_recipe(X, y, recipe_name: str, continuous_mask=None, test_size=0.25, random_state=42):
    """Runs impute -> outlier clip -> scale -> split, per the chosen recipe.

    continuous_mask (optional bool array, one entry per column of X):
    when given, outlier clipping is only ever applied to columns marked
    True (genuinely continuous numeric/frequency/datetime features) —
    binary flags from one-hot encoding are left untouched, since z-score
    clipping a 0/1 flag would corrupt it into a meaningless fractional
    value. Defaults to "every column is continuous" for backward
    compatibility with the fully-numeric sklearn toy datasets.
    """
    recipe = _RECIPES[recipe_name]
    X = np.array(X, dtype=float)

    if continuous_mask is None:
        continuous_mask = np.ones(X.shape[1], dtype=bool)
    else:
        continuous_mask = np.asarray(continuous_mask, dtype=bool)

    imputer = SimpleImputer(strategy=recipe["impute_strategy"])
    X = imputer.fit_transform(X)

    if recipe["clip_outliers"] and continuous_mask.any():
        cols = np.where(continuous_mask)[0]
        sub = X[:, cols]
        z = (sub - sub.mean(axis=0)) / (sub.std(axis=0) + 1e-9)
        clipped = np.where(np.abs(z) > 3, np.sign(z) * 3 * sub.std(axis=0) + sub.mean(axis=0), sub)
        X[:, cols] = clipped

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state
    )

    scaler = recipe["scaler"]()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    return X_train, X_test, y_train, y_test


if __name__ == "__main__":
    X, y, resolved, cmask = source_dataset("iris")
    print("resolved domain:", resolved, "shape:", X.shape)
    policy = PreprocessingPolicy()
    for _ in range(3):
        r = policy.select()
        print("policy picked:", r)
        policy.update(r, reward=np.random.rand())
    print("best known recipe so far:", policy.best_known())
