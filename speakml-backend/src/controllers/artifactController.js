const path = require('path');
const trainingService = require('../services/trainingService');
const storage = require('../services/storage');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const ARTIFACT_TYPES = {
  model: { field: 'modelStorageKey', downloadName: 'trained_model.joblib' },
  report: { field: 'reportStorageKey', downloadName: 'performance_report.json' },
  script: { field: 'scriptStorageKey', downloadName: 'deployable_model.py' },
};

function download(type) {
  return asyncHandler(async (req, res) => {
    const run = await trainingService.getById(req.params.id);
    if (run.status !== 'COMPLETED' || !run.artifact) {
      throw ApiError.notFound('ARTIFACT_NOT_FOUND', `Training run '${run.id}' has no completed artifacts yet.`);
    }

    const { field, downloadName } = ARTIFACT_TYPES[type];
    const storageKey = run.artifact[field];
    if (!storageKey || !(await storage.exists(storageKey))) {
      throw ApiError.notFound('ARTIFACT_NOT_FOUND', `The '${type}' artifact is not available for this training run.`);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    storage.createReadStream(storageKey).pipe(res);
  });
}

module.exports = {
  downloadModel: download('model'),
  downloadReport: download('report'),
  downloadScript: download('script'),
};
