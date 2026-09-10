// A Prisma anti-pattern is calling `new PrismaClient()` in multiple files —
// each instance opens its own connection pool. This module guarantees
// exactly one instance is shared across the whole app.
//
// It's also LAZY on purpose: the real PrismaClient constructor touches its
// generated query engine immediately, so if we built it at import time,
// simply requiring app.js (which every route file does, even ones with no
// database dependency, like /health) would crash the whole process the
// moment `prisma generate` hasn't been run — for example, right after a
// fresh `git clone` + `npm install`, before the setup steps in the README
// are followed. Wrapping it in a Proxy means the real client is only
// constructed the first time a model is actually touched (e.g.
// `prisma.project.create(...)`), so unrelated parts of the app keep
// working, and the error — if it happens — surfaces at the exact call
// site that needed the database, not at server startup.

const env = require('./env');

let realClient = null;

function getClient() {
  if (!realClient) {
    // Require lazily too, so merely importing this file never touches
    // @prisma/client until a query is actually attempted.
    const { PrismaClient } = require('@prisma/client');
    realClient = new PrismaClient({
      log: env.isProduction ? ['error'] : ['warn', 'error'],
    });
  }
  return realClient;
}

const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      return getClient()[prop];
    },
  }
);

module.exports = prisma;
