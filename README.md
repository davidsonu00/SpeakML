# SpeakML Backend

The Node.js/Express application backend for SpeakML — a conversational AutoML
web app. A user types a prompt ("predict house prices"), uploads a CSV, and
gets back a trained model, a downloadable Python script, a performance
report, and the ability to test predictions — with **no login required**.

This backend is deliberately NOT the ML/NLP system itself. It is the
plumbing around it: receiving uploads, tracking training jobs, persisting
metadata, and serving files. All real machine learning work happens in a
separate Python service, reached through one clean adapter layer
(`src/services/ml/`) so either side can change independently.

## What's implemented (V1 / MVP)

| Step | What | Status |
|---|---|---|
| 1-2 | Architecture, folder structure, Express skeleton (logging, security, centralized errors, health check) | ✅ Done, tested |
| 3-4 | MySQL schema via Prisma (`projects`, `datasets`, `training_runs`, `model_artifacts`) | ✅ Schema done, proven against real MariaDB |
| 5 | Project APIs (create / get / delete) | ✅ Done, tested |
| 6-7 | CSV upload, validation, stream-based analysis, preview | ✅ Done, tested |
| 8 | Mock ML service (stands in for the real Python pipeline) | ✅ Done |
| 9 | Training job lifecycle (synchronous for V1) | ✅ Done, tested |
| 10 | Artifact download endpoints (model / report / script) | ✅ Done, tested |
| 11 | Prediction endpoint | ✅ Done, tested (mock predictions) |
| 12 | Replace mock ML service with the real Python service | ⬜ Next — see below |
| 14 | Redis + BullMQ for true async training | ⬜ Not started (V1 is synchronous, by design) |
| 15 | Docker | ⬜ Not started |
| 16 | Deployment | ⬜ Not started |

## Architecture

```
React Frontend
      |
      | REST API (/api/v1)
      v
Node.js + Express Backend  <-- you are here
      |
      +---- MySQL (via Prisma)
      |
      +---- Local file storage (storage/datasets, storage/artifacts)
      |
      +---- ML Adapter (src/services/ml/mlAdapter.js)
                  |
                  +---- Mock ML service (today)
                  +---- Real Python ML service (Step 12, not yet wired)
```

Layering inside Node, strictly one direction:

```
Routes -> Controllers -> Services -> Database / Storage / ML Adapter
```

Controllers are thin (parse request, call a service, format response).
All real logic — including talking to Prisma — lives in `src/services/`.

## Why Node.js here, and Python separately?

Node/Express is fast to build a REST API + file handling + DB layer in, and
is what the rest of the team (React) integrates with most naturally. The
actual ML work (scikit-learn model training, joblib serialization) can only
run in Python — there is no way to load a joblib-pickled scikit-learn model
in Node. So the boundary is deliberate: Node owns everything HTTP/DB/files;
Python owns everything ML. They never share code, only one JSON contract
(see `src/services/ml/mlAdapter.js`).

## The most important design decision: the ML Adapter

`trainingService.js` and `predictionService.js` never know whether they're
talking to a mock or the real Python service — they only call
`services/ml/mlClient.js`, which delegates to `mlAdapter.js`. Today
`mlAdapter.js` always routes to `mockMlService.js`. Step 12 will add a real
HTTP-calling implementation there and flip `ML_MODE=http` in `.env` — no
other file in the entire app needs to change. This is exactly the
requirement from the original spec: "do not tightly couple Node.js to the
internal ML implementation."

## A known sandbox-only limitation (not a code problem)

Prisma's CLI needs to download a native "query engine" binary from
`binaries.prisma.sh` the first time you run `npx prisma generate` or
`npx prisma migrate dev`. **This is completely normal and will work fine on
your own machine** with regular internet access. It could not be verified
inside the restricted development sandbox this was originally built in
(that sandbox's network allowlist didn't include `binaries.prisma.sh`), so
schema correctness there was instead proven by applying the equivalent raw
SQL directly to a real MariaDB instance, and all service-layer logic was
verified with Jest using a mocked Prisma client (`tests/helpers/mockPrisma.js`)
combined with real filesystem storage and the real mock ML logic — a
completely standard way to unit-test code that depends on a database.

**The very first time you set this up for real, run:**
```bash
npx prisma generate
npx prisma migrate dev --name init
```

## Local setup

### 1. Prerequisites
- Node.js 18+
- A running MySQL (or MariaDB) server

### 2. Install
```bash
npm install
cp .env.example .env
# edit .env — at minimum set DATABASE_URL to your real MySQL credentials
```

### 3. Create the database
```sql
CREATE DATABASE speakml CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. Run migrations (creates all 4 tables)
```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 5. Run the server
```bash
npm run dev     # auto-restarts on file changes
# or
npm start
```

Server starts on `http://localhost:4000` (configurable via `PORT` in `.env`).

### 6. Run tests
```bash
npm test
```
17 tests, covering: project CRUD, CSV upload + validation + preview, the
full training lifecycle through the mock ML pipeline, artifact downloads,
and prediction — all without needing a live database connection.

## API quick reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Liveness check |
| POST | `/api/v1/projects` | Create a project from a prompt |
| GET | `/api/v1/projects/:id` | Get a project (with its datasets + training runs) |
| DELETE | `/api/v1/projects/:id` | Delete a project (cascades) |
| POST | `/api/v1/projects/:id/dataset` | Upload a CSV (multipart field name: `dataset`) |
| GET | `/api/v1/projects/:id/dataset` | Get the current dataset's metadata |
| GET | `/api/v1/projects/:id/dataset/preview` | Sample rows + column info |
| POST | `/api/v1/projects/:id/train` | Start training (synchronous in V1) |
| GET | `/api/v1/training/:id` | Full training run detail |
| GET | `/api/v1/training/:id/status` | Just the status field (for polling) |
| GET | `/api/v1/training/:id/result` | Same shape as `:id`, semantic alias |
| GET | `/api/v1/training/:id/model` | Download the trained model file |
| GET | `/api/v1/training/:id/report` | Download performance_report.json |
| GET | `/api/v1/training/:id/script` | Download deployable_model.py |
| POST | `/api/v1/models/:id/predict` | Run a prediction (`:id` = training run id) |

### Example: the full happy path with curl

```bash
# 1. Create a project
curl -X POST http://localhost:4000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"prompt": "predict house prices"}'
# -> { "data": { "id": "clx...", ... } }

# 2. Upload a dataset
curl -X POST http://localhost:4000/api/v1/projects/<id>/dataset \
  -F "dataset=@house_prices.csv"

# 3. Preview it
curl http://localhost:4000/api/v1/projects/<id>/dataset/preview

# 4. Train
curl -X POST http://localhost:4000/api/v1/projects/<id>/train \
  -H "Content-Type: application/json" -d '{}'
# -> { "data": { "status": "COMPLETED", "model": {...}, "metrics": {...} } }

# 5. Download the report
curl http://localhost:4000/api/v1/training/<trainingId>/report -o report.json

# 6. Predict
curl -X POST http://localhost:4000/api/v1/models/<trainingId>/predict \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"area": 2000, "bedrooms": 3, "bathrooms": 2}}'
```

## Response format

Every endpoint returns one of these two shapes:

```json
{ "success": true, "data": { ... }, "message": "..." }
```
```json
{ "success": false, "error": { "code": "PROJECT_NOT_FOUND", "message": "..." } }
```

## Environment variables

See `.env.example`. Key ones:
- `DATABASE_URL` — MySQL connection string (Prisma format)
- `ML_SERVICE_URL` — where the real Python service will live (Step 12)
- `ML_MODE` — `mock` (default) or `http` (Step 12); set as a plain env var, not yet in `.env.example` since it's a Step-12 concept
- `STORAGE_PATH` — where uploaded datasets and generated artifacts are saved
- `MAX_FILE_SIZE` — upload size limit in bytes

## Folder structure

```
src/
├── config/          env loading, Prisma client (lazy singleton)
├── controllers/     thin HTTP handlers — parse request, call a service
├── routes/          Express routers, one per resource
├── services/        all real business logic
│   ├── ml/          the adapter boundary to the Python ML system
│   └── storage/     local-disk file storage (swappable for S3 later)
├── middleware/       error handling, 404, file upload
├── utils/           ApiError, ApiResponse, logger, csvAnalyzer, asyncHandler
├── validators/       request input validation
├── app.js            Express app assembly (no listen())
└── server.js         actually starts the HTTP server
prisma/
└── schema.prisma     the 4-table schema
tests/                Jest + Supertest, mocked Prisma, real storage + real mock ML
storage/
├── datasets/          uploaded CSVs (generated UUID filenames)
└── artifacts/          per-training-run model/report/script files
```

## What's deliberately NOT built yet (and why)

- **No authentication** — explicit V1 requirement. The schema has no
  `users` table yet, but nothing here assumes a single global user either
  (everything is scoped by `projectId`), so adding auth later means adding
  a `userId` foreign key and an auth middleware, not a rewrite.
- **No Redis/BullMQ** — training runs synchronously inside the request for
  V1, which the spec explicitly allows. `trainingService.js`'s status
  lifecycle (`QUEUED -> ANALYZING_DATA -> ... -> COMPLETED`) already models
  the full async lifecycle, specifically so swapping in a real job queue
  later changes *how* those transitions happen, not *what* the states are.
- **No real Python integration yet** — Step 12. The mock ML service
  (`src/services/ml/mockMlService.js`) implements the exact same contract
  the real Python `/internal/train` endpoint will, so this swap is
  intentionally low-risk.
- **No arbitrary code execution** — generated Python scripts are
  downloadable artifacts only, never executed by this backend, per the
  spec's explicit ML safety requirement.
