const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
// Everything served to the browser lives here; it is also the directory
// published to Cloudflare as static assets (see wrangler.toml).
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONTENT_PATH = path.join(DATA_DIR, 'content.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readContent() {
  ensureDataDir();
  const raw = fs.readFileSync(CONTENT_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeContent(data) {
  ensureDataDir();
  const tmp = CONTENT_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, CONTENT_PATH);
  return data;
}

module.exports = { ROOT, PUBLIC_DIR, DATA_DIR, CONTENT_PATH, readContent, writeContent, ensureDataDir };
