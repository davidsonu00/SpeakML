// The ONE file the rest of the app imports (`require('../services/storage')`).
// Nobody outside this folder should know whether files live on local disk
// or in S3 — that's the whole point of the abstraction (section 14).

const env = require('../../config/env');
const localStorage = require('./localStorage');

const implementations = {
  local: localStorage,
  // object: require('./objectStorage'),  // added when moving to S3/Supabase
};

const active = implementations[env.storage.type];

if (!active) {
  throw new Error(`Unknown STORAGE_TYPE: '${env.storage.type}'`);
}

module.exports = active;
