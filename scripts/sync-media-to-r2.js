#!/usr/bin/env node
// Uploads everything in uploads/ to the R2 bucket that backs the site's media.
//
// R2 owns media at runtime: the admin dashboard lists, uploads and deletes
// objects there. uploads/ is only the seed/backup copy kept in git, so run this
// once after creating the bucket, or whenever you restore from git.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const BUCKET = 'wexon-media';

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
};

const files = fs
  .readdirSync(UPLOAD_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.'));

if (!files.length) {
  console.log('uploads/ is empty — nothing to sync.');
  process.exit(0);
}

let done = 0;
for (const entry of files) {
  const ext = path.extname(entry.name).toLowerCase();
  const args = [
    'wrangler', 'r2', 'object', 'put', `${BUCKET}/${entry.name}`,
    '--file', path.join(UPLOAD_DIR, entry.name),
    '--remote',
  ];
  if (MIME[ext]) args.push('--content-type', MIME[ext]);

  process.stdout.write(`(${++done}/${files.length}) ${entry.name} ... `);
  execFileSync('npx', args, { stdio: ['ignore', 'ignore', 'inherit'], shell: true });
  console.log('ok');
}

console.log(`\nsynced ${done} file(s) to r2://${BUCKET}`);
