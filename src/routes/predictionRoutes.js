const express = require('express');
const { predict } = require('../controllers/predictionController');

const router = express.Router();

// POST /api/v1/models/:id/predict
router.post('/:id/predict', predict);

module.exports = router;
