// The ONE function trainingService.js and predictionService.js are
// allowed to call. Notice its signature is plain, business-language
// (trainingId, prompt, datasetPath, targetColumn) — it says nothing about
// HTTP, mocks, or Python. That's deliberate: this is the contract from
// spec section 5, and it should never need to change even if section 4's
// "exact Python implementation" changes completely.

const mlAdapter = require('./mlAdapter');

async function trainModel({ trainingId, prompt, datasetPath, targetColumn, datasetMeta }) {
  return mlAdapter.trainModel({ trainingId, prompt, datasetPath, targetColumn, datasetMeta });
}

async function predict({ task, inputs }) {
  return mlAdapter.predict({ task, inputs });
}

module.exports = { trainModel, predict };
