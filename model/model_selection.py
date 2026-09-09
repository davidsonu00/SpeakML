
import numpy as np
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.svm import SVC, SVR
from sklearn.model_selection import cross_val_score

CLASSIFICATION_TEMPLATES = {
    "LogisticRegression": lambda: LogisticRegression(max_iter=2000),
    "RandomForest":        lambda: RandomForestClassifier(n_estimators=100, random_state=42),
    "GradientBoosting":    lambda: GradientBoostingClassifier(random_state=42),
    "SVM":                  lambda: SVC(probability=False),
}

REGRESSION_TEMPLATES = {
    "Ridge":              lambda: Ridge(),
    "RandomForest":        lambda: RandomForestRegressor(n_estimators=100, random_state=42),
    "GradientBoosting":    lambda: GradientBoostingRegressor(random_state=42),
    "SVM":                  lambda: SVR(),
}


class TemplateBandit:
    """UCB1 bandit over model templates for a given task type."""

    def __init__(self, task: str):
        self.task = task
        self.templates = CLASSIFICATION_TEMPLATES if task == "classification" else REGRESSION_TEMPLATES
        self.counts = {name: 0 for name in self.templates}
        self.value_sums = {name: 0.0 for name in self.templates}
        self.total_pulls = 0
        self.log = []

    def _probe_reward(self, name, X_train, y_train):
        model = self.templates[name]()
        scoring = "accuracy" if self.task == "classification" else "r2"
        cv = 3 if len(X_train) >= 30 else 2
        scores = cross_val_score(model, X_train, y_train, cv=cv, scoring=scoring)
        return float(np.mean(scores))

    def run(self, X_train, y_train, n_rounds: int = None):
        """Pull each arm at least once, then explore/exploit for n_rounds more.
        Returns the best template name found and its recorded reward.
        """
        names = list(self.templates)
        if n_rounds is None:
            n_rounds = len(names)  # light budget by default

        for name in names:
            reward = self._probe_reward(name, X_train, y_train)
            self.counts[name] += 1
            self.value_sums[name] += reward
            self.total_pulls += 1
            self.log.append({"round": self.total_pulls, "arm": name, "reward": round(reward, 4), "mode": "init"})

        for _ in range(n_rounds):
            ucb_scores = {}
            for name in names:
                mean_reward = self.value_sums[name] / self.counts[name]
                bonus = np.sqrt(2 * np.log(self.total_pulls + 1) / self.counts[name])
                ucb_scores[name] = mean_reward + bonus
            pick = max(ucb_scores, key=ucb_scores.get)
            reward = self._probe_reward(pick, X_train, y_train)
            self.counts[pick] += 1
            self.value_sums[pick] += reward
            self.total_pulls += 1
            self.log.append({"round": self.total_pulls, "arm": pick, "reward": round(reward, 4), "mode": "ucb"})

        best_name = max(self.templates, key=lambda k: self.value_sums[k] / self.counts[k])
        best_reward = self.value_sums[best_name] / self.counts[best_name]
        return best_name, best_reward

    def instantiate(self, name):
        return self.templates[name]()


if __name__ == "__main__":
    from sklearn.datasets import load_iris
    X, y = load_iris(return_X_y=True)
    bandit = TemplateBandit("classification")
    best, reward = bandit.run(X, y)
    print("best template:", best, "reward:", reward)
    for entry in bandit.log:
        print(entry)
