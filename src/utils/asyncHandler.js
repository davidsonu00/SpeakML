// Express does NOT automatically catch rejected promises from async route
// handlers (this trips up almost every MERN developer moving to a bigger
// backend). Without this wrapper, a thrown error inside an `async (req,
// res) => {...}` controller would crash the request with no response at
// all, instead of reaching errorHandler.js.
//
// Usage:
//   router.get('/:id', asyncHandler(async (req, res) => {
//     const project = await projectService.getById(req.params.id);
//     sendSuccess(res, { data: project });
//   }));

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
