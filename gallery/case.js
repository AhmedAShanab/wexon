(() => {
  'use strict';

  const m = location.pathname.match(/^\/(work|film)\/([^/]+)/);
  const kind = m ? m[1] : 'work';
  const slug = m ? decodeURIComponent(m[2]).toLowerCase() : '';
  const mode = kind === 'film' ? 'video' : 'image';
  const listKey = mode === 'video' ? 'videos' : 'images';
  const galleryRoute = mode === 'video' ? '/video-gallery' : '/gallery';

  document.body.dataset.caseMode = mode;

  const $ = (s) => document.querySelector(s);
  const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[c]));
  const txt = (v) => (v == null ? '' : String(v));
  const splitList = (v) => txt(v).split(/[,،]/).map((s) => s.trim()).filter(Boolean);

  function attachSource(video, src) {
    const isHls = /\.m3u8(?:$|\?)/i.test(src);
    if (isHls && window.Hls && window.Hls.isSupported()) {
      const h = new window.Hls({ enableWorker: false, capLevelToPlayerSize: true });
      h.loadSource(src);
      h.attachMedia(video);
    } else {
      video.src = src;
    }
  }

  function reveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '-40px' });
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
  }

  function workUrl(item) {
    return '/' + kind + '/' + encodeURIComponent(item.slug || item.id);
  }

  async function load() {
    let content;
    try {
      const res = await fetch('/api/content', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      content = await res.json();
    } catch (e) {
      const st = $('[data-status]');
      st.hidden = false;
      st.textContent = 'تعذّر تحميل المشروع — أعد المحاولة بعد قليل.';
      return;
    }

    const list = ((content.works && content.works[listKey]) || []).filter((w) => w && w.published !== false);
    const idx = list.findIndex((w) => String(w.slug || w.id || '').toLowerCase() === slug);
    if (idx < 0) { location.replace(galleryRoute); return; }
    const item = list[idx];
    const cs = item.caseStudy || {};

    const brand = (content.site && content.site.brand) || 'Wexon';
    document.querySelectorAll('[data-brand]').forEach((n) => { n.textContent = brand; });
    $('[data-nav-gallery]').href = galleryRoute;
    $('[data-nav-gallery]').textContent = mode === 'video' ? 'معرض الفيديو' : 'معرض التصاميم';
    $('[data-crumb-gallery]').href = galleryRoute;
    $('[data-crumb-gallery]').textContent = mode === 'video' ? 'معرض الفيديو' : 'معرض التصاميم';
    $('[data-crumb-title]').textContent = txt(item.title);

    // ----- hero -----
    const heroMedia = $('[data-hero-media]');
    const soundBtn = $('[data-sound-toggle]');
    if (mode === 'video' && item.videoUrl) {
      const v = document.createElement('video');
      v.playsInline = true;
      v.muted = true;
      v.loop = item.loop !== false;
      v.autoplay = true;
      v.preload = 'metadata';
      if (item.cover) v.poster = item.cover;
      attachSource(v, txt(item.videoUrl));
      heroMedia.appendChild(v);
      const p = v.play(); if (p) p.catch(() => {});
      soundBtn.hidden = false;
      soundBtn.addEventListener('click', () => {
        v.muted = !v.muted;
        soundBtn.setAttribute('aria-pressed', String(!v.muted));
        soundBtn.textContent = v.muted ? '🔇 الصوت' : '🔊 كتم';
        if (!v.muted) { const pp = v.play(); if (pp) pp.catch(() => {}); }
      });
    } else if (item.cover) {
      const img = document.createElement('img');
      img.src = txt(item.cover);
      img.alt = txt(item.title);
      heroMedia.appendChild(img);
    }

    $('[data-hero-tag]').textContent = txt(item.tag);
    $('[data-hero-title]').textContent = txt(item.title);

    const metaBits = [
      item.client ? ['العميل', item.client] : null,
      item.year ? ['السنة', item.year] : null,
      item.duration ? ['المدة', item.duration] : null,
    ].filter(Boolean);
    $('[data-hero-meta]').innerHTML = metaBits
      .map(([k, v]) => '<span>' + esc(k) + '<b>' + esc(v) + '</b></span>')
      .join('');

    // ----- overview -----
    $('[data-cs-intro]').textContent = txt(cs.intro || item.detail || '');
    if (cs.objective) {
      $('[data-cs-objective-wrap]').hidden = false;
      $('[data-cs-objective]').textContent = txt(cs.objective);
    }

    const facts = [
      ['العميل', item.client],
      ['السنة', item.year],
      ['المدة', item.duration],
      ['الخدمات', splitList(cs.services).join(' · ')],
      ['الأدوات', splitList(cs.tools).join(' · ')],
    ].filter(([, v]) => v);
    $('[data-cs-facts]').innerHTML = '<dl>' + facts
      .map(([k, v]) => '<div class="cs-fact"><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>')
      .join('') + '</dl>';

    // ----- palette (design only) -----
    const palette = splitList(cs.palette).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c.replace('#', '#')));
    if (mode === 'image' && palette.length) {
      $('[data-cs-palette-wrap]').hidden = false;
      $('[data-cs-palette]').innerHTML = palette.map((c) => {
        const hex = c.startsWith('#') ? c : '#' + c;
        return '<div class="cs-swatch" style="background:' + esc(hex) + '">' + esc(hex.toUpperCase()) + '</div>';
      }).join('');
    }

    // ----- phases -----
    const phases = Array.isArray(cs.phases) ? cs.phases.filter((p) => p && (p.title || p.body)) : [];
    if (phases.length) {
      $('[data-cs-phases-wrap]').hidden = false;
      $('[data-phases-heading]').textContent = mode === 'video'
        ? 'من الفكرة إلى الشاشة'
        : 'من الفكرة إلى التسليم';
      $('[data-cs-phases]').innerHTML = phases.map((p, i) => {
        const media = txt(p.media);
        const isVid = /\.(mp4|webm|m3u8|mov)(?:$|\?)/i.test(media);
        const mediaHtml = media
          ? '<div class="cs-phase-media" data-reveal>'
            + (isVid
              ? '<video src="' + esc(media) + '" muted loop playsinline autoplay preload="metadata"></video>'
              : '<img src="' + esc(media) + '" alt="' + esc(p.title || '') + '" loading="lazy" decoding="async">')
            + '</div>'
          : '';
        return '<article class="cs-phase" id="phase-' + (i + 1) + '" data-phase-id="phase-' + (i + 1) + '">'
          + '<div class="cs-phase-copy" data-reveal>'
          + '<span class="cs-phase-num">' + String(i + 1).padStart(2, '0') + '</span>'
          + '<h3>' + esc(p.title || '') + '</h3>'
          + '<p>' + esc(p.body || '') + '</p>'
          + '</div>'
          + mediaHtml
          + '</article>';
      }).join('');

      // فهرس المراحل (أفقي فوق الرحلة) + سكة جانبية ثابتة
      const toc = $('[data-cs-toc]');
      const rail = $('[data-cs-rail]');
      toc.hidden = false;
      toc.innerHTML = phases.map((p, i) =>
        '<a href="#phase-' + (i + 1) + '" data-toc="' + (i + 1) + '">'
        + '<bdi dir="ltr">' + String(i + 1).padStart(2, '0') + '</bdi> ' + esc(p.title || '')
        + '</a>'
      ).join('');
      if (rail && phases.length > 1) {
        rail.hidden = false;
        rail.innerHTML = phases.map((p, i) =>
          '<a href="#phase-' + (i + 1) + '" title="' + esc(p.title || '') + '" data-rail="' + (i + 1) + '">' + (i + 1) + '</a>'
        ).join('');
      }
    }

    // ----- gallery -----
    const gal = Array.isArray(cs.gallery) ? cs.gallery.filter(Boolean) : [];
    if (gal.length) {
      $('[data-cs-gallery-wrap]').hidden = false;
      $('[data-cs-gallery]').innerHTML = gal.map((u, i) =>
        '<figure data-reveal><img src="' + esc(u) + '" alt="' + esc(item.title || '') + ' — لقطة ' + (i + 1) + '" loading="lazy" decoding="async"></figure>'
      ).join('');
    }

    // ----- outcome + quote -----
    if (cs.outcome || cs.quote) {
      $('[data-cs-outcome-wrap]').hidden = false;
      $('[data-cs-outcome]').textContent = txt(cs.outcome);
      if (cs.quote) {
        $('[data-cs-quote-wrap]').hidden = false;
        $('[data-cs-quote]').textContent = txt(cs.quote);
        $('[data-cs-quote-author]').textContent = txt(cs.quoteAuthor || '');
      }
    }

    // ----- prev / next -----
    const prev = list[(idx - 1 + list.length) % list.length];
    const next = list[(idx + 1) % list.length];
    const sib = (w, label) => '<a class="cs-sib" href="' + esc(workUrl(w)) + '">'
      + (w.cover ? '<img src="' + esc(w.cover) + '" alt="" loading="lazy">' : '')
      + '<span class="cs-sib-in"><small>' + esc(label) + '</small><b>' + esc(w.title || '') + '</b></span>'
      + '</a>';
    if (list.length > 1) {
      $('[data-cs-siblings]').innerHTML = sib(prev, '→ المشروع السابق') + sib(next, 'المشروع التالي ←');
    }

    $('[data-case-root]').hidden = false;
    document.title = (cs.seoTitle || (txt(item.title) + ' — ' + brand));
    reveal();
    initProgressAndToc();
  }

  function initProgressAndToc() {
    const bar = document.querySelector('[data-cs-progress-bar]');
    const tocLinks = [...document.querySelectorAll('[data-toc]')];
    const railLinks = [...document.querySelectorAll('[data-rail]')];
    const phases = [...document.querySelectorAll('[data-phase-id]')];

    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
      if (bar) bar.style.width = pct + '%';

      let active = 0;
      phases.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= window.innerHeight * 0.35) active = i;
      });
      tocLinks.forEach((a, i) => a.classList.toggle('is-active', i === active));
      railLinks.forEach((a, i) => a.classList.toggle('is-active', i === active));
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  load();
})();
