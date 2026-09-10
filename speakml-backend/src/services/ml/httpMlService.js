// Step 12 implementation: real HTTP calls to the Python ML service
// (api_server.py). Matches mockMlService.js's contract exactly, so
// trainingService.js / predictionService.js need zero changes beyond
// what's noted in the accompanying message.

const env = require('../../config/env');
const storage = require('../storage');

async function trainModel({ trainingId, prompt, datasetPath, targetColumn, datasetMeta }) {
  const res = await fetch(`${env.mlServiceUrl}/internal/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trainingId, prompt, datasetPath, targetColumn, datasetMeta }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ML service /internal/train failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  // The Python service returns artifact CONTENTS inline (base64 model,
  // report JSON text, script text) rather than file paths, since Node and
  // Python don't share a filesystem in general. Save them through the same
  // storage abstraction mockMlService.js uses, so everything downstream
  // (download endpoints, resultMapper) is unaffected.
  const modelBuffer = Buffer.from(data.artifact_contents.model_b64, 'base64');
  const modelKey = await storage.saveArtifact(trainingId, 'trained_model.pkl', modelBuffer);
  const reportKey = await storage.saveArtifact(trainingId, 'performance_report.json', data.artifact_contents.report_json);
  const scriptKey = await storage.saveArtifact(trainingId, 'deployable_model.py', data.artifact_contents.script_py);

  return {
    status: data.status,
    task: data.task,
    domain: data.domain,
    target_column: data.target_column,
    dataset: data.dataset,
    model: data.model,
    metrics: data.metrics,
    artifacts: {
      model: modelKey,
      report: reportKey,
      script: scriptKey,
    },
  };
}

async function predict({ trainingId, task, inputs }) {
  const res = await fetch(`${env.mlServiceUrl}/internal/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trainingId, task, inputs }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ML service /internal/predict failed (${res.status}): ${text}`);
  }

  return res.json(); // { prediction } or { prediction, probability }
}

module.exports = { trainModel, predict };
