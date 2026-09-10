const express = require('express');
const { getTrainingRun, getTrainingStatus, getTrainingResult } = require('../controllers/trainingController');
const { downloadModel, downloadReport, downloadScript } = require('../controllers/artifactController');

const router = express.Router();

// GET /api/v1/training/:id
router.get('/:id', getTrainingRun);

// GET /api/v1/training/:id/status
router.get('/:id/status', getTrainingStatus);

// GET /api/v1/training/:id/result
router.get('/:id/result', getTrainingResult);

// GET /api/v1/training/:id/model | /report | /script
router.get('/:id/model', downloadModel);
router.get('/:id/report', downloadReport);
router.get('/:id/script', downloadScript);

module.exports = router;
