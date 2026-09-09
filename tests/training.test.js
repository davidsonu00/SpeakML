jest.mock('../src/config/prismaClient', () => require('./helpers/mockPrisma').createMockPrisma());

const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/prismaClient');

const SAMPLE_CSV = path.join(__dirname, 'fixtures', 'sample.csv');

/**
 * Wires up the mock prisma calls needed for one full
 * "create project -> upload dataset -> train -> download -> predict"
 * journey, and returns the ids involved. This exercises the REAL
 * mockMlService, REAL storage writes, and REAL resultMapper — only the
 * database layer is mocked, since that's the one piece this sandbox
 * cannot run live (see README.md).
 */
async function setupProjectWithDataset() {
  prisma.project.create.mockResolvedValueOnce({
    id: 'proj_1',
    name: 'predict house prices',
    prompt: 'predict house prices',
    status: 'CREATED',
  });
  const createRes = await request(app).post('/api/v1/projects').send({ prompt: 'predict house prices' });
  const projectId = createRes.body.data.id;

  prisma.project.findUnique.mockResolvedValueOnce({ id: projectId, status: 'CREATED', prompt: 'predict house prices' });
  let savedDataset;
  prisma.dataset.create.mockImplementationOnce(({ data }) => {
    savedDataset = { id: 'ds_1', ...data };
    return Promise.resolve(savedDataset);
  });
  prisma.project.update.mockResolvedValueOnce({});

  await request(app).post(`/api/v1/projects/${projectId}/dataset`).attach('dataset', SAMPLE_CSV);

  return { projectId, dataset: savedDataset };
}

describe('POST /api/v1/projects/:id/train (full lifecycle, mock ML)', () => {
  it('walks QUEUED -> ... -> COMPLETED and stores real metrics + artifacts', async () => {
    const { projectId, dataset } = await setupProjectWithDataset();

    prisma.dataset.findFirst.mockResolvedValueOnce(dataset);
    prisma.project.findUnique.mockResolvedValueOnce({ id: projectId, prompt: 'predict house prices' });
    prisma.trainingRun.create.mockResolvedValueOnce({ id: 'run_1', status: 'QUEUED', targetColumn: 'price' });
    prisma.project.update.mockResolvedValueOnce({});
    prisma.trainingRun.update.mockResolvedValue({ id: 'run_1' }); // used for every stage transition + startedAt
    prisma.modelArtifact.create.mockResolvedValueOnce({ id: 'artifact_1' });

    let completedRun;
    prisma.trainingRun.update.mockImplementation(({ data }) => {
      completedRun = { id: 'run_1', targetColumn: 'price', ...data, artifact: { modelStorageKey: 'x', reportStorageKey: 'y', scriptStorageKey: 'z' } };
      return Promise.resolve(completedRun);
    });

    const res = await request(app).post(`/api/v1/projects/${projectId}/train`).send({});

    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.problem.type).toBe('regression'); // "predict house prices" has no classification keyword
    expect(['Ridge', 'RandomForestRegressor', 'GradientBoostingRegressor']).toContain(res.body.data.model.algorithm);
    expect(res.body.data.metrics).toHaveProperty('r2');
    expect(res.body.data.artifacts.modelAvailable).toBe(true);
    expect(res.body.data.artifacts.reportAvailable).toBe(true);
    expect(res.body.data.artifacts.scriptAvailable).toBe(true);
  });
});

describe('GET /api/v1/training/:id/report (artifact download)', () => {
  it('streams back a real, previously-written report file', async () => {
    prisma.trainingRun.findUnique.mockResolvedValueOnce({
      id: 'run_1',
      status: 'COMPLETED',
      artifact: { reportStorageKey: 'artifacts/run_1/performance_report.json' },
    });

    const res = await request(app).get('/api/v1/training/run_1/report');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/performance_report\.json/);
    const parsed = JSON.parse(res.text);
    expect(parsed.task).toBe('regression');
  });

  it('returns 404 ARTIFACT_NOT_FOUND if the training run never completed', async () => {
    prisma.trainingRun.findUnique.mockResolvedValueOnce({ id: 'run_2', status: 'FAILED', artifact: null });
    const res = await request(app).get('/api/v1/training/run_2/report');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ARTIFACT_NOT_FOUND');
  });
});

describe('POST /api/v1/models/:id/predict', () => {
  it('returns a prediction for a completed regression model', async () => {
    prisma.trainingRun.findUnique.mockResolvedValueOnce({ id: 'run_1', status: 'COMPLETED', taskType: 'regression' });
    const res = await request(app)
      .post('/api/v1/models/run_1/predict')
      .send({ inputs: { area: 2000, bedrooms: 3, bathrooms: 2 } });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.prediction).toBe('number');
  });

  it('rejects prediction against a model that never finished training', async () => {
    prisma.trainingRun.findUnique.mockResolvedValueOnce({ id: 'run_3', status: 'TRAINING' });
    const res = await request(app).post('/api/v1/models/run_3/predict').send({ inputs: { area: 1000 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MODEL_NOT_FOUND');
  });

  it('rejects malformed inputs', async () => {
    prisma.trainingRun.findUnique.mockResolvedValueOnce({ id: 'run_1', status: 'COMPLETED', taskType: 'regression' });
    const res = await request(app).post('/api/v1/models/run_1/predict').send({ inputs: 'not-an-object' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
