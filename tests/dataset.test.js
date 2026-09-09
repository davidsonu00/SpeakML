jest.mock('../src/config/prismaClient', () => require('./helpers/mockPrisma').createMockPrisma());

const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/prismaClient');

const SAMPLE_CSV = path.join(__dirname, 'fixtures', 'sample.csv');
const DUPLICATE_CSV = path.join(__dirname, 'fixtures', 'duplicate_columns.csv');

describe('POST /api/v1/projects/:id/dataset', () => {
  it('uploads a valid CSV and computes real metadata (rows, columns, missing values)', async () => {
    prisma.project.findUnique.mockResolvedValueOnce({ id: 'proj_1', status: 'CREATED' });
    prisma.dataset.create.mockImplementationOnce(({ data }) => Promise.resolve({ id: 'ds_1', ...data }));
    prisma.project.update.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/v1/projects/proj_1/dataset')
      .attach('dataset', SAMPLE_CSV);

    expect(res.status).toBe(201);
    expect(res.body.data.rows).toBe(4); // 4 data rows, 1 header row
    expect(res.body.data.columns).toBe(4); // area, bedrooms, bathrooms, price
    expect(res.body.data.metadata.missingValueCounts.area).toBe(1);
    expect(res.body.data.metadata.missingValueCounts.bathrooms).toBe(0);
    expect(res.body.data.metadata.totalMissingValues).toBe(2); // 1 missing area + 1 missing price
  });

  it('rejects a CSV with duplicate column names', async () => {
    prisma.project.findUnique.mockResolvedValueOnce({ id: 'proj_1', status: 'CREATED' });

    const res = await request(app)
      .post('/api/v1/projects/proj_1/dataset')
      .attach('dataset', DUPLICATE_CSV);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DATASET_INVALID');
    expect(res.body.error.message).toMatch(/Duplicate column/);
  });

  it('rejects a non-CSV file', async () => {
    const res = await request(app)
      .post('/api/v1/projects/proj_1/dataset')
      .attach('dataset', Buffer.from('not a csv'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DATASET_INVALID');
  });

  it('returns 404 PROJECT_NOT_FOUND for an unknown project', async () => {
    prisma.project.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/v1/projects/ghost/dataset')
      .attach('dataset', SAMPLE_CSV);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('GET /api/v1/projects/:id/dataset/preview', () => {
  it('returns a real preview (columns + sample rows) after a real upload', async () => {
    prisma.project.findUnique.mockResolvedValueOnce({ id: 'proj_1', status: 'CREATED' });
    let savedDataset;
    prisma.dataset.create.mockImplementationOnce(({ data }) => {
      savedDataset = { id: 'ds_1', ...data };
      return Promise.resolve(savedDataset);
    });
    prisma.project.update.mockResolvedValueOnce({});

    // Real upload, so a real file lands in the (test-only) storage folder.
    await request(app).post('/api/v1/projects/proj_1/dataset').attach('dataset', SAMPLE_CSV);

    prisma.dataset.findFirst.mockResolvedValueOnce(savedDataset);
    prisma.dataset.findUnique.mockResolvedValueOnce(savedDataset);

    const res = await request(app).get('/api/v1/projects/proj_1/dataset/preview');

    expect(res.status).toBe(200);
    expect(res.body.data.columns).toEqual(['area', 'bedrooms', 'bathrooms', 'price']);
    expect(res.body.data.sampleRows).toHaveLength(4);
    expect(res.body.data.totalRows).toBe(4);
    expect(res.body.data.detectedTargetColumn).toBeNull();
  });
});
