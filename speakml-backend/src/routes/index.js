// Single place where every route group gets mounted under /api/v1.

const express = require('express');
const healthRoutes = require('./healthRoutes');
const projectRoutes = require('./projectRoutes');
const trainingStatusRoutes = require('./trainingStatusRoutes');
const predictionRoutes = require('./predictionRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/projects', projectRoutes); // also owns nested /:id/dataset and /:id/train
router.use('/training', trainingStatusRoutes); // /:id, /:id/status, /:id/result, /:id/model|report|script
router.use('/models', predictionRoutes); // /:id/predict

module.exports = router;
