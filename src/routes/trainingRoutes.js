const express = require('express');
const { startTraining } = require('../controllers/trainingController');

// mergeParams: true so this router can read the parent's `:id` (project id)
const router = express.Router({ mergeParams: true });

// POST /api/v1/projects/:id/train
router.post('/', startTraining);

module.exports = router;
