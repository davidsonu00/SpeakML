const ApiError = require('../utils/ApiError');

function validateCreateProject(req, res, next) {
  const { prompt } = req.body;

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return next(ApiError.badRequest('VALIDATION_ERROR', 'A non-empty "prompt" string is required.'));
  }
  if (prompt.length > 2000) {
    return next(ApiError.badRequest('VALIDATION_ERROR', 'Prompt is too long (max 2000 characters).'));
  }

  req.body.prompt = prompt.trim();
  next();
}

module.exports = { validateCreateProject };
