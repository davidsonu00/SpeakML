// This is the seam described in spec section 4/5: "the exact Python
// implementation may change later, therefore do not tightly couple
// Node.js to the internal implementation." Every other file in this app
// (trainingService, predictionService) only ever calls mlClient.js, which
// calls THIS file. Swapping mock -> real Python service is a one-line
// change here (ML_MODE=http in .env) and nothing else in the app changes.

const env = require('../../config/env');
const mockMlService = require('./mockMlService');
const httpMlService = require('./httpMlService'); // added in Step 12

const ML_MODE = process.env.ML_MODE || 'mock';

async function trainModel(payload) {
  if (ML_MODE === 'mock') return mockMlService.trainModel(payload);
  if (ML_MODE === 'http') return httpMlService.trainModel(payload);
  throw new Error(`ML_MODE='${ML_MODE}' is not implemented yet`);
}

async function predict(payload) {
  if (ML_MODE === 'mock') return mockMlService.predict(payload);
  if (ML_MODE === 'http') return httpMlService.predict(payload);
  throw new Error(`ML_MODE='${ML_MODE}' is not implemented yet`);
}

module.exports = { trainModel, predict };
