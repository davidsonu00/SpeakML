// Section 14 requirement: storage must be abstracted behind a service so
// swapping local disk for S3/Supabase later means writing ONE new file
// (objectStorage.js with the same method names) — nothing else in the app
// changes, because callers only ever talk to services/storage/index.js.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const env = require('../../config/env');

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

/**
 * Saves a Buffer/stream already on disk (multer writes to a temp path) to
 * its permanent location, under a generated, collision-proof key. We NEVER
 * trust or reuse the user's original filename as a path — see section 10
 * ("don't trust the original filename", "prevent path traversal").
 */
async function saveDataset(tempFilePath, originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase();
  const key = `datasets/${crypto.randomUUID()}${ext}`;
  const destPath = path.join(env.storage.path, key);
  await ensureDir(path.dirname(destPath));
  await fsp.rename(tempFilePath, destPath);
  return key;
}

async function saveArtifact(trainingId, filename, contentOrBuffer) {
  const key = `artifacts/${trainingId}/${filename}`;
  const destPath = path.join(env.storage.path, key);
  await ensureDir(path.dirname(destPath));
  await fsp.writeFile(destPath, contentOrBuffer);
  return key;
}

function absolutePath(storageKey) {
  // Defensive: reject any key that tries to escape the storage root.
  const resolved = path.resolve(env.storage.path, storageKey);
  const root = path.resolve(env.storage.path);
  if (!resolved.startsWith(root)) {
    throw new Error('Invalid storage key (path traversal attempt)');
  }
  return resolved;
}

async function exists(storageKey) {
  try {
    await fsp.access(absolutePath(storageKey));
    return true;
  } catch {
    return false;
  }
}

async function readFile(storageKey) {
  return fsp.readFile(absolutePath(storageKey));
}

function createReadStream(storageKey) {
  return fs.createReadStream(absolutePath(storageKey));
}

module.exports = { saveDataset, saveArtifact, absolutePath, exists, readFile, createReadStream };
