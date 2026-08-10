const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ROOT } = require('./content');

const UPLOAD_DIR = path.join(ROOT, 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    const safe = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, safe + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okMime = /^(image\/(jpeg|png|gif|webp|svg\+xml)|video\/(mp4|webm|quicktime|x-m4v|ogg))$/.test(mime);
    const okExt = /^\.(jpe?g|png|gif|webp|svg|mp4|webm|mov|m4v)$/.test(ext);
    const ok = okMime || (mime === 'application/octet-stream' && okExt) || okExt;
    cb(ok ? null : new Error('نوع ملف غير مدعوم — استخدم صورة أو فيديو mp4/webm/mov'), ok);
  },
});

function listMedia() {
  ensureUploadDir();
  return fs
    .readdirSync(UPLOAD_DIR)
    .filter((f) => f !== '.gitkeep')
    .map((name) => {
      const full = path.join(UPLOAD_DIR, name);
      const st = fs.statSync(full);
      return {
        name,
        url: '/uploads/' + name,
        size: st.size,
        mtime: st.mtimeMs,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function deleteMedia(name) {
  const base = path.basename(String(name || ''));
  if (!base || base === '.gitkeep' || base.includes('..')) {
    const err = new Error('اسم ملف غير صالح');
    err.status = 400;
    throw err;
  }
  const full = path.join(UPLOAD_DIR, base);
  if (!fs.existsSync(full)) {
    const err = new Error('الملف غير موجود');
    err.status = 404;
    throw err;
  }
  fs.unlinkSync(full);
  return true;
}

module.exports = { UPLOAD_DIR, upload, listMedia, deleteMedia, ensureUploadDir };
