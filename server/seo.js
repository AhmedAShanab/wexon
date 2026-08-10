const { readContent } = require('./content');

function getSeo(content) {
  const c = content || {};
  const site = c.site || {};
  const seo = c.seo || {};
  const geo = seo.geo || {};
  return { site, seo, geo };
}

function absUrl(canonical, pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = String(canonical || '').replace(/\/$/, '');
  if (!base) return pathOrUrl;
  return base + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl);
}

function sameAsList(geo) {
  const raw = geo.sameAs || '';
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return String(raw)
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildJsonLd(content, origin) {
  const { site, seo, geo } = getSeo(content);
  const brand = site.brand || 'Wexon';
  const url = seo.canonical || origin || '';
  const desc = seo.description || geo.summary || '';
  const logo = absUrl(url, seo.ogImage || '');
  const sameAs = sameAsList(geo);
  const org = {
    '@type': geo.organizationType || 'ProfessionalService',
    name: brand,
    url: url || undefined,
    description: geo.summary || desc || undefined,
    email: geo.email || undefined,
    foundingDate: geo.foundingDate || undefined,
    areaServed: geo.areaServed || undefined,
    logo: logo || undefined,
    image: logo || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  };
  const graph = [
    {
      '@type': 'WebSite',
      name: brand,
      url: url || undefined,
      description: desc || undefined,
      inLanguage: (seo.locale || 'ar').split('_')[0],
      publisher: { '@id': url ? url + '#org' : undefined },
    },
    { '@id': url ? url + '#org' : undefined, ...org },
  ];
  const faqs = Array.isArray(geo.faqs) ? geo.faqs.filter((f) => f && f.q && f.a) : [];
  if (faqs.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }
  return {
    '@context': 'https://schema.org',
    '@graph': graph.filter((n) => n && (n['@type'] || n['@id'])),
  };
}

function buildLlmsTxt(content) {
  const { site, seo, geo } = getSeo(content);
  if (geo.llmsTxt && String(geo.llmsTxt).trim()) return String(geo.llmsTxt).trim() + '\n';
  const brand = site.brand || 'Wexon';
  const lines = [
    '# ' + brand,
    '',
    '> ' + (geo.summary || seo.description || 'Creative agency.'),
    '',
    '## Site',
    '- Home: ' + (seo.canonical || '/'),
    '- Contact WhatsApp: ' + (site.whatsapp || ''),
    '',
    '## Services',
  ];
  (content.services || []).forEach((s) => {
    lines.push('- ' + (s.title || '') + ': ' + (s.description || ''));
  });
  const faqs = Array.isArray(geo.faqs) ? geo.faqs : [];
  if (faqs.length) {
    lines.push('', '## FAQ');
    faqs.forEach((f) => {
      if (!f || !f.q) return;
      lines.push('### ' + f.q);
      lines.push(f.a || '');
      lines.push('');
    });
  }
  lines.push('', '## Social');
  sameAsList(geo).forEach((u) => lines.push('- ' + u));
  Object.entries((site.socials || {})).forEach(([k, v]) => {
    if (v && v !== '#') lines.push('- ' + k + ': ' + v);
  });
  return lines.join('\n') + '\n';
}

function buildRobotsTxt(content, origin) {
  const { seo, geo } = getSeo(content);
  const index = seo.robotsIndex !== false;
  const lines = ['User-agent: *', index ? 'Allow: /' : 'Disallow: /', 'Disallow: /admin', 'Disallow: /api/admin'];
  if (geo.allowGptBot === false) {
    lines.push('', 'User-agent: GPTBot', 'Disallow: /');
  }
  if (geo.allowGoogleExtended === false) {
    lines.push('', 'User-agent: Google-Extended', 'Disallow: /');
  }
  if (geo.allowPerplexity === false) {
    lines.push('', 'User-agent: PerplexityBot', 'Disallow: /');
  }
  const sitemap = seo.canonical ? seo.canonical.replace(/\/$/, '') + '/sitemap.xml' : origin ? origin + '/sitemap.xml' : '';
  if (sitemap) lines.push('', 'Sitemap: ' + sitemap);
  return lines.join('\n') + '\n';
}

function buildSitemapXml(content) {
  const { seo } = getSeo(content);
  const base = (seo.canonical || '').replace(/\/$/, '') || 'http://localhost:3000';
  const urls = ['/', '/gallery', '/video-gallery'];
  const works = content.works || {};
  (works.images || []).forEach((w) => {
    if (w && w.published !== false) urls.push('/work/' + encodeURIComponent(w.slug || w.id));
  });
  (works.videos || []).forEach((w) => {
    if (w && w.published !== false) urls.push('/film/' + encodeURIComponent(w.slug || w.id));
  });
  const body = urls
    .map((u) => {
      const loc = base + (u === '/' ? '/' : u);
      return '  <url>\n    <loc>' + loc + '</loc>\n    <changefreq>weekly</changefreq>\n  </url>';
    })
    .join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n';
}

function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function injectSeoHead(html, content, origin) {
  const { site, seo, geo } = getSeo(content);
  const brand = site.brand || 'Wexon';
  const title = seo.title || brand;
  const desc = seo.description || geo.summary || '';
  const canonical = seo.canonical || origin || '';
  const ogImage = absUrl(canonical, seo.ogImage || '');
  const locale = seo.locale || 'ar_SA';
  const lang = locale.split('_')[0] || 'ar';
  const robots = [(seo.robotsIndex === false ? 'noindex' : 'index'), (seo.robotsFollow === false ? 'nofollow' : 'follow')].join(', ');
  const jsonLd = JSON.stringify(buildJsonLd(content, origin || canonical));

  let out = html;
  if (/<html[^>]*>/i.test(out)) {
    out = out.replace(/<html([^>]*)>/i, '<html$1 lang="' + escAttr(lang) + '" dir="rtl">');
  }
  const block = [
    '<title>' + escAttr(title) + '</title>',
    '<meta name="description" content="' + escAttr(desc) + '">',
    seo.keywords ? '<meta name="keywords" content="' + escAttr(seo.keywords) + '">' : '',
    '<meta name="robots" content="' + escAttr(robots) + '">',
    '<meta name="author" content="' + escAttr(brand) + '">',
    canonical ? '<link rel="canonical" href="' + escAttr(canonical) + '">' : '',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="' + escAttr(brand) + '">',
    '<meta property="og:title" content="' + escAttr(seo.ogTitle || title) + '">',
    '<meta property="og:description" content="' + escAttr(seo.ogDescription || desc) + '">',
    '<meta property="og:locale" content="' + escAttr(locale) + '">',
    canonical ? '<meta property="og:url" content="' + escAttr(canonical) + '">' : '',
    ogImage ? '<meta property="og:image" content="' + escAttr(ogImage) + '">' : '',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + escAttr(seo.ogTitle || title) + '">',
    '<meta name="twitter:description" content="' + escAttr(seo.ogDescription || desc) + '">',
    ogImage ? '<meta name="twitter:image" content="' + escAttr(ogImage) + '">' : '',
    geo.summary ? '<meta name="geo:summary" content="' + escAttr(geo.summary) + '">' : '',
    '<script type="application/ld+json" id="wx-jsonld">' + jsonLd.replace(/</g, '\\u003c') + '</script>',
    '<!-- /wexon-seo -->',
  ]
    .filter(Boolean)
    .join('\n');

  if (out.includes('<!-- /wexon-seo -->')) {
    out = out.replace(/<!-- wexon-seo -->[\s\S]*?<!-- \/wexon-seo -->/, '<!-- wexon-seo -->\n' + block);
  } else if (out.includes('</head>')) {
    out = out.replace('</head>', '<!-- wexon-seo -->\n' + block + '\n</head>');
  }
  return out;
}

module.exports = {
  getSeo,
  buildJsonLd,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  injectSeoHead,
};
