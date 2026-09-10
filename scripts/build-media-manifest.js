#!/usr/bin/env node
// Regenerates data/media-manifest.json from the contents of uploads/.
//
// Media ships as Cloudflare static assets, which offer no runtime listing API,
// so the admin media library reads this manifest instead. Run this after adding
// or removing files in uploads/, then commit the result.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads');
const OUT_FILE = path.join(ROOT, 'data', 'media-manifest.json');

const items = fs
  .readdirSync(UPLOAD_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
  .map((entry) => {
    const stat = fs.statSync(path.join(UPLOAD_DIR, entry.name));
    return {
      name: entry.name,
      url: '/uploads/' + entry.name,
      size: stat.size,
      mtime: Math.round(stat.mtimeMs),
    };
  })
  .sort((a, b) => b.mtime - a.mtime);

fs.writeFileSync(OUT_FILE, JSON.stringify(items, null, 2) + '\n');
console.log(`media-manifest: ${items.length} files -> ${path.relative(ROOT, OUT_FILE)}`);
