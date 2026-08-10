const fs = require('fs');
const path = require('path');
const { DATA_DIR, ensureDataDir } = require('./content');

const VISITS_PATH = path.join(DATA_DIR, 'visits.jsonl');

function appendVisit(entry) {
  ensureDataDir();
  fs.appendFileSync(VISITS_PATH, JSON.stringify(entry) + '\n', 'utf8');
}

function trackMiddleware(req, res, next) {
  const p = req.path || '';
  if (
    p.startsWith('/api') ||
    p.startsWith('/admin') ||
    p.startsWith('/uploads') ||
    p === '/support.js' ||
    p.endsWith('.js') ||
    p.endsWith('.css') ||
    p.endsWith('.map') ||
    p.endsWith('.ico') ||
    p.endsWith('.png') ||
    p.endsWith('.jpg') ||
    p.endsWith('.webp') ||
    p.endsWith('.svg')
  ) {
    return next();
  }
  // Only count document navigations roughly (HTML / root)
  const accept = String(req.headers.accept || '');
  if (!accept.includes('text/html') && p !== '/' && !p.endsWith('.html')) {
    return next();
  }
  try {
    appendVisit({
      ts: Date.now(),
      path: p === '/' ? '/' : p,
      ref: req.get('referer') || '',
      ua: req.get('user-agent') || '',
      ip: req.ip,
    });
  } catch (_) {}
  next();
}

function readVisits(limitLines) {
  ensureDataDir();
  if (!fs.existsSync(VISITS_PATH)) return [];
  const raw = fs.readFileSync(VISITS_PATH, 'utf8');
  if (!raw.trim()) return [];
  const lines = raw.trim().split('\n');
  const slice = limitLines ? lines.slice(-limitLines) : lines;
  const out = [];
  for (const line of slice) {
    try {
      out.push(JSON.parse(line));
    } catch (_) {}
  }
  return out;
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getStats() {
  const visits = readVisits(50000);
  const now = Date.now();
  const day = 86400000;
  const today0 = startOfDay(now);
  const week0 = today0 - 6 * day;
  const month0 = today0 - 29 * day;

  let today = 0;
  let week = 0;
  let month = 0;
  const byDay = {};
  const byPath = {};

  for (let i = 0; i < 7; i++) {
    byDay[String(today0 - (6 - i) * day)] = 0;
  }

  for (const v of visits) {
    const t = v.ts || 0;
    if (t >= today0) today++;
    if (t >= week0) week++;
    if (t >= month0) month++;
    if (t >= week0) {
      const key = String(startOfDay(t));
      if (byDay[key] !== undefined) byDay[key]++;
    }
    const p = v.path || '/';
    byPath[p] = (byPath[p] || 0) + 1;
  }

  const last7 = Object.keys(byDay)
    .sort()
    .map((k) => ({ date: Number(k), count: byDay[k] }));

  const topPages = Object.entries(byPath)
    .map(([pathName, count]) => ({ path: pathName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total: visits.length,
    today,
    week,
    month,
    last7,
    topPages,
  };
}

module.exports = { trackMiddleware, appendVisit, getStats, readVisits };
