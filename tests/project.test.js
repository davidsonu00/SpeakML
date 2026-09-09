jest.mock('../src/config/prismaClient', () => require('./helpers/mockPrisma').createMockPrisma());

const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/prismaClient');

describe('POST /api/v1/projects', () => {
  it('creates a project from a prompt', async () => {
    prisma.project.create.mockResolvedValueOnce({
      id: 'proj_1',
      name: 'predict house prices',
      prompt: 'predict house prices',
      status: 'CREATED',
    });

    const res = await request(app).post('/api/v1/projects').send({ prompt: 'predict house prices' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('proj_1');
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { name: 'predict house prices', prompt: 'predict house prices', status: 'CREATED' },
    });
  });

  it('rejects an empty prompt with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/v1/projects').send({ prompt: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(prisma.project.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/projects/:id', () => {
  it('returns 404 PROJECT_NOT_FOUND when the project does not exist', async () => {
    prisma.project.findUnique.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v1/projects/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns the project when it exists', async () => {
    prisma.project.findUnique.mockResolvedValueOnce({
      id: 'proj_1',
      name: 'x',
      prompt: 'x',
      status: 'CREATED',
      datasets: [],
      trainingRuns: [],
    });
    const res = await request(app).get('/api/v1/projects/proj_1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('proj_1');
  });
});
