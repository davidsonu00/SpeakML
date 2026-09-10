// Spec section 18: "The frontend should NOT receive the raw Python
// global_state. Convert it into a frontend-friendly response." This file
// is the ONLY place that conversion happens, in both directions:
//   - toDbFields():      raw ML result -> what we store in training_runs
//   - toFrontendShape():  a training_runs DB row -> what the API returns

function toDbFields(rawResult) {
  return {
    taskType: rawResult.task,
    domain: rawResult.domain,
    targetColumn: rawResult.target_column,
    algorithm: rawResult.model.algorithm,
    hyperparameters: rawResult.model.hyperparameters,
    metrics: rawResult.metrics,
  };
}

function toFrontendShape(trainingRun) {
  const base = {
    id: trainingRun.id,
    status: trainingRun.status,
    problem: {
      type: trainingRun.taskType,
      domain: trainingRun.domain,
      target: trainingRun.targetColumn,
    },
    createdAt: trainingRun.createdAt,
    startedAt: trainingRun.startedAt,
    completedAt: trainingRun.completedAt,
  };

  if (trainingRun.status === 'FAILED') {
    return { ...base, error: { code: trainingRun.errorCode, message: trainingRun.errorMessage } };
  }

  if (trainingRun.status !== 'COMPLETED') {
    return base; // still in progress — no model/metrics to show yet
  }

  return {
    ...base,
    model: {
      algorithm: trainingRun.algorithm,
      hyperparameters: trainingRun.hyperparameters,
    },
    // Regression and classification simply have different keys inside
    // `metrics` (r2/mae/rmse vs accuracy/precision/recall/f1) — we don't
    // force one shape onto the other (spec section 18's explicit rule).
    metrics: trainingRun.metrics,
    artifacts: {
      modelAvailable: Boolean(trainingRun.artifact?.modelStorageKey),
      reportAvailable: Boolean(trainingRun.artifact?.reportStorageKey),
      scriptAvailable: Boolean(trainingRun.artifact?.scriptStorageKey),
    },
  };
}

module.exports = { toDbFields, toFrontendShape };
