// Enforces the response envelope from section 21 of the spec, so every
// controller in the app (present or future) returns the exact same shape
// instead of each developer inventing their own. The React frontend can
// then write ONE response-parsing function for the whole API.

function sendSuccess(res, { data = {}, message = 'OK', statusCode = 200 } = {}) {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
}

function sendError(res, { statusCode = 500, code = 'INTERNAL_ERROR', message = 'Something went wrong' } = {}) {
  return res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
}

module.exports = { sendSuccess, sendError };
