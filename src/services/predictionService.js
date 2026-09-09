// IMPORTANT ARCHITECTURAL NOTE (worth remembering for a viva question):
// A real trained model from the Python pipeline is a scikit-learn object
// serialized with joblib — Node.js CANNOT deserialize a Python pickle.
// There is no "load .joblib in Node" library, because joblib's format can
// contain arbitrary Python objects (numpy arrays, sklearn classes) with no
// JS equivalent. This means REAL prediction can only ever happen in
// Python. Once Step 12 replaces the mock ML service, mlAdapter.predict()
// will make an HTTP call to the Python service's own /internal/predict
// endpoint (which does `joblib.load(...)` then `model.predict(...)`) —
// Node's job here is only to validate the request and forward it, never
// to run the model itself.
//
// For now (mock mode), this calls the mock predictor so the full
// request/response flow is already wired and testable.

const prisma = require('../config/prismaClient');
const ApiError = require('../utils/ApiError');
const mlClient = require('./ml/mlClient');

async function predict({ trainingRunId, inputs }) {
  const run = await prisma.trainingRun.findUnique({ where: { id: trainingRunId } });
  if (!run) throw ApiError.notFound('MODEL_NOT_FOUND', `No trained model with id '${trainingRunId}'`);
  if (run.status !== 'COMPLETED') {
    throw ApiError.badRequest('MODEL_NOT_FOUND', `Training run '${trainingRunId}' has no completed model to predict with.`);
  }
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    throw ApiError.badRequest('VALIDATION_ERROR', '"inputs" must be a JSON object of feature name -> value.');
  }

  try {
    const result = await mlClient.predict({ task: run.taskType, inputs });
    return result; // { prediction } or { prediction, probability } — never forced into one shape
  } catch (err) {
    throw ApiError.internal('PREDICTION_FAILED');
  }
}

module.exports = { predict };
