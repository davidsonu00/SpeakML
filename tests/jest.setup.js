// Runs before any test file loads. Setting STORAGE_PATH here means
// env.js (loaded later, indirectly, when app.js is required) picks up a
// dedicated test storage folder instead of touching real storage/ — dotenv
// never overwrites a variable that's already set in process.env.

process.env.STORAGE_PATH = './storage-test';
process.env.ML_MODE = 'mock';
