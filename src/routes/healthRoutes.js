const express = require('express');
const { getHealth } = require('../controllers/healthController');

const router = express.Router();

// GET /api/v1/health
router.get('/', getHealth);

module.exports = router;
