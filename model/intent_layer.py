

from dataclasses import dataclass, asdict
import re


@dataclass
class IntentVector:
    raw_prompt: str
    task: str            # "classification" | "regression"
    domain: str           # dataset key, e.g. "iris" — ignored if custom_data_path is set
    priority: str          # "accuracy" | "speed" | "balanced"
    confidence: float
    custom_data_path: str = None   # path to a user-supplied CSV, if the prompt named one
    target_column: str = None       # column to predict, if the prompt named one

    def to_dict(self):
        return asdict(self)


# Matches "my_data.csv", "/path/to/file.csv", "sales_data.csv", etc.
_CSV_PATH_PATTERN = re.compile(r"([\w\-./\\]+\.csv)", re.IGNORECASE)

# Matches "target column is X", "predict the X column", "predict X"
_TARGET_COLUMN_PATTERNS = [
    re.compile(r"target column (?:is|=)\s*['\"]?([\w ]+?)['\"]?(?:[.,]|$)", re.IGNORECASE),
    re.compile(r"predict(?:ing)? the ['\"]?([\w ]+?)['\"]? column", re.IGNORECASE),
    re.compile(r"column (?:named|called) ['\"]?([\w ]+?)['\"]?(?:[.,]|$)", re.IGNORECASE),
]


# Internal "domain fingerprints" — this is the stand-in for what an LLM
# would infer from broader world knowledge. Each domain maps to keywords
# AND a default task type, so a short prompt like "predict house prices"
# resolves to (domain=housing, task=regression) even without the word
# "regression" ever appearing.
_DOMAIN_FINGERPRINTS = {
    "iris":          {"keywords": ["iris", "flower", "petal", "sepal"], "task": "classification"},
    "wine":          {"keywords": ["wine", "vineyard", "grape"], "task": "classification"},
    "breast_cancer": {"keywords": ["cancer", "tumor", "tumour", "diagnosis", "malignant"], "task": "classification"},
    "digits":        {"keywords": ["digit", "handwriting", "mnist", "number recognition"], "task": "classification"},
    "diabetes":      {"keywords": ["diabetes", "blood sugar", "glucose"], "task": "regression"},
    "housing":       {"keywords": ["house", "housing", "real estate", "price", "rent"], "task": "regression"},
}

_TASK_OVERRIDE_WORDS = {
    "classification": ["classify", "classification", "predict category", "predict class", "label"],
    "regression":     ["regression", "predict value", "predict price", "forecast", "estimate amount"],
}

_PRIORITY_WORDS = {
    "speed":    ["fast", "quick", "speed", "cheap", "low cost", "lightweight", "real-time", "real time"],
    "accuracy": ["accurate", "accuracy", "best possible", "precise", "high performance"],
}


def extract_intent(prompt: str) -> IntentVector:
    """Node 1a entry point. Deterministic, explainable intent extraction."""
    text = prompt.lower()

    # --- custom dataset detection: if the prompt names a CSV file, that
    # takes priority over the built-in domain library entirely. Task type
    # still needs to be figured out (below), since a CSV alone doesn't say
    # classification vs regression — that gets inferred later from the
    # actual target column values once the file is loaded (see
    # data_layer.load_csv_dataset), or from task-override words here. ---
    csv_match = _CSV_PATH_PATTERN.search(prompt)
    custom_data_path = csv_match.group(1) if csv_match else None

    target_column = None
    for pattern in _TARGET_COLUMN_PATTERNS:
        m = pattern.search(prompt)
        if m:
            target_column = m.group(1).strip()
            break

    # --- domain detection: score each domain by keyword hits ---
    scores = {}
    for domain, spec in _DOMAIN_FINGERPRINTS.items():
        hits = sum(1 for kw in spec["keywords"] if kw in text)
        if hits:
            scores[domain] = hits

    if custom_data_path:
        # Domain is irrelevant once a real file is supplied; task will be
        # confirmed/corrected once data_layer inspects the actual target
        # column, but default to whatever override words say, else guess
        # classification (data_layer will flip this if the target looks
        # continuous).
        domain = "custom"
        task = "classification"
        confidence = 0.9
    elif scores:
        domain = max(scores, key=scores.get)
        confidence = min(0.95, 0.55 + 0.15 * scores[domain])
        task = _DOMAIN_FINGERPRINTS[domain]["task"]
    else:
        # No domain keyword matched at all -> fall back to a generic
        # classification demo domain, but flag low confidence so the
        # orchestrator's feedback bus knows this was a guess.
        domain = "iris"
        task = "classification"
        confidence = 0.30

    # --- explicit task-word override (user can force task type) ---
    for t, words in _TASK_OVERRIDE_WORDS.items():
        if any(re.search(r"\b" + re.escape(w) + r"\b", text) for w in words):
            task = t
            confidence = min(0.97, confidence + 0.1)
            break

    # --- priority detection ---
    priority = "balanced"
    for p, words in _PRIORITY_WORDS.items():
        if any(w in text for w in words):
            priority = p
            break

    # LLM_SWAP_POINT: replace everything above with a call like
    #   response = llm_client.messages.create(..., prompt=SYSTEM+prompt)
    #   return IntentVector(**json.loads(response))
    # and keep the same return type.

    return IntentVector(
        raw_prompt=prompt,
        task=task,
        domain=domain,
        priority=priority,
        confidence=round(confidence, 2),
        custom_data_path=custom_data_path,
        target_column=target_column,
    )


if __name__ == "__main__":
    for p in [
        "I want to predict whether a flower is which species based on petal size",
        "Build me something fast that predicts house prices",
        "diagnose if a tumor is malignant, accuracy matters most",
        "just build me a model",
        "use my_sales_data.csv and predict the revenue column",
        "classify customers as churn or not using churn_dataset.csv, target column is churned",
    ]:
        print(p, "->", extract_intent(p))
