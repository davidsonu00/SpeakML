// STEP 8 DELIVERABLE (per the spec's incremental plan): a mock standing in
// for the real Python orchestrator.run_pipeline() until Step 12 replaces
// it. This mock's job is to return EXACTLY the shape the real Python
// /internal/train endpoint will return (see section 6 of the spec) — so
// every line of trainingService.js written against this mock keeps
// working unchanged once the real service is plugged in.
//
// It's deliberately built to mirror the real pipeline's actual behavior in
// spirit: a tiny keyword-based task/domain guesser (an intentionally
// simplified cousin of the real intent_layer.py), a plausible algorithm
// pick per task, and randomized-but-realistic metrics. It also writes real
// placeholder artifact files to disk so the download endpoints have
// something genuine to serve end-to-end.

const path = require('path');
const storage = require('../storage');

const CLASSIFICATION_ALGORITHMS = ['LogisticRegression', 'RandomForestClassifier', 'GradientBoostingClassifier'];
const REGRESSION_ALGORITHMS = ['Ridge', 'RandomForestRegressor', 'GradientBoostingRegressor'];

const CLASSIFICATION_KEYWORDS = ['classify', 'churn', 'malignant', 'category', 'label', 'diagnos', 'spam'];
const REGRESSION_KEYWORDS = ['price', 'predict the', 'forecast', 'estimate', 'amount', 'value', 'revenue'];

function guessTask(prompt) {
  const text = prompt.toLowerCase();
  if (CLASSIFICATION_KEYWORDS.some((k) => text.includes(k))) return 'classification';
  if (REGRESSION_KEYWORDS.some((k) => text.includes(k))) return 'regression';
  // No strong signal — default to regression since numeric prediction is
  // the more common "predict X" phrasing in prompts like this project's.
  return 'regression';
}

function guessDomain(prompt) {
  const words = prompt.toLowerCase().match(/[a-z]+/g) || [];
  return words.find((w) => w.length > 4) || 'general';
}

function randomInRange(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 10000) / 10000;
}

function buildMetrics(task) {
  if (task === 'classification') {
    const accuracy = randomInRange(0.78, 0.95);
    return {
      accuracy,
      precision: randomInRange(accuracy - 0.05, accuracy + 0.02),
      recall: randomInRange(accuracy - 0.07, accuracy + 0.01),
      f1: randomInRange(accuracy - 0.05, accuracy + 0.01),
    };
  }
  const r2 = randomInRange(0.65, 0.93);
  return {
    r2,
    mae: Math.round(randomInRange(5000, 25000)),
    rmse: Math.round(randomInRange(8000, 35000)),
  };
}

function buildHyperparameters(algorithm) {
  const table = {
    Ridge: { alpha: randomInRange(0.1, 10) },
    LogisticRegression: { C: randomInRange(0.1, 5), max_iter: 2000 },
    RandomForestClassifier: { n_estimators: 100 + Math.round(Math.random() * 200), max_depth: 5 + Math.round(Math.random() * 15) },
    RandomForestRegressor: { n_estimators: 100 + Math.round(Math.random() * 200), max_depth: 5 + Math.round(Math.random() * 15) },
    GradientBoostingClassifier: { n_estimators: 100 + Math.round(Math.random() * 150), learning_rate: randomInRange(0.01, 0.3) },
    GradientBoostingRegressor: { n_estimators: 100 + Math.round(Math.random() * 150), learning_rate: randomInRange(0.01, 0.3) },
  };
  return table[algorithm];
}

function buildDeployableScript({ algorithm, task, hyperparameters, targetColumn }) {
  return `"""
Auto-synthesized by SpeakML (MOCK ML service — Step 8 placeholder)
Task: ${task} | Algorithm: ${algorithm}
Replace this mock once the real Python orchestrator (Step 12) is wired in.
"""

import pandas as pd
from sklearn.model_selection import train_test_split
${task === 'classification' ? 'from sklearn.metrics import accuracy_score' : 'from sklearn.metrics import r2_score'}

TARGET_COLUMN = ${JSON.stringify(targetColumn || 'target')}
HYPERPARAMETERS = ${JSON.stringify(hyperparameters, null, 4)}


def main():
    df = pd.read_csv("your_dataset.csv")
    X = df.drop(columns=[TARGET_COLUMN])
    y = df[TARGET_COLUMN]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)
    # NOTE: this is a mock artifact — the real script generation lives in
    # the ML team's synth.py and will replace this file's contents.
    print("This is a placeholder deployable script from the mock ML service.")


if __name__ == "__main__":
    main()
`;
}

/**
 * The single mock entry point, matching the real Python service's future
 * /internal/train contract (spec section 6). Runs entirely in-process,
 * synchronously — acceptable for V1 per spec section 12.
 */
async function trainModel({ trainingId, prompt, datasetPath, targetColumn, datasetMeta }) {
  // Simulate the pipeline actually taking a moment, so the status-polling
  // flow (QUEUED -> ... -> COMPLETED) is meaningfully exercised even in
  // this synchronous mock, rather than resolving instantly every time.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const task = guessTask(prompt);
  const domain = guessDomain(prompt);
  const algorithms = task === 'classification' ? CLASSIFICATION_ALGORITHMS : REGRESSION_ALGORITHMS;
  const algorithm = algorithms[Math.floor(Math.random() * algorithms.length)];
  const hyperparameters = buildHyperparameters(algorithm);
  const metrics = buildMetrics(task);
  const resolvedTarget = targetColumn || datasetMeta?.columnNames?.slice(-1)[0] || 'target';

  const report = {
    status: 'completed',
    task,
    domain,
    target_column: resolvedTarget,
    dataset: { rows: datasetMeta?.rowCount ?? null, columns: datasetMeta?.columnCount ?? null },
    model: { algorithm, hyperparameters },
    metrics,
  };

  // Write real placeholder artifact files so download endpoints have
  // something genuine to serve — clearly labeled as mock, not a real
  // joblib pickle (Node cannot produce one; only Python can).
  const modelKey = await storage.saveArtifact(
    trainingId,
    'trained_model.joblib.MOCK.txt',
    `MOCK model artifact.\nAlgorithm: ${algorithm}\nHyperparameters: ${JSON.stringify(hyperparameters)}\n` +
      `This file is a stand-in — the real .joblib file will be produced by the Python ML service (Step 12).\n`
  );
  const reportKey = await storage.saveArtifact(
    trainingId,
    'performance_report.json',
    JSON.stringify({ ...report, artifacts: { model: modelKey } }, null, 2)
  );
  const scriptKey = await storage.saveArtifact(
    trainingId,
    'deployable_model.py',
    buildDeployableScript({ algorithm, task, hyperparameters, targetColumn: resolvedTarget })
  );

  return {
    ...report,
    artifacts: {
      model: modelKey,
      report: reportKey,
      script: scriptKey,
    },
  };
}

/**
 * Mock prediction — matches the future POST /internal/predict contract.
 * Produces a plausible but NOT real prediction (no actual model was
 * fitted). See predictionService.js for why real prediction must always
 * be delegated to Python, never computed in Node.
 */
async function predict({ task, inputs }) {
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (task === 'classification') {
    const probability = randomInRange(0.55, 0.97);
    return { prediction: probability > 0.5 ? 'positive_class' : 'negative_class', probability };
  }
  // A deterministic-ish "prediction" derived from the input values, so
  // repeated calls with the same input return the same mock output.
  const numericSum = Object.values(inputs)
    .filter((v) => typeof v === 'number')
    .reduce((a, b) => a + b, 0);
  return { prediction: Math.round(numericSum * randomInRange(50, 150)) };
}

module.exports = { trainModel, predict };
