const fs = require('fs').promises;
const prisma = require('../config/prismaClient');
const storage = require('./storage');
const { analyzeCsv, previewCsv } = require('../utils/csvAnalyzer');
const ApiError = require('../utils/ApiError');
const projectService = require('./projectService');

async function uploadDataset({ projectId, file, targetColumn }) {
  // Confirms the project exists first — throws PROJECT_NOT_FOUND (404)
  // rather than silently saving an orphaned dataset.
  await projectService.getProjectById(projectId);

  let analysis;
  try {
    analysis = await analyzeCsv(file.path);
  } catch (err) {
    // Clean up the temp file multer left behind before re-throwing, so
    // rejected uploads don't slowly fill up the OS temp directory.
    await fs.unlink(file.path).catch(() => {});
    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest('DATASET_INVALID', 'The uploaded file could not be parsed as CSV.');
  }

  if (analysis.duplicateColumns.length > 0) {
    await fs.unlink(file.path).catch(() => {});
    throw ApiError.badRequest(
      'DATASET_INVALID',
      `Duplicate column names found: ${analysis.duplicateColumns.join(', ')}`
    );
  }

  if (targetColumn && !analysis.columns.includes(targetColumn)) {
    await fs.unlink(file.path).catch(() => {});
    throw ApiError.badRequest(
      'DATASET_INVALID',
      `Target column '${targetColumn}' was not found in the CSV header.`
    );
  }

  const storageKey = await storage.saveDataset(file.path, file.originalname);

  const dataset = await prisma.dataset.create({
    data: {
      projectId,
      originalFilename: file.originalname,
      storageKey,
      fileSize: file.size,
      rows: analysis.rowCount,
      columns: analysis.columnCount,
      targetColumn: targetColumn || null,
      metadata: {
        columnNames: analysis.columns,
        missingValueCounts: analysis.missingValueCounts,
        totalMissingValues: analysis.totalMissingValues,
      },
    },
  });

  await projectService.updateStatus(projectId, 'HAS_DATASET');

  return dataset;
}

async function getDatasetById(datasetId) {
  const dataset = await prisma.dataset.findUnique({ where: { id: datasetId } });
  if (!dataset) throw ApiError.notFound('DATASET_NOT_FOUND', `No dataset with id '${datasetId}'`);
  return dataset;
}

// A project could technically accumulate more than one uploaded dataset
// over time (spec's schema allows it); "the current one" for a project is
// simply the most recently uploaded, which is what /projects/:id/dataset
// means per the API design in section 9.
async function getLatestForProject(projectId) {
  const dataset = await prisma.dataset.findFirst({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });
  if (!dataset) {
    throw ApiError.notFound('DATASET_NOT_FOUND', `Project '${projectId}' has no dataset uploaded yet.`);
  }
  return dataset;
}

async function getPreview(datasetId, limit = 10) {
  const dataset = await getDatasetById(datasetId);
  const absolutePath = storage.absolutePath(dataset.storageKey);
  const { columns, rows } = await previewCsv(absolutePath, limit);

  return {
    columns,
    sampleRows: rows,
    totalRows: dataset.rows,
    totalColumns: dataset.columns,
    missingValueCounts: dataset.metadata?.missingValueCounts || {},
    detectedTargetColumn: dataset.targetColumn,
  };
}

module.exports = { uploadDataset, getDatasetById, getLatestForProject, getPreview };
