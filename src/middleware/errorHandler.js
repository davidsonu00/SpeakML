// This is the LAST middleware in the Express chain (see app.js). Express
// recognizes it as an error handler because it takes 4 arguments (err, req,
// res, next) instead of 3. Every `next(err)` call and every thrown error
// inside an async route (caught by asyncHandler, see utils/asyncHandler.js)
// ends up here — meaning individual controllers never need their own
// try/catch-and-format logic. They just throw an ApiError and walk away.

const ApiError = require('../utils/ApiError');
const { sendError } = require('../utils/ApiResponse');
const logger = require('../utils/logger');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Section 19 requirement: never leak Python stack traces or internal
  // secrets to the client. We log the FULL error internally, but only
  // send a safe, minimal shape back over the wire.
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;
  const code = isApiError ? err.code : 'INTERNAL_ERROR';
  const message = isApiError ? err.message : 'An unexpected error occurred';

  const logPayload = { err, statusCode, code, path: req.originalUrl, method: req.method };
  if (!isApiError || !err.isOperational) {
    // Unexpected/programmer errors are logged at "error" level — these are
    // bugs we should actively go fix.
    logger.error(logPayload, 'Unhandled error');
  } else {
    // Expected errors (bad input, not found, etc.) are logged at "warn" —
    // noisy but not alarming.
    logger.warn(logPayload, 'Handled operational error');
  }

  return sendError(res, {
    statusCode,
    code,
    // In production, never expose a raw Node/Prisma/Python error message
    // for a non-operational (unexpected) error — just a generic string.
    message: !isApiError && env.isProduction ? 'An unexpected error occurred' : message,
  });
}

module.exports = errorHandler;
