// Structured logging (section 25 of the spec). We use pino because it's
// fast and outputs JSON lines in production (easy for log aggregators to
// parse later), while printing human-readable colored logs in development
// via pino-pretty.
//
// Usage elsewhere in the app:
//   const logger = require('../utils/logger');
//   logger.info({ projectId }, 'Project created');
//   logger.error({ err }, 'Training failed');
//
// NEVER log: passwords, tokens, API keys, full request bodies that might
// contain secrets. Log identifiers (ids) and event names instead.

const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.isProduction ? 'info' : 'debug',
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});

module.exports = logger;
