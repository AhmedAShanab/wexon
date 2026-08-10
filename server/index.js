const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { ROOT, readContent, writeContent } = require('./content');
const {
  hasAdmin,
  setupKey,
  login,
  requireAdmin,
  setSessionCookie,
  clearSessionCookie,
  readAdmin,
  verifySession,
  COOKIE,
} = require('./auth');
const { trackMiddleware, getStats, appendVisit } = require('./analytics');
const { upload, listMedia, deleteMedia, UPLOAD_DIR, ensureUploadDir } = require('./media');
const fs = require('fs');
const {
  injectSeoHead,
  buildRobotsTxt,
  buildLlmsTxt,
  buildSitemapXml,
} = require('./seo');

const PORT = Number(process.env.PORT) || 3000;
const app = express();

function requestOrigin(req) {
  const host = req.get('host');
  if (!host) return '';
  const proto = req.protocol || 'http';
  return proto + '://' + host;
}

ensureUploadDir();

app.set('trust proxy', 1);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(trackMiddleware);

app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/admin', express.static(path.join(ROOT, 'admin')));
app.use('/gallery-assets', express.static(path.join(ROOT, 'gallery')));
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(ROOT, 'admin', 'index.html'));
});
app.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(ROOT, 'admin', 'index.html'));
});

app.get('/api/content', (_req, res) => {
  try {
    res.json(readContent());
  } catch (e) {
    res.status(500).json({ error: 'تعذّر قراءة المحتوى' });
  }
});

app.post('/api/visits/track', (req, res) => {
  try {
    appendVisit({
      ts: Date.now(),
      path: (req.body && req.body.path) || '/',
      ref: (req.body && req.body.ref) || req.get('referer') || '',
      ua: req.get('user-agent') || '',
      ip: req.ip,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'فشل التسجيل' });
  }
});

app.get('/api/admin/status', (req, res) => {
  const admin = readAdmin();
  const token = req.cookies && req.cookies[COOKIE];
  const session = admin && admin.sessionSecret ? verifySession(admin.sessionSecret, token) : null;
  res.json({
    setupRequired: !hasAdmin(),
    authenticated: !!session,
  });
});

app.post('/api/admin/setup', (req, res) => {
  try {
    setupKey(req.body && req.body.key);
    const token = login(req.body.key);
    setSessionCookie(res, token);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'فشل الإعداد' });
  }
});

app.post('/api/admin/login', (req, res) => {
  try {
    const token = login(req.body && req.body.key);
    setSessionCookie(res, token);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'فشل الدخول' });
  }
});

app.post('/api/admin/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, (_req, res) => {
  try {
    res.json(getStats());
  } catch {
    res.status(500).json({ error: 'فشل الإحصائيات' });
  }
});

app.put('/api/admin/content', requireAdmin, (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'بيانات غير صالحة' });
    }
    writeContent(req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'فشل الحفظ' });
  }
});

app.get('/api/admin/media', requireAdmin, (_req, res) => {
  try {
    res.json({ items: listMedia() });
  } catch (e) {
    res.status(500).json({ error: e.message || 'فشل القراءة' });
  }
});

app.post('/api/admin/media', requireAdmin, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'فشل الرفع' });
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    res.json({
      ok: true,
      name: req.file.filename,
      url: '/uploads/' + req.file.filename,
      size: req.file.size,
    });
  });
});

app.delete('/api/admin/media/:name', requireAdmin, (req, res) => {
  try {
    deleteMedia(req.params.name);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'فشل الحذف' });
  }
});

app.get('/support.js', (_req, res) => {
  res.sendFile(path.join(ROOT, 'support.js'));
});

app.get('/robots.txt', (req, res) => {
  try {
    res.type('text/plain').send(buildRobotsTxt(readContent(), requestOrigin(req)));
  } catch {
    res.type('text/plain').send('User-agent: *\nAllow: /\n');
  }
});

app.get('/llms.txt', (_req, res) => {
  try {
    res.type('text/plain; charset=utf-8').send(buildLlmsTxt(readContent()));
  } catch {
    res.status(500).type('text/plain').send('Error');
  }
});

app.get('/sitemap.xml', (req, res) => {
  try {
    res.type('application/xml').send(buildSitemapXml(readContent()));
  } catch {
    res.status(500).send('Error');
  }
});

function sendLanding(req, res) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'Landing.dc.html'), 'utf8');
    const html = injectSeoHead(raw, readContent(), requestOrigin(req));
    res.type('html').send(html);
  } catch (e) {
    res.sendFile(path.join(ROOT, 'Landing.dc.html'));
  }
}

function sendGallery(file, settingsKey, routePath) {
  return (req, res) => {
    try {
      const raw = fs.readFileSync(path.join(ROOT, 'gallery', file), 'utf8');
      const content = readContent();
      const settings = (content.works && content.works[settingsKey]) || {};
      const scoped = {
        ...content,
        seo: {
          ...(content.seo || {}),
          title: settings.seoTitle || settings.title || (content.seo && content.seo.title) || 'Wexon',
          description: settings.seoDescription || settings.description || (content.seo && content.seo.description) || '',
          canonical: requestOrigin(req) + routePath,
          ogTitle: settings.seoTitle || settings.title || '',
          ogDescription: settings.seoDescription || settings.description || '',
        },
      };
      res.type('html').send(injectSeoHead(raw, scoped, requestOrigin(req)));
    } catch {
      res.sendFile(path.join(ROOT, 'gallery', file));
    }
  };
}

function findWork(content, listKey, slug) {
  const arr = (content.works && content.works[listKey]) || [];
  const wanted = decodeURIComponent(String(slug || '')).toLowerCase();
  return arr.find((w) => w && w.published !== false
    && (String(w.slug || '').toLowerCase() === wanted || String(w.id || '').toLowerCase() === wanted)) || null;
}

function sendCaseStudy(kind) {
  const listKey = kind === 'film' ? 'videos' : 'images';
  const backRoute = kind === 'film' ? '/video-gallery' : '/gallery';
  return (req, res) => {
    let content = null;
    let item = null;
    try {
      content = readContent();
      item = findWork(content, listKey, req.params.slug);
    } catch {
      res.redirect(302, backRoute);
      return;
    }
    if (!item) {
      res.redirect(302, backRoute);
      return;
    }
    try {
      const raw = fs.readFileSync(path.join(ROOT, 'gallery', 'case.html'), 'utf8');
      const cs = item.caseStudy || {};
      const routePath = '/' + kind + '/' + encodeURIComponent(item.slug || item.id);
      const scoped = {
        ...content,
        seo: {
          ...(content.seo || {}),
          title: cs.seoTitle || ((item.title || 'مشروع') + ' — دراسة حالة'),
          description: cs.seoDescription || cs.intro || item.detail || '',
          canonical: requestOrigin(req) + routePath,
          ogTitle: item.title || '',
          ogDescription: cs.intro || item.detail || '',
          ogImage: item.cover || ((content.seo && content.seo.ogImage) || ''),
        },
      };
      res.type('html').send(injectSeoHead(raw, scoped, requestOrigin(req)));
    } catch {
      res.sendFile(path.join(ROOT, 'gallery', 'case.html'));
    }
  };
}

app.get('/', sendLanding);
app.get('/Landing.dc.html', sendLanding);
app.get('/gallery', sendGallery('images.html', 'gallery', '/gallery'));
app.get('/video-gallery', sendGallery('videos.html', 'videoGallery', '/video-gallery'));
app.get('/work/:slug', sendCaseStudy('work'));
app.get('/film/:slug', sendCaseStudy('film'));

app.use((_req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log('Wexon running at http://localhost:' + PORT);
  console.log('Admin at http://localhost:' + PORT + '/admin');
});
