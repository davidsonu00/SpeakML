const trainingService = require('../services/trainingService');
const resultMapper = require('../services/ml/resultMapper');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

// POST /api/v1/projects/:id/train
// V1 is synchronous, so this awaits the full (mocked) pipeline and
// returns the finished result directly — see trainingService.js's
// comment on how this becomes non-blocking once BullMQ is introduced.
const startTraining = asyncHandler(async (req, res) => {
  const trainingRun = await trainingService.startTraining({
    projectId: req.params.id,
    targetColumn: req.body.targetColumn,
  });
  return sendSuccess(res, {
    statusCode: 202,
    message: trainingRun.status === 'COMPLETED' ? 'Training completed' : 'Training failed',
    data: resultMapper.toFrontendShape(trainingRun),
  });
});

// GET /api/v1/training/:id
const getTrainingRun = asyncHandler(async (req, res) => {
  const run = await trainingService.getById(req.params.id);
  return sendSuccess(res, { data: resultMapper.toFrontendShape(run) });
});

// GET /api/v1/training/:id/status
const getTrainingStatus = asyncHandler(async (req, res) => {
  const run = await trainingService.getById(req.params.id);
  return sendSuccess(res, { data: { id: run.id, status: run.status } });
});

// GET /api/v1/training/:id/result
const getTrainingResult = asyncHandler(async (req, res) => {
  const run = await trainingService.getById(req.params.id);
  return sendSuccess(res, { data: resultMapper.toFrontendShape(run) });
});

module.exports = { startTraining, getTrainingRun, getTrainingStatus, getTrainingResult };
