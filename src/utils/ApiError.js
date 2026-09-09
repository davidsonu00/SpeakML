// A single, predictable error shape for anything that goes wrong in a way
// we EXPECTED (bad input, missing resource, downstream service down).
// This is what section 19 of the spec calls "custom errors" like
// VALIDATION_ERROR, DATASET_INVALID, PROJECT_NOT_FOUND, etc.
//
// Why this matters: without it, a thrown error from deep inside a service
// file has no HTTP status code or machine-readable "code" attached to it —
// the error handler would have no reliable way to tell a client error
// (400) from a server crash (500). By always throwing ApiError, the
// centralized error handler (middleware/errorHandler.js) can trust every
// error it sees has a statusCode and a code.

class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status code, e.g. 400, 404, 503
   * @param {string} code        Machine-readable error code, e.g. 'PROJECT_NOT_FOUND'
   * @param {string} message     Human-readable message, safe to show the client
   * @param {boolean} isOperational  true = expected/handled error, false = programmer bug
   */
  constructor(statusCode, code, message, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(code, message) {
    return new ApiError(400, code, message);
  }

  static notFound(code, message) {
    return new ApiError(404, code, message);
  }

  static conflict(code, message) {
    return new ApiError(409, code, message);
  }

  static serviceUnavailable(code, message) {
    return new ApiError(503, code, message);
  }

  static internal(message) {
    // isOperational=false: this represents a genuine bug, not expected
    // user error — the error handler treats these more seriously in logs.
    return new ApiError(500, 'INTERNAL_ERROR', message, false);
  }
}

module.exports = ApiError;
