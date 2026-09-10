const prisma = require('../config/prismaClient');
const ApiError = require('../utils/ApiError');
const datasetService = require('./datasetService');
const mlClient = require('./ml/mlClient');
const resultMapper = require('./ml/resultMapper');
const storage = require('./storage');
const logger = require('../utils/logger');

// Spec section 12: for V1, synchronous execution is acceptable, but the
// STATUS FIELD must already model the full future async lifecycle, so
// swapping in Redis/BullMQ later (Step 14) means changing HOW a job
// transitions between these states, not adding new states.
const STAGES = ['ANALYZING_DATA', 'PREPROCESSING', 'SELECTING_MODEL', 'TRAINING', 'TUNING', 'EVALUATING', 'GENERATING_ARTIFACTS'];

async function setStatus(trainingRunId, status, extra = {}) {
  await prisma.trainingRun.update({ where: { id: trainingRunId }, data: { status, ...extra } });
  logger.info({ trainingRunId, status }, 'Training stage changed');
}

/**
 * Kicks off training for a project's current dataset. Because V1 runs
 * synchronously, this function does not return until the (mock) ML
 * pipeline finishes — the route handler awaits it directly. When Step 14
 * introduces BullMQ, this function's BODY becomes the queue worker's job
 * handler, and the controller instead just enqueues and returns
 * immediately with { status: 'queued' } — the lifecycle states below are
 * exactly what make that swap possible without a redesign.
 */
async function startTraining({ projectId, targetColumn }) {
  const dataset = await datasetService.getLatestForProject(projectId);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw ApiError.notFound('PROJECT_NOT_FOUND', `No project with id '${projectId}'`);

  const trainingRun = await prisma.trainingRun.create({
    data: {
      projectId,
      datasetId: dataset.id,
      status: 'QUEUED',
      targetColumn: targetColumn || dataset.targetColumn || null,
    },
  });

  logger.info({ trainingRunId: trainingRun.id, projectId }, 'Training started');
  await prisma.project.update({ where: { id: projectId }, data: { status: 'TRAINING' } });
  await prisma.trainingRun.update({ where: { id: trainingRun.id }, data: { startedAt: new Date() } });

  try {
    // Walk through the visible lifecycle stages so a real async version
    // later only has to report progress at the same checkpoints.
    for (const stage of STAGES.slice(0, 3)) {
      await setStatus(trainingRun.id, stage);
    }

    const rawResult = await mlClient.trainModel({
      trainingId: trainingRun.id,
      prompt: project.prompt,
      datasetPath: storage.absolutePath(dataset.storageKey),
      targetColumn: trainingRun.targetColumn,
      datasetMeta: {
        rowCount: dataset.rows,
        columnCount: dataset.columns,
        columnNames: dataset.metadata?.columnNames,
      },
    });

    for (const stage of STAGES.slice(3)) {
      await setStatus(trainingRun.id, stage);
    }

    const dbFields = resultMapper.toDbFields(rawResult);
    await prisma.modelArtifact.create({
      data: {
        trainingRunId: trainingRun.id,
        modelStorageKey: rawResult.artifacts.model,
        reportStorageKey: rawResult.artifacts.report,
        scriptStorageKey: rawResult.artifacts.script,
      },
    });

    const completed = await prisma.trainingRun.update({
      where: { id: trainingRun.id },
      data: { ...dbFields, status: 'COMPLETED', completedAt: new Date() },
      include: { artifact: true },
    });

    await prisma.project.update({ where: { id: projectId }, data: { status: 'COMPLETED' } });
    logger.info({ trainingRunId: trainingRun.id }, 'Training completed');
    return completed;
  } catch (err) {
    logger.error({ err, trainingRunId: trainingRun.id }, 'Training failed');
    const failed = await prisma.trainingRun.update({
      where: { id: trainingRun.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorCode: 'TRAINING_FAILED',
        // Never store/return the raw internal error message to the
        // client (section 19) — but DO log the real `err` above.
        errorMessage: 'The ML pipeline could not produce a model for this prompt and dataset.',
      },
    });
    return failed;
  }
}

async function getById(trainingRunId) {
  const run = await prisma.trainingRun.findUnique({
    where: { id: trainingRunId },
    include: { artifact: true },
  });
  if (!run) throw ApiError.notFound('TRAINING_NOT_FOUND', `No training run with id '${trainingRunId}'`);
  return run;
}

module.exports = { startTraining, getById };
