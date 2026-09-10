// Loads and validates environment variables ONCE, so the rest of the app
// never calls `process.env.X` directly. This means:
//   1. Every config value lives in one place.
//   2. If a required value is missing, we fail fast at startup with a
//      clear error, instead of crashing confusingly deep in some request.
//   3. Adding new config later (DATABASE_URL, REDIS_URL, ...) only means
//      editing this one file.

require('dotenv').config();

const required = ['PORT', 'NODE_ENV'];

for (const key of required) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    console.error('Did you copy .env.example to .env ?');
    process.exit(1);
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT, 10),
  isProduction: process.env.NODE_ENV === 'production',

  // Placeholder for Step 3 (MySQL + Prisma) — not used yet.
  databaseUrl: process.env.DATABASE_URL || null,

  // Placeholder for the Python ML service integration (later step).
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',

  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    path: process.env.STORAGE_PATH || './storage',
  },

  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10 MB default

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // requests per window per IP
  },
};

module.exports = env;
