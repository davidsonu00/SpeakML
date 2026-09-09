// This file ONLY assembles the Express app (middleware + routes). It does
// NOT call app.listen() — that's server.js's job. Splitting these two lets
// tests import `app` directly with supertest, without ever binding a real
// port (see tests/health.test.js).

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./utils/logger');
const apiRouter = require('./routes');
const notFoundHandler = require('./middleware/notFoundHandler');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// --- Security middleware (section 20) ---
app.use(helmet()); // sets safe HTTP headers (X-Content-Type-Options, etc.)
app.use(cors()); // V1: allow all origins; tighten to the real frontend URL in production
app.use(
  rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } },
  })
);

// --- Body parsing, with a size limit so a huge JSON body can't be used to
// exhaust server memory (CSV files go through multer/a dedicated upload
// route later, NOT through this JSON parser). ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// --- Structured HTTP request logging (section 25) ---
app.use(pinoHttp({ logger }));

// --- Routes ---
app.use('/api/v1', apiRouter);

// --- 404 + centralized error handling (MUST be last, in this order) ---
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
