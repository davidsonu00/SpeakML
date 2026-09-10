// A hand-written stand-in for @prisma/client's generated client. Every
// method returns a jest.fn() so individual tests can call
// `.mockResolvedValueOnce(...)` to control exactly what "the database"
// returns for that one call, without needing a real MySQL connection —
// which is unavailable in this sandbox anyway (see the project README's
// note on the binaries.prisma.sh network restriction).

function createMockPrisma() {
  const model = () => ({
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  });

  return {
    project: model(),
    dataset: model(),
    trainingRun: model(),
    modelArtifact: model(),
  };
}

module.exports = { createMockPrisma };
