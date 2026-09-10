const predictionService = require('../services/predictionService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

// POST /api/v1/models/:id/predict
const predict = asyncHandler(async (req, res) => {
  const result = await predictionService.predict({
    trainingRunId: req.params.id,
    inputs: req.body.inputs,
  });
  return sendSuccess(res, { data: result });
});

module.exports = { predict };
