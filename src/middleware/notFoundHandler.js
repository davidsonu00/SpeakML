// Catches any request that didn't match a real route. Placed AFTER all
// real routes but BEFORE the error handler in app.js, so it converts
// "no route matched" into the same ApiError shape as every other error.

const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res, next) {
  next(ApiError.notFound('ROUTE_NOT_FOUND', `No route: ${req.method} ${req.originalUrl}`));
}

module.exports = notFoundHandler;
