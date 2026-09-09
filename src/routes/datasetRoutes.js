const express = require('express');
const upload = require('../middleware/upload');
const { uploadDataset, getDataset, previewDataset } = require('../controllers/datasetController');
const ApiError = require('../utils/ApiError');

// mergeParams: true is required so this router can read `:id` (the
// project id) even though it's defined on the PARENT router that mounts
// this one — see routes/index.js.
const router = express.Router({ mergeParams: true });

// Wraps multer's own error format (it doesn't use our ApiError class)
// into the app's standard error shape.
function handleUpload(req, res, next) {
  upload.single('dataset')(req, res, (err) => {
    if (!err) return next();
    if (err.message === 'INVALID_FILE_TYPE') {
      return next(ApiError.badRequest('DATASET_INVALID', 'Only .csv files are accepted.'));
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.badRequest('DATASET_TOO_LARGE', 'The uploaded file exceeds the maximum allowed size.'));
    }
    return next(ApiError.badRequest('DATASET_INVALID', err.message));
  });
}

// POST /api/v1/projects/:id/dataset
router.post('/', handleUpload, uploadDataset);

// GET /api/v1/projects/:id/dataset
router.get('/', getDataset);

// GET /api/v1/projects/:id/dataset/preview
router.get('/preview', previewDataset);

module.exports = router;
