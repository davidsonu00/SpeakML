const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');

const server = app.listen(env.port, () => {
  logger.info(`SpeakML backend listening on port ${env.port} [${env.nodeEnv}]`);
});

// A crashed process with no explanation is the hardest bug to debug in
// production. These two handlers guarantee we at least LOG what killed the
// process before it goes down, instead of failing silently.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection — shutting down');
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — shutting down');
  server.close(() => process.exit(1));
});

module.exports = server;
