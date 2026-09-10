// @ts-nocheck

import mediaManifest from '../../../data/media-manifest.json';

interface Env {
  DB: any;
  ASSETS: any;
  SITE_URL: string;
}

const textEncoder = new TextEncoder();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const ADMIN_COOKIE = 'wx_admin';

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init?.headers || {}) },
    ...init,
  });

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

const emptyContent = {
  site: {},
  hero: {},
  works: {},
  services: [],
  seo: {},
  team: [],
  partners: {},
  testimonials: [],
  contact: {},
  footer: {},
};

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function b64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64UrlDecode(input: string) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return toHex(new Uint8Array(digest));
}

async function randomHex(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || '';
  for (const pair of cookie.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return null;
}

function setCookieHeader(name: string, value: string, options: Record<string, string | number | boolean> = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  if (options.expires) parts.push(`Expires=${options.expires}`);
  return parts.join('; ');
}

function clearCookieHeader(name: string) {
  return setCookieHeader(name, '', {
    path: '/',
    expires: 'Thu, 01 Jan 1970 00:00:00 GMT',
    maxAge: 0,
  });
}

async function getAdminSettings(env: Env) {
  const row = await env.DB.prepare(
    'SELECT id, key_hash, session_secret FROM admin_settings ORDER BY id DESC LIMIT 1'
  ).first<any>();
  return row || null;
}

async function readContentFromDb(env: Env) {
  const row = await env.DB.prepare(
    'SELECT payload FROM site_content WHERE key = ?'
  ).bind('content').first<{ payload: string }>();

  if (!row) return structuredClone(emptyContent);

  try {
    return JSON.parse(row.payload);
  } catch {
    return structuredClone(emptyContent);
  }
}

async function writeContentToDb(env: Env, data: any) {
  await env.DB.prepare(
    'INSERT INTO site_content (key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at'
  ).bind('content', JSON.stringify(data, null, 2), Date.now()).run();
}

async function signSession(secret: string, payload: any) {
  const body = b64UrlEncode(textEncoder.encode(JSON.stringify(payload)));
  const signature = await sha256Hex(`${secret}.${body}`);
  return `${body}.${signature}`;
}

async function verifySession(secret: string, token: string | null) {
  if (!secret || !token) return null;
  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;
  const expected = await sha256Hex(`${secret}.${body}`);
  if (expected !== signature) return null;

  try {
    const raw = JSON.parse(new TextDecoder().decode(b64UrlDecode(body)));
    if (!raw.exp || Date.now() > raw.exp) return null;
    return raw;
  } catch {
    return null;
  }
}

async function getAuthState(request: Request, env: Env) {
  const admin = await getAdminSettings(env);
  if (!admin) {
    return { setupRequired: true, authenticated: false };
  }

  const token = getCookie(request, ADMIN_COOKIE);
  const authenticated = !!(await verifySession(admin.session_secret, token));

  return {
    setupRequired: false,
    authenticated,
  };
}

async function requireAdmin(request: Request, env: Env) {
  const admin = await getAdminSettings(env);
  if (!admin) {
    return { ok: false, status: 401, error: 'غير مصرح' };
  }

  const token = getCookie(request, ADMIN_COOKIE); 
  const payload = await verifySession(admin.session_secret, token);
  if (!payload) {
    return { ok: false, status: 401, error: 'غير مصرح' };
  }

  return { ok: true, admin: payload };
}

async function computeStats(env: Env) {
  const rows = await env.DB.prepare(
    'SELECT ts, path FROM visits ORDER BY ts DESC'
  ).all<any>();

  const visits = rows.results || [];
  const now = Date.now();
  const day = 86400000;
  const today0 = startOfDay(now);
  const week0 = today0 - 6 * day;
  const month0 = today0 - 29 * day;

  let today = 0;
  let week = 0;
  let month = 0;
  const byDay: Record<string, number> = {};
  const byPath: Record<string, number> = {};

  for (let i = 0; i < 7; i++) {
    byDay[String(today0 - (6 - i) * day)] = 0;
  }

  for (const item of visits) {
    const ts = Number(item.ts || 0);
    if (ts >= today0) today++;
    if (ts >= week0) week++;
    if (ts >= month0) month++;
    if (ts >= week0) {
      const key = String(startOfDay(ts));
      if (byDay[key] !== undefined) byDay[key]++;
    }

    const p = item.path || '/';
    byPath[p] = (byPath[p] || 0) + 1;
  }

  return {
    total: visits.length,
    today,
    week,
    month,
    last7: Object.keys(byDay)
      .sort()
      .map((k) => ({ date: Number(k), count: byDay[k] })),
    topPages: Object.entries(byPath)
      .map(([pathName, count]) => ({ path: pathName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Media ships as static assets, which expose no runtime listing API, so the
// admin library reads the manifest bundled at build time. Regenerate it with
// `npm run media:manifest` after changing uploads/.
function listMedia() {
  return mediaManifest;
}

function sanitizeFileName(name: string) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  if (!base || base === '.' || base.includes('..')) {
    throw new Error('اسم ملف غير صالح');
  }
  return base;
}

function isValidMediaType(file: File) {
  const mime = String(file.type || '').toLowerCase();
  const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
  const okMime = /^(image\/(jpeg|png|gif|webp|svg\+xml)|video\/(mp4|webm|quicktime|x-m4v|ogg))$/.test(mime);
  const okExt = /^(jpe?g|png|gif|webp|svg|mp4|webm|mov|m4v)$/.test(ext);
  return okMime || okExt;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /uploads/* is served directly from static assets before the Worker runs.

    if (url.pathname === '/api/content' && request.method === 'GET') {
      const content = await readContentFromDb(env);
      return json(content);
    }

    if (url.pathname === '/api/admin/status' && request.method === 'GET') {
      return json(await getAuthState(request, env));
    }

    if (url.pathname === '/api/visits/track' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        await env.DB.prepare(
          'INSERT INTO visits (path, ref, ua, ip, ts) VALUES (?, ?, ?, ?, ?)'
        ).bind(
          body?.path || '/',
          body?.ref || '',
          request.headers.get('user-agent') || '',
          request.headers.get('cf-connecting-ip') || '',
          Date.now()
        ).run();
        return json({ ok: true });
      } catch {
        return json({ error: 'فشل التسجيل' }, { status: 500 });
      }
    }

    if (url.pathname === '/api/admin/setup' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const key = String(body?.key || '');

        if (key.length < 8) {
          return json({ error: 'المفتاح يجب أن يكون 8 أحرف على الأقل' }, { status: 400 });
        }

        const existing = await getAdminSettings(env);
        if (existing) {
          return json({ error: 'المفتاح مُنشأ مسبقاً' }, { status: 409 });
        }

        const keyHash = await sha256Hex(key);
        const sessionSecret = await randomHex(32);

        await env.DB.prepare(
          'INSERT INTO admin_settings (key_hash, session_secret, created_at) VALUES (?, ?, ?)'
        ).bind(keyHash, sessionSecret, Date.now()).run();

        const token = await signSession(sessionSecret, {
          role: 'admin',
          exp: Date.now() + SESSION_TTL_MS,
        });

        return json(
          { ok: true },
          {
            headers: {
              'Set-Cookie': setCookieHeader(ADMIN_COOKIE, token, {
                path: '/',
                httpOnly: true,
                sameSite: 'Strict',
                maxAge: Math.floor(SESSION_TTL_MS / 1000),
              }),
            },
          }
        );
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'فشل الإعداد' }, { status: 500 });
      }
    }

    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const key = String(body?.key || '');
        const admin = await getAdminSettings(env);

        if (!admin) {
          return json({ error: 'لم يُنشأ مفتاح بعد' }, { status: 400 });
        }

        const keyHash = await sha256Hex(key);
        if (keyHash !== admin.key_hash) {
          return json({ error: 'مفتاح غير صحيح' }, { status: 401 });
        }

        const token = await signSession(admin.session_secret, {
          role: 'admin',
          exp: Date.now() + SESSION_TTL_MS,
        });

        return json(
          { ok: true },
          {
            headers: {
              'Set-Cookie': setCookieHeader(ADMIN_COOKIE, token, {
                path: '/',
                httpOnly: true,
                sameSite: 'Strict',
                maxAge: Math.floor(SESSION_TTL_MS / 1000),
              }),
            },
          }
        );
      } catch {
        return json({ error: 'فشل الدخول' }, { status: 500 });
      }
    }

    if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
      return json(
        { ok: true },
        {
          headers: {
            'Set-Cookie': clearCookieHeader(ADMIN_COOKIE),
          },
        }
      );
    }

    if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
      const auth = await requireAdmin(request, env);
      if (!auth.ok) {
        return json({ error: auth.error }, { status: auth.status });
      }

      return json(await computeStats(env));
    }

    if (url.pathname === '/api/admin/content' && request.method === 'PUT') {
      const auth = await requireAdmin(request, env);
      if (!auth.ok) {
        return json({ error: auth.error }, { status: auth.status });
      }

      try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
          return json({ error: 'بيانات غير صالحة' }, { status: 400 });
        }
        await writeContentToDb(env, body);
        return json({ ok: true });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'فشل الحفظ' }, { status: 500 });
      }
    }

    if (url.pathname === '/api/admin/media' && request.method === 'GET') {
      const auth = await requireAdmin(request, env);
      if (!auth.ok) {
        return json({ error: auth.error }, { status: auth.status });
      }

      const items = listMedia();
      return json({ items });
    }

    if (url.pathname === '/api/admin/media' && request.method === 'POST') {
      const auth = await requireAdmin(request, env);
      if (!auth.ok) {
        return json({ error: auth.error }, { status: auth.status });
      }

      return json(
        { error: 'الرفع من لوحة التحكم غير متاح — الوسائط تُنشر كملفات ثابتة. أضف الملف إلى uploads/ ثم شغّل npm run media:manifest واعمل commit.' },
        { status: 501 }
      );
    }

    if (url.pathname.startsWith('/api/admin/media/') && request.method === 'DELETE') {
      const auth = await requireAdmin(request, env);
      if (!auth.ok) {
        return json({ error: auth.error }, { status: auth.status });
      }

      return json(
        { error: 'الحذف من لوحة التحكم غير متاح — الوسائط تُنشر كملفات ثابتة. احذف الملف من uploads/ ثم شغّل npm run media:manifest واعمل commit.' },
        { status: 501 }
      );
    }

    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nAllow: /\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === '/sitemap.xml') {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${env.SITE_URL}</loc></url>\n</urlset>`,
        {
          headers: { 'content-type': 'application/xml; charset=utf-8' },
        }
      );
    }

    if (url.pathname === '/llms.txt') {
      return new Response('# Wexon\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    // Unmatched paths (including "/") fall back to the landing page: it lives
    // at Landing.dc.html, not at an index.html the asset router would find.
    return env.ASSETS.fetch(new Request(new URL('/Landing.dc.html', url.origin), { method: 'GET' }));
  },
};
