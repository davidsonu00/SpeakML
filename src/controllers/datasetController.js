const datasetService = require('../services/datasetService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

// POST /api/v1/projects/:id/dataset
const uploadDataset = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('DATASET_INVALID', 'No file was uploaded (expected field name "dataset").');
  }
  const dataset = await datasetService.uploadDataset({
    projectId: req.params.id,
    file: req.file,
    targetColumn: req.body.targetColumn,
  });
  logger.info({ projectId: req.params.id, datasetId: dataset.id }, 'Dataset uploaded');
  return sendSuccess(res, { statusCode: 201, message: 'Dataset uploaded', data: dataset });
});

// GET /api/v1/projects/:id/dataset
const getDataset = asyncHandler(async (req, res) => {
  const dataset = await datasetService.getLatestForProject(req.params.id);
  return sendSuccess(res, { data: dataset });
});

// GET /api/v1/projects/:id/dataset/preview
const previewDataset = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const dataset = await datasetService.getLatestForProject(req.params.id);
  const preview = await datasetService.getPreview(dataset.id, limit);
  return sendSuccess(res, { data: preview });
});

module.exports = { uploadDataset, getDataset, previewDataset };
