const express = require('express');
const { createProject, getProject, deleteProject } = require('../controllers/projectController');
const { validateCreateProject } = require('../validators/projectValidator');
const datasetRoutes = require('./datasetRoutes');
const trainingRoutes = require('./trainingRoutes');

const router = express.Router();

// POST /api/v1/projects  { "prompt": "predict house prices" }
router.post('/', validateCreateProject, createProject);

// GET /api/v1/projects/:id
router.get('/:id', getProject);

// DELETE /api/v1/projects/:id
router.delete('/:id', deleteProject);

// Nested resource routers — each handles its own sub-path and reads
// `:id` (the project id) via mergeParams.
router.use('/:id/dataset', datasetRoutes);
router.use('/:id/train', trainingRoutes);

module.exports = router;
