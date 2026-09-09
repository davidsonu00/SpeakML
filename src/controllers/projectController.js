const projectService = require('../services/projectService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const logger = require('../utils/logger');

const createProject = asyncHandler(async (req, res) => {
  const project = await projectService.createProject({ prompt: req.body.prompt });
  logger.info({ projectId: project.id }, 'Project created');
  return sendSuccess(res, { statusCode: 201, message: 'Project created', data: project });
});

const getProject = asyncHandler(async (req, res) => {
  const project = await projectService.getProjectById(req.params.id);
  return sendSuccess(res, { data: project });
});

const deleteProject = asyncHandler(async (req, res) => {
  await projectService.deleteProject(req.params.id);
  logger.info({ projectId: req.params.id }, 'Project deleted');
  return sendSuccess(res, { message: 'Project deleted' });
});

module.exports = { createProject, getProject, deleteProject };
