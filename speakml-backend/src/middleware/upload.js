// Multer writes the uploaded file to a temp directory on disk (NOT memory
// — see section 10's "don't load unnecessarily huge files entirely into
// memory"), and we move it into permanent storage afterwards via the
// storage service. Restricting to .csv by both extension AND mimetype
// blocks the easy bypass of just renaming a .exe to .csv.

const multer = require('multer');
const os = require('os');
const path = require('path');
const env = require('../config/env');

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: env.maxFileSizeBytes },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimeTypes = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'];
    if (ext !== '.csv' || !allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
});

module.exports = upload;
