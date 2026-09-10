const prisma = require('../config/prismaClient');
const ApiError = require('../utils/ApiError');

async function createProject({ prompt }) {
  // The user never types a "project name" — we derive a short, readable
  // one from the prompt so the future dashboard has something to display
  // in a list, without asking the non-technical user an extra question.
  const name = prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;

  return prisma.project.create({
    data: { name, prompt, status: 'CREATED' },
  });
}

async function getProjectById(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      datasets: { orderBy: { createdAt: 'desc' } },
      trainingRuns: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!project) {
    throw ApiError.notFound('PROJECT_NOT_FOUND', `No project with id '${projectId}'`);
  }
  return project;
}

async function deleteProject(projectId) {
  // Confirm it exists first so we return a clean 404 instead of Prisma's
  // own "record to delete does not exist" error leaking through.
  await getProjectById(projectId);
  // onDelete: Cascade on Dataset/TrainingRun/ModelArtifact (see
  // schema.prisma) means this one call also removes all related rows —
  // we still don't delete the underlying files here (that's an explicit
  // decision: keep this method fast and let a separate cleanup job handle
  // orphaned files, rather than making a delete request slow/fragile).
  await prisma.project.delete({ where: { id: projectId } });
}

async function updateStatus(projectId, status) {
  return prisma.project.update({ where: { id: projectId }, data: { status } });
}

module.exports = { createProject, getProjectById, deleteProject, updateStatus };
