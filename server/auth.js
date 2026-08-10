const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, ensureDataDir } = require('./content');

const ADMIN_PATH = path.join(DATA_DIR, 'admin.json');
const COOKIE = 'wx_admin';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function scryptHash(key) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(key, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function scryptVerify(key, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(key, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function readAdmin() {
  ensureDataDir();
  if (!fs.existsSync(ADMIN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(ADMIN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function hasAdmin() {
  const a = readAdmin();
  return !!(a && a.keyHash);
}

function setupKey(key) {
  if (!key || String(key).length < 8) {
    const err = new Error('المفتاح يجب أن يكون 8 أحرف على الأقل');
    err.status = 400;
    throw err;
  }
  if (hasAdmin()) {
    const err = new Error('المفتاح مُنشأ مسبقاً');
    err.status = 409;
    throw err;
  }
  ensureDataDir();
  const keyHash = scryptHash(String(key));
  const sessionSecret = crypto.randomBytes(32).toString('hex');
  const data = { keyHash, sessionSecret, createdAt: new Date().toISOString() };
  const tmp = ADMIN_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, ADMIN_PATH);
  return true;
}

function signSession(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifySession(secret, token) {
  if (!token || !secret) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function login(key) {
  const admin = readAdmin();
  if (!admin || !admin.keyHash) {
    const err = new Error('لم يُنشأ مفتاح بعد');
    err.status = 400;
    throw err;
  }
  if (!scryptVerify(String(key || ''), admin.keyHash)) {
    const err = new Error('مفتاح غير صحيح');
    err.status = 401;
    throw err;
  }
  const token = signSession(admin.sessionSecret, {
    role: 'admin',
    exp: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function requireAdmin(req, res, next) {
  const admin = readAdmin();
  if (!admin || !admin.sessionSecret) {
    return res.status(401).json({ error: 'غير مصرّح' });
  }
  const token = req.cookies && req.cookies[COOKIE];
  const payload = verifySession(admin.sessionSecret, token);
  if (!payload) return res.status(401).json({ error: 'غير مصرّح' });
  req.admin = payload;
  next();
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

module.exports = {
  COOKIE,
  hasAdmin,
  setupKey,
  login,
  requireAdmin,
  setSessionCookie,
  clearSessionCookie,
  readAdmin,
  verifySession,
};
