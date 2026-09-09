const { sendSuccess } = require('../utils/ApiResponse');

// Kept deliberately simple for now. Once MySQL (Step 3) and the ML service
// (later step) exist, this will be extended to actually ping them and
// report per-dependency status — see the commented-out shape below.
function getHealth(req, res) {
  return sendSuccess(res, {
    message: 'SpeakML backend is healthy',
    data: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      // dependencies: { database: 'ok', mlService: 'ok', storage: 'ok' }  // added later
    },
  });
}

module.exports = { getHealth };
