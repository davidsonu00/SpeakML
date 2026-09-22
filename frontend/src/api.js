// Thin wrapper around the SpeakML backend API (v1). One place for every
// endpoint call + the shared response envelope { success, data, message }.

const API_URL = `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/v1`;

async function handle(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const msg = body?.error?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body.data;
}

// POST /projects  { prompt } -> { id, ... }
export async function createProject(prompt) {
  const res = await fetch(`${API_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return handle(res);
}

// POST /projects/:id/dataset  (multipart, field name "dataset")
export async function uploadDataset(projectId, file, targetColumn) {
  const form = new FormData();
  form.append("dataset", file);
  if (targetColumn) form.append("targetColumn", targetColumn);

  const res = await fetch(`${API_URL}/projects/${projectId}/dataset`, {
    method: "POST",
    body: form, // don't set Content-Type manually — browser sets the multipart boundary
  });
  return handle(res);
}

// POST /projects/:id/train  { targetColumn? } -> full result (synchronous in V1)
export async function startTraining(projectId, targetColumn) {
  const res = await fetch(`${API_URL}/projects/${projectId}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(targetColumn ? { targetColumn } : {}),
  });
  return handle(res);
}

// GET /projects/:id/dataset/preview -> { columns, sampleRows, ... }
export async function previewDataset(projectId) {
  const res = await fetch(`${API_URL}/projects/${projectId}/dataset/preview`);
  return handle(res);
}

// POST /models/:trainingRunId/predict  { inputs } -> { prediction, probability? }
export async function predict(trainingRunId, inputs) {
  const res = await fetch(`${API_URL}/models/${trainingRunId}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs }),
  });
  return handle(res);
}

// Download links (not fetch — just open/point <a href> at these directly)
export function modelDownloadUrl(trainingRunId) {
  return `${API_URL}/training/${trainingRunId}/model`;
}
export function reportDownloadUrl(trainingRunId) {
  return `${API_URL}/training/${trainingRunId}/report`;
}
export function scriptDownloadUrl(trainingRunId) {
  return `${API_URL}/training/${trainingRunId}/script`;
}
