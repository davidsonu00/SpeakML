// IMPORTANT ARCHITECTURAL NOTE (worth remembering for a viva question):
// A real trained model from the Python pipeline is a scikit-learn object
// serialized with joblib — Node.js CANNOT deserialize a Python pickle.
// There is no "load .joblib in Node" library, because joblib's format can
// contain arbitrary Python objects (numpy arrays, sklearn classes) with no
// JS equivalent. This means REAL prediction can only ever happen in
// Python. mlAdapter.predict() makes an HTTP call to the Python service's
// own /internal/predict endpoint (which does `joblib.load(...)` then
// `model.predict(...)`) — Node's job here is only to validate the request
// and forward it, never to run the model itself.

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
    // trainingRunId is now forwarded so the ML service knows WHICH trained
    // model to load (previously dropped here — a real bug, separate from
    // the mock-vs-http issue).
    const result = await mlClient.predict({ trainingId: run.id, task: run.taskType, inputs });
    return result; // { prediction } or { prediction, probability } — never forced into one shape
  } catch (err) {
    // Surface the REAL reason (e.g. "input shape/columns don't match
    // training data") instead of a generic opaque 500. Most predict
    // failures are bad/mismatched input, which is a client error (400),
    // not a server bug — so use badRequest, not internal.
    throw ApiError.badRequest('PREDICTION_FAILED', err.message || 'Prediction failed.');
  }
}

module.exports = { predict };
