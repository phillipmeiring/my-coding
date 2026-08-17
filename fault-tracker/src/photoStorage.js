const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'data', 'uploads');

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 3;

const ALLOWED_MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_EXTENSIONS[file.mimetype]) {
      return cb(new Error('only JPEG, PNG, GIF, and WEBP images are allowed'));
    }
    cb(null, true);
  },
});

// Files are buffered in memory by multer above, then written to disk here
// under a random name (never the client-supplied filename, to avoid path
// traversal or collisions) once we know the upload passed validation.
function savePhotos(files) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return (files || []).map((file) => {
    const filename = `${crypto.randomUUID()}${ALLOWED_MIME_EXTENSIONS[file.mimetype]}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), file.buffer);
    return filename;
  });
}

function photoPath(filename) {
  return path.join(UPLOADS_DIR, filename);
}

module.exports = { upload, savePhotos, photoPath, MAX_FILE_BYTES, MAX_FILES };
