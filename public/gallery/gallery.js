(() => {
  'use strict';

  const body = document.body;
  const mode = body.dataset.galleryMode === 'video' ? 'video' : 'image';
  const LAYOUTS = mode === 'video' ? ['livewall', 'reels', 'orbit'] : ['drift', 'lighttable', 'slivers', 'corridor', 'road'];
  const storageKey = 'wx-gallery-xp-' + mode;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const state = {
    items: [],
    filter: 'all',
    layout: (() => {
      try {
        let s = localStorage.getItem(storageKey);
        if (s === 'planet') s = 'corridor'; // هجرة من معاينة 3D الملغاة
        return LAYOUTS.includes(s) ? s : LAYOUTS[0];
      } catch { return LAYOUTS[0]; }
    })(),
    modalIndex: -1,
    lastTrigger: null,
    orbitIndex: 0,
    sliverRoom: 0,
  };

  let cleanups = [];
  const onCleanup = (fn) => cleanups.push(fn);
  const runCleanups = () => { cleanups.forEach((f) => { try { f(); } catch {} }); cleanups = []; };

  const els = {
    root: document.querySelector('[data-gallery-root]'),
    filters: document.querySelector('[data-filter-list]'),
    result: document.querySelector('[data-result-label]'),
    count: document.querySelector('[data-work-count]'),
    status: document.querySelector('[data-status]'),
    brand: document.querySelectorAll('[data-brand]'),
    eyebrow: document.querySelector('[data-gallery-eyebrow]'),
    title: document.querySelector('[data-gallery-title]'),
    description: document.querySelector('[data-gallery-description]'),
    cta: document.querySelector('[data-gallery-cta]'),
    switchBtns: document.querySelectorAll('[data-layout-option]'),
    modal: document.querySelector('[data-modal]'),
    modalMedia: document.querySelector('[data-modal-media]'),
    modalTag: document.querySelector('[data-modal-tag]'),
    modalTitle: document.querySelector('[data-modal-title]'),
    modalDesc: document.querySelector('[data-modal-description]'),
    metadata: document.querySelector('[data-metadata]'),
    modalClose: document.querySelector('[data-modal-close]'),
    modalPrev: document.querySelector('[data-modal-prev]'),
    modalNext: document.querySelector('[data-modal-next]'),
    modalPage: document.querySelector('[data-modal-page]'),
  };

  const esc = (v = '') => String(v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[c]));
  const txt = (v) => (v == null ? '' : String(v));
  const slug = (v = '') => String(v).trim().toLowerCase();
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n + 1).padStart(2, '0');
  // الرابط الحقيقي لصفحة المشروع — يستخدم كـ href للبطاقات
  const caseUrl = (item) => (mode === 'video' ? '/film/' : '/work/') + encodeURIComponent(item.slug || item.id || '');
  // تسميات عربية للفلاتر — القيمة الإنجليزية تبقى tag داخلي
  const TAG_AR = {
    'branding': 'هوية تجارية',
    'visual identity': 'هوية بصرية',
    'logo': 'شعارات',
    'social media': 'سوشل ميديا',
    'packaging': 'تغليف',
    'campaign': 'حملات',
    'print': 'مطبوعات',
    'ui/ux': 'واجهات',
    'film': 'أفلام',
    'motion': 'موشن جرافيك',
    'ad': 'إعلانات',
    'reel': 'ريلز',
    'documentary': 'وثائقي',
    'event': 'فعاليات',
  };
  const tagLabel = (t) => TAG_AR[slug(t)] || txt(t);

  const visible = () => (state.filter === 'all'
    ? state.items
    : state.items.filter((it) => slug(it.tag) === state.filter));

  // ---------- video helpers (multi-instance HLS aware) ----------
  function attachSource(video, src) {
    const isHls = /\.m3u8(?:$|\?)/i.test(src);
    if (isHls && window.Hls && window.Hls.isSupported()) {
      const h = new window.Hls({ enableWorker: false, capLevelToPlayerSize: true, maxBufferLength: 16 });
      h.loadSource(src);
      h.attachMedia(video);
      h.on(window.Hls.Events.ERROR, (_e, data) => {
        if (!data || !data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) h.startLoad();
        else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
      });
      video._hls = h;
    } else {
      video.src = src;
    }
  }

  function makeVideo(item, { autoplay = false, muted = false, controls = true } = {}) {
    const video = document.createElement('video');
    video.controls = controls;
    video.playsInline = true;
    video.muted = muted;
    video.preload = 'metadata';
    video.loop = item.loop !== false;
    if (item.cover) video.poster = item.cover;
    video.setAttribute('aria-label', txt(item.title));
    const src = txt(item.videoUrl);
    if (src) attachSource(video, src);
    if (autoplay && src) { const p = video.play(); if (p) p.catch(() => {}); }
    return video;
  }

  function destroyVideo(video) {
    if (!video) return;
    try { video.pause(); } catch {}
    if (video._hls) { try { video._hls.destroy(); } catch {} video._hls = null; }
    video.removeAttribute('src');
  }

  function stopAllVideos(except) {
    document.querySelectorAll('video').forEach((v) => { if (v !== except) v.pause(); });
  }

  // ---------- batched appending (scales to large archives) ----------
  function makeBatcher(container, list, pageSize, renderItem) {
    let shown = 0;
    const sentinel = document.createElement('div');
    sentinel.className = 'g-more';
    sentinel.innerHTML = '<span></span>';

    const append = () => {
      const next = list.slice(shown, shown + pageSize);
      if (!next.length) { sentinel.remove(); io.disconnect(); return; }
      const frag = document.createDocumentFragment();
      const tmp = document.createElement('div');
      tmp.innerHTML = next.map((it, k) => renderItem(it, shown + k)).join('');
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      container.insertBefore(frag, sentinel.parentNode === container ? sentinel : null);
      shown += next.length;
      if (shown >= list.length) { sentinel.remove(); io.disconnect(); }
    };

    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) append();
    }, { rootMargin: '600px' });

    container.appendChild(sentinel);
    append();
    if (sentinel.parentNode) io.observe(sentinel);
    onCleanup(() => io.disconnect());
  }

  // ---------- filters ----------
  function renderFilters() {
    const tags = [...new Set(state.items.map((it) => txt(it.tag)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    els.filters.innerHTML = ['all', ...tags].map((t) => {
      const val = t === 'all' ? 'all' : slug(t);
      const label = t === 'all' ? 'الكل' : tagLabel(t);
      return '<button type="button" data-filter="' + esc(val) + '" aria-pressed="' + (val === state.filter) + '">' + esc(label) + '</button>';
    }).join('');
  }

  function setFilter(f) {
    state.filter = f;
    state.orbitIndex = 0;
    state.sliverRoom = 0;
    els.filters.querySelectorAll('[data-filter]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.filter === f));
    });
    render();
  }

  function setLayout(layout) {
    state.layout = LAYOUTS.includes(layout) ? layout : LAYOUTS[0];
    body.dataset.layout = state.layout;
    try { localStorage.setItem(storageKey, state.layout); } catch {}
    els.switchBtns.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.layoutOption === state.layout));
    });
    render();
  }

  // =========================================================
  // IMAGE 1 — DRIFT: draggable exhibition space with parallax
  // =========================================================
  function renderDrift(list) {
    els.root.innerHTML = '<div class="dr-stage" data-dr-stage>'
      + '<div data-dr-plane style="position:absolute;inset:0;"></div>'
      + '<div class="dr-hint" data-dr-hint>اسحب بحرية لاستكشاف صالة العرض</div>'
      + '</div>';

    const stage = els.root.querySelector('[data-dr-stage]');
    const plane = els.root.querySelector('[data-dr-plane]');
    const hint = els.root.querySelector('[data-dr-hint]');

    const n = list.length;
    const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.4)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = 480;
    const cellH = 500;
    const W = cols * cellW;
    const H = rows * cellH;

    const nodes = list.map((item, i) => {
      const gi = state.items.indexOf(item);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jx = ((i * 73) % 100) / 100;
      const jy = ((i * 137) % 100) / 100;
      const w = 220 + ((i * 97) % 3) * 60;
      const h = Math.round(w * (0.68 + ((i * 41) % 3) * 0.22));
      const x = col * cellW + jx * (cellW - w - 60) + 30;
      const y = row * cellH + jy * (cellH - h - 90) + 30;
      const depth = 0.72 + (((i * 53) % 5) / 10);

      const fig = document.createElement('figure');
      fig.className = 'dr-item';
      fig.style.width = w + 'px';
      fig.innerHTML = '<a href="' + esc(caseUrl(item)) + '" data-open-item="' + gi + '" style="width:' + w + 'px;height:' + h + 'px;display:block;" aria-label="فتح ' + esc(item.title) + '">'
        + (item.cover ? '<img src="' + esc(item.cover) + '" alt="' + esc(item.title) + '" loading="lazy" decoding="async">' : '')
        + '</a>'
        + '<figcaption><b>' + esc(item.title || '') + '</b><span>' + esc(item.tag || '') + '</span></figcaption>';
      plane.appendChild(fig);
      return { el: fig, x, y, depth };
    });

    const vw = () => stage.clientWidth;
    const vh = () => stage.clientHeight;
    let px = -(W - vw()) / 2;
    let py = -(H - vh()) / 2;
    let vx = 0; let vy = 0;
    let dragging = false;
    let lx = 0; let ly = 0;
    let moved = 0;
    let idleT = 0;
    let raf = 0;

    const apply = () => {
      const minX = Math.min(0, vw() - W - 60);
      const minY = Math.min(0, vh() - H - 60);
      px = clamp(px, minX, 60);
      py = clamp(py, minY, 60);
      nodes.forEach((nd) => {
        nd.el.style.transform = 'translate3d(' + (nd.x + px * nd.depth) + 'px,' + (nd.y + py * nd.depth) + 'px,0)';
      });
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!dragging) {
        px += vx; py += vy;
        vx *= 0.93; vy *= 0.93;
        if (!reducedMotion && Math.abs(vx) < 0.02 && Math.abs(vy) < 0.02) {
          idleT += 0.004;
          px += Math.sin(idleT) * 0.25;
          py += Math.cos(idleT * 0.8) * 0.15;
        }
      }
      apply();
    };

    const down = (e) => {
      dragging = true;
      moved = 0;
      stage.classList.add('dragging');
      lx = e.clientX; ly = e.clientY;
      vx = 0; vy = 0;
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      px += dx; py += dy;
      vx = dx; vy = dy;
      lx = e.clientX; ly = e.clientY;
      if (moved > 20 && hint) hint.setAttribute('data-hide', '');
    };
    const up = () => { dragging = false; stage.classList.remove('dragging'); };
    const clickGuard = (e) => { if (moved > 8) { e.stopPropagation(); e.preventDefault(); } };

    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('click', clickGuard, true);
    raf = requestAnimationFrame(tick);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
      stage.removeEventListener('click', clickGuard, true);
    });
  }

  // =========================================================
  // IMAGE 2 — LIGHT TABLE: contact sheet + cursor loupe
  // =========================================================
  function renderLightTable(list) {
    els.root.innerHTML = '<div class="lt-head">'
      + '<span>CONTACT SHEET — ' + list.length + ' FRAMES</span>'
      + '<span>WEXON ARCHIVE ' + new Date().getFullYear() + '</span>'
      + '</div>'
      + '<div class="lt-grid" data-lt-grid></div>';

    const grid = els.root.querySelector('[data-lt-grid]');

    makeBatcher(grid, list, 24, (item, i) => {
      const gi = state.items.indexOf(item);
      return '<a href="' + esc(caseUrl(item)) + '" class="lt-cell" data-open-item="' + gi + '" aria-label="فتح ' + esc(item.title) + '">'
        + '<span class="lt-frame">'
        + (item.cover ? '<img src="' + esc(item.cover) + '" alt="' + esc(item.title) + '" loading="lazy" decoding="async">' : '')
        + '</span>'
        + '<span class="lt-meta"><i>A-' + pad2(i) + '</i><em>' + esc(tagLabel(item.tag || '')) + '</em></span>'
        + '<span class="lt-title">' + esc(item.title || '') + '</span>'
        + '</a>';
    });

    // على اللمس: إظهار العنوان عند الضغط (الديسكتوب يعتمد على hover)
    if (!finePointer) {
      const onTouch = (e) => {
        const cell = e.target.closest && e.target.closest('.lt-cell');
        grid.querySelectorAll('.lt-cell.is-touch').forEach((c) => c.classList.remove('is-touch'));
        if (cell) cell.classList.add('is-touch');
      };
      grid.addEventListener('pointerdown', onTouch);
      onCleanup(() => grid.removeEventListener('pointerdown', onTouch));
    }

    // cursor loupe (desktop only)
    if (finePointer) {
      const loupe = document.createElement('div');
      loupe.className = 'lt-loupe';
      loupe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(loupe);

      const moveLoupe = (e) => {
        const cell = e.target.closest && e.target.closest('.lt-cell');
        const img = cell && cell.querySelector('img');
        if (!img || !img.src) { loupe.style.opacity = '0'; return; }
        const r = img.getBoundingClientRect();
        const rx = clamp((e.clientX - r.left) / r.width, 0, 1);
        const ry = clamp((e.clientY - r.top) / r.height, 0, 1);
        loupe.style.opacity = '1';
        loupe.style.left = e.clientX + 'px';
        loupe.style.top = e.clientY + 'px';
        loupe.style.backgroundImage = 'url("' + img.src + '")';
        loupe.style.backgroundPosition = (rx * 100) + '% ' + (ry * 100) + '%';
      };
      const hideLoupe = () => { loupe.style.opacity = '0'; };

      grid.addEventListener('pointermove', moveLoupe);
      grid.addEventListener('pointerleave', hideLoupe);
      window.addEventListener('scroll', hideLoupe, { passive: true });
      onCleanup(() => {
        grid.removeEventListener('pointermove', moveLoupe);
        grid.removeEventListener('pointerleave', hideLoupe);
        window.removeEventListener('scroll', hideLoupe);
        loupe.remove();
      });
    }
  }

  // =========================================================
  // IMAGE 3 — SLIVERS: expanding exhibition wings, in rooms
  // =========================================================
  function renderSlivers(list) {
    const roomSize = window.matchMedia('(max-width: 860px)').matches ? 5 : 8;
    const rooms = [];
    for (let i = 0; i < list.length; i += roomSize) rooms.push(list.slice(i, i + roomSize));
    if (state.sliverRoom >= rooms.length) state.sliverRoom = 0;

    const paint = () => {
      const room = rooms[state.sliverRoom] || [];
      els.root.innerHTML = '<div class="sv-room" data-sv-room>'
        + room.map((item, i) => {
          const gi = state.items.indexOf(item);
          return '<a href="' + esc(caseUrl(item)) + '" class="sv-panel" data-open-item="' + gi + '" style="animation-delay:' + (i * 60) + 'ms" aria-label="فتح ' + esc(item.title) + '">'
            + (item.cover ? '<img src="' + esc(item.cover) + '" alt="" loading="lazy" decoding="async">' : '')
            + '<span class="sv-shade"></span>'
            + '<span class="sv-spine">' + esc(item.title || '') + '</span>'
            + '<span class="sv-cap"><b>' + esc(item.title || '') + '</b><i>' + esc(item.tag || '') + '</i></span>'
            + '</a>';
        }).join('')
        + '</div>'
        + (rooms.length > 1
          ? '<div class="sv-nav">'
            + '<button type="button" class="sv-btn" data-sv-prev aria-label="الجناح السابق" ' + (state.sliverRoom === 0 ? 'disabled' : '') + '>‹</button>'
            + '<span>الجناح <bdi dir="ltr">' + pad2(state.sliverRoom) + ' / ' + pad2(rooms.length - 1) + '</bdi></span>'
            + '<button type="button" class="sv-btn" data-sv-next aria-label="الجناح التالي" ' + (state.sliverRoom === rooms.length - 1 ? 'disabled' : '') + '>›</button>'
            + '</div>'
          : '');

      const prev = els.root.querySelector('[data-sv-prev]');
      const next = els.root.querySelector('[data-sv-next]');
      if (prev) prev.addEventListener('click', () => { state.sliverRoom -= 1; paint(); });
      if (next) next.addEventListener('click', () => { state.sliverRoom += 1; paint(); });

      // touch: first tap expands, second tap opens
      if (!finePointer) {
        const roomEl = els.root.querySelector('[data-sv-room]');
        roomEl.addEventListener('click', (e) => {
          const panel = e.target.closest('.sv-panel');
          if (!panel) return;
          if (!panel.classList.contains('on')) {
            e.stopPropagation();
            e.preventDefault();
            roomEl.querySelectorAll('.sv-panel.on').forEach((p) => p.classList.remove('on'));
            panel.classList.add('on');
          }
        }, true);
      }
    };

    paint();
  }

  // =========================================================
  // VIDEO 1 — LIVEWALL: broadcast wall with hover live preview
  // =========================================================
  function renderLivewall(list) {
    els.root.innerHTML = '<div class="lw-grid" data-lw-grid></div>';
    const grid = els.root.querySelector('[data-lw-grid]');

    makeBatcher(grid, list, 12, (item, i) => {
      const gi = state.items.indexOf(item);
      return '<a href="' + esc(caseUrl(item)) + '" class="lw-card" data-open-item="' + gi + '" data-lw-card="' + gi + '" aria-label="تشغيل ' + esc(item.title) + '">'
        + '<span class="lw-screen" data-lw-screen>'
        + (item.cover ? '<img src="' + esc(item.cover) + '" alt="' + esc(item.title) + '" loading="lazy" decoding="async">' : '')
        + '<span class="lw-live">LIVE</span>'
        + '<span class="lw-ch">CH ' + pad2(i) + '</span>'
        + '</span>'
        + '<span class="lw-bar"><h3>' + esc(item.title || '') + '</h3>'
        + '<span class="lw-eq"><i></i><i></i><i></i></span>'
        + '<span class="gc-tag">' + esc(tagLabel(item.tag || '')) + '</span></span>'
        + '</a>';
    });

    if (finePointer) {
      let previewVideo = null;
      const enter = (e) => {
        const card = e.target.closest && e.target.closest('[data-lw-card]');
        if (!card) return;
        const item = state.items[Number(card.dataset.lwCard)];
        if (!item || !item.videoUrl) return;
        const screen = card.querySelector('[data-lw-screen]');
        if (screen.querySelector('video')) return;
        if (previewVideo) { destroyVideo(previewVideo); previewVideo.remove(); previewVideo = null; }
        const v = makeVideo(item, { autoplay: true, muted: true, controls: false });
        v.loop = true;
        previewVideo = v;
        screen.appendChild(v);
      };
      const leave = (e) => {
        const card = e.target.closest && e.target.closest('[data-lw-card]');
        if (!card) return;
        const v = card.querySelector('video');
        if (v) { destroyVideo(v); v.remove(); if (previewVideo === v) previewVideo = null; }
      };
      els.root.addEventListener('mouseover', enter);
      els.root.addEventListener('mouseout', leave);
      onCleanup(() => {
        els.root.removeEventListener('mouseover', enter);
        els.root.removeEventListener('mouseout', leave);
        if (previewVideo) { destroyVideo(previewVideo); previewVideo = null; }
      });
    }
  }

  // =========================================================
  // VIDEO 2 — REELS: snap feed, only active ±1 mounted
  // =========================================================
  function renderReels(list) {
    els.root.innerHTML = '<div class="rl-wrap">'
      + '<div class="rl-feed" data-rl-feed>'
      + list.map((item, i) => {
        const gi = state.items.indexOf(item);
        return '<div class="rl-slide" data-rl-slide="' + i + '">'
          + '<div class="rl-media" data-rl-media>'
          + (item.cover ? '<img src="' + esc(item.cover) + '" alt="" loading="lazy" decoding="async">' : '')
          + '</div>'
          + '<div class="rl-overlay">'
          + '<span class="gc-tag">' + esc(tagLabel(item.tag || '')) + '</span>'
          + '<h3>' + esc(item.title || '') + '</h3>'
          + '<a href="' + esc(caseUrl(item)) + '" class="rl-sound" data-open-item="' + gi + '" aria-label="شاهد بالصوت — ' + esc(item.title) + '">شاهد بالصوت</a>'
          + '</div>'
          + '</div>';
      }).join('')
      + '</div>'
      + '<aside class="rl-side" data-rl-side aria-live="polite">'
      + '<span class="gc-tag" data-rl-side-tag></span>'
      + '<h3 data-rl-side-title></h3>'
      + '<p data-rl-side-desc></p>'
      + '<a href="#" data-rl-side-page>صفحة المشروع ↗</a>'
      + '</aside>'
      + '<div class="rl-rail">'
      + '<button type="button" class="ob-btn" data-rl-up aria-label="الفيديو السابق">↑</button>'
      + '<span class="rl-count" data-rl-count>01 / ' + pad2(list.length - 1) + '</span>'
      + '<button type="button" class="ob-btn" data-rl-down aria-label="الفيديو التالي">↓</button>'
      + '</div>'
      + '</div>';

    const feed = els.root.querySelector('[data-rl-feed]');
    const counter = els.root.querySelector('[data-rl-count]');
    const slides = [...els.root.querySelectorAll('[data-rl-slide]')];
    const sideTag = els.root.querySelector('[data-rl-side-tag]');
    const sideTitle = els.root.querySelector('[data-rl-side-title]');
    const sideDesc = els.root.querySelector('[data-rl-side-desc]');
    const sidePage = els.root.querySelector('[data-rl-side-page]');
    let active = 0;

    const updateSide = (i) => {
      const item = list[i];
      if (!item) return;
      sideTag.textContent = tagLabel(item.tag);
      sideTitle.textContent = txt(item.title);
      sideDesc.textContent = txt(item.detail) || '';
      sidePage.href = caseUrl(item);
    };
    updateSide(0);

    const mount = (i) => {
      const slide = slides[i];
      if (!slide) return;
      const media = slide.querySelector('[data-rl-media]');
      if (media.querySelector('video')) return;
      const item = list[i];
      if (!item || !item.videoUrl) return;
      const v = makeVideo(item, { autoplay: false, muted: true, controls: false });
      v.loop = true;
      media.appendChild(v);
    };

    const unmount = (i) => {
      const slide = slides[i];
      if (!slide) return;
      const v = slide.querySelector('video');
      if (v) { destroyVideo(v); v.remove(); }
    };

    const activate = (i) => {
      active = i;
      counter.textContent = pad2(i) + ' / ' + pad2(list.length - 1);
      updateSide(i);
      slides.forEach((_, k) => {
        if (Math.abs(k - i) <= 1) mount(k);
        else unmount(k);
      });
      slides.forEach((s, k) => {
        const v = s.querySelector('video');
        if (!v) return;
        if (k === i) { const p = v.play(); if (p) p.catch(() => {}); }
        else v.pause();
      });
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.intersectionRatio >= 0.6) {
          activate(Number(entry.target.dataset.rlSlide));
        }
      });
    }, { root: feed, threshold: [0.6] });
    slides.forEach((s) => io.observe(s));

    const step = (dir) => {
      const target = clamp(active + dir, 0, list.length - 1);
      feed.scrollTo({ top: target * feed.clientHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
    };

    els.root.querySelector('[data-rl-up]').addEventListener('click', () => step(-1));
    els.root.querySelector('[data-rl-down]').addEventListener('click', () => step(1));

    // mouse wheel: one reel per gesture (mandatory snap swallows small wheel deltas)
    let wheelLock = 0;
    const onWheel = (e) => {
      e.preventDefault();
      const now = Date.now();
      if (now - wheelLock < 500 || Math.abs(e.deltaY) < 8) return;
      wheelLock = now;
      step(e.deltaY > 0 ? 1 : -1);
    };
    feed.addEventListener('wheel', onWheel, { passive: false });

    const keys = (e) => {
      if (els.modal.dataset.open === 'true') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    };
    document.addEventListener('keydown', keys);

    onCleanup(() => {
      io.disconnect();
      feed.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', keys);
      els.root.querySelectorAll('video').forEach((v) => destroyVideo(v));
    });
  }

  // =========================================================
  // VIDEO 3 — ORBIT: windowed 3D carousel (scales to any count)
  // =========================================================
  function renderOrbit(list) {
    if (!list.length) { els.root.innerHTML = '<div class="g-empty">لا فيديوهات ضمن هذا التصنيف.</div>'; return; }
    const n = list.length;
    if (state.orbitIndex >= n) state.orbitIndex = 0;

    els.root.innerHTML = '<div class="ob-wrap">'
      + '<div class="ob-stage" data-ob-stage>'
      + '<div class="ob-floor"></div>'
      + '<div class="ob-ring" data-ob-ring>'
      + list.map((item, i) => {
        const gi = state.items.indexOf(item);
        return '<a href="' + esc(caseUrl(item)) + '" class="ob-card" data-ob-card="' + i + '" data-open-item="' + gi + '" aria-label="فتح ' + esc(item.title) + '">'
          + (item.cover ? '<img src="' + esc(item.cover) + '" alt="' + esc(item.title) + '" loading="lazy" decoding="async">' : '')
          + '<span class="gc-play" aria-hidden="true"></span>'
          + '</a>';
      }).join('')
      + '</div></div>'
      + '<div class="ob-meta">'
      + '<button type="button" class="ob-btn" data-ob-next aria-label="التالي">‹</button>'
      + '<div class="ob-info"><h3 data-ob-title></h3><span class="gc-tag" data-ob-tag></span>'
      + '<a href="#" class="ob-page" data-ob-page>صفحة المشروع ↗</a></div>'
      + '<button type="button" class="ob-btn" data-ob-prev aria-label="السابق">›</button>'
      + '</div>'
      + '<div class="ob-track"><span data-ob-count></span><div class="ob-progress"><i data-ob-bar></i></div></div>'
      + '</div>';

    const cards = [...els.root.querySelectorAll('[data-ob-card]')];
    const title = els.root.querySelector('[data-ob-title]');
    const tag = els.root.querySelector('[data-ob-tag]');
    const pageLink = els.root.querySelector('[data-ob-page]');
    const stage = els.root.querySelector('[data-ob-stage]');
    const countEl = els.root.querySelector('[data-ob-count]');
    const barEl = els.root.querySelector('[data-ob-bar]');
    const btnNext = els.root.querySelector('[data-ob-next]');
    const btnPrev = els.root.querySelector('[data-ob-prev]');

    const setActive = (idx) => {
      state.orbitIndex = clamp(idx, 0, n - 1);
      const a = state.orbitIndex;
      cards.forEach((c, i) => {
        const d = i - a;
        const ad = Math.abs(d);
        if (ad > 4) {
          c.style.opacity = '0';
          c.style.pointerEvents = 'none';
          c.style.transform = 'translateX(' + (d * 54) + '%) translateZ(-700px) rotateY(' + (d * -32) + 'deg)';
          return;
        }
        c.style.opacity = d === 0 ? '1' : String(Math.max(0.12, 0.55 - (ad - 1) * 0.18));
        c.style.pointerEvents = 'auto';
        c.style.zIndex = String(10 - ad);
        c.style.transform = 'translateX(' + (d * 54) + '%) translateZ(' + (-ad * 150) + 'px) rotateY(' + (d * -28) + 'deg)';
        c.setAttribute('data-front', String(d === 0));
      });
      const item = list[a];
      title.textContent = txt(item.title);
      tag.textContent = tagLabel(item.tag);
      pageLink.href = caseUrl(item);
      countEl.textContent = pad2(a) + ' / ' + pad2(n - 1);
      barEl.style.width = (n > 1 ? (a / (n - 1)) * 100 : 100) + '%';
      btnNext.disabled = a === n - 1;
      btnPrev.disabled = a === 0;
    };
    setActive(state.orbitIndex);

    const clickCard = (e) => {
      const card = e.target.closest && e.target.closest('[data-ob-card]');
      if (!card) return;
      const i = Number(card.dataset.obCard);
      if (i !== state.orbitIndex) {
        e.preventDefault();
        setActive(i);
      }
      // البطاقة الأمامية: النقر العادي يمرّ لـ data-open-item handler (مودال)
    };

    const next = () => setActive(state.orbitIndex + 1);
    const prev = () => setActive(state.orbitIndex - 1);

    let dx0 = null;
    const pdown = (e) => { dx0 = e.clientX; };
    const pup = (e) => {
      if (dx0 == null) return;
      const d = e.clientX - dx0;
      if (Math.abs(d) > 40) (d > 0 ? prev : next)();
      dx0 = null;
    };
    const keys = (e) => {
      if (els.modal.dataset.open === 'true') return;
      if (e.key === 'ArrowLeft') next();
      if (e.key === 'ArrowRight') prev();
    };

    btnNext.addEventListener('click', next);
    btnPrev.addEventListener('click', prev);
    stage.addEventListener('click', clickCard);
    stage.addEventListener('pointerdown', pdown);
    stage.addEventListener('pointerup', pup);
    document.addEventListener('keydown', keys);

    onCleanup(() => {
      document.removeEventListener('keydown', keys);
    });
  }

  // =========================================================
  // IMAGE 4 — CORRIDOR: ممر أفقي سلس (transform)
  // =========================================================
  function renderCorridor(list) {
    const n = list.length;
    els.root.innerHTML = '<div class="cr-wrap">'
      + '<div class="cr-bar">'
      + '<p class="cr-hint">مرّر بالعجلة أو اسحب للتنقّل بين الأعمال · انقر للفتح</p>'
      + '<div class="cr-controls">'
      + '<button type="button" class="cr-nav" data-cr-prev aria-label="السابق">→</button>'
      + '<span class="cr-pos" data-cr-pos>01 / ' + String(n).padStart(2, '0') + '</span>'
      + '<button type="button" class="cr-nav" data-cr-next aria-label="التالي">←</button>'
      + '</div></div>'
      + '<div class="cr-viewport" data-cr-view>'
      + '<div class="cr-track" data-cr-track dir="ltr">'
      + list.map((item, i) => {
        const gi = state.items.indexOf(item);
        return '<a href="' + esc(caseUrl(item)) + '" class="cr-panel" data-open-item="' + gi + '" data-cr-i="' + i + '" aria-label="فتح ' + esc(item.title) + '">'
          + '<span class="cr-media">'
          + (item.cover ? '<img src="' + esc(item.cover) + '" alt="' + esc(item.title) + '" loading="' + (i < 2 ? 'eager' : 'lazy') + '" decoding="async" draggable="false">' : '')
          + '</span>'
          + '<span class="cr-shade" aria-hidden="true"></span>'
          + '<span class="cr-copy" dir="rtl">'
          + '<span class="cr-idx" aria-hidden="true">' + pad2(i) + '</span>'
          + '<span class="cr-tag">' + esc(tagLabel(item.tag)) + '</span>'
          + '<span class="cr-title">' + esc(item.title) + '</span>'
          + (item.detail ? '<span class="cr-desc">' + esc(item.detail) + '</span>' : '')
          + '</span></a>';
      }).join('')
      + '</div></div>'
      + '<div class="cr-progress" aria-hidden="true"><i data-cr-fill></i></div>'
      + '</div>';

    const view = els.root.querySelector('[data-cr-view]');
    const track = els.root.querySelector('[data-cr-track]');
    const posEl = els.root.querySelector('[data-cr-pos]');
    const fill = els.root.querySelector('[data-cr-fill]');
    const btnPrev = els.root.querySelector('[data-cr-prev]');
    const btnNext = els.root.querySelector('[data-cr-next]');
    const panels = [...els.root.querySelectorAll('.cr-panel')];

    let x = 0;
    let target = 0;
    let vel = 0;
    let index = 0;
    let raf = 0;
    let alive = true;
    let dragging = false;
    let dragOrigin = 0;
    let dragX0 = 0;
    let moved = false;
    let snapTimer = 0;

    const gap = () => {
      const st = getComputedStyle(track);
      return parseFloat(st.gap || st.columnGap) || 18;
    };
    const step = () => (panels[0] ? panels[0].offsetWidth : 300) + gap();
    const maxX = () => Math.max(0, step() * (n - 1));

    const apply = () => {
      track.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
      const i = clamp(Math.round(x / Math.max(1, step())), 0, n - 1);
      if (i !== index) index = i;
      posEl.textContent = pad2(index) + ' / ' + pad2(n - 1);
      fill.style.width = (n <= 1 ? 100 : (index / (n - 1)) * 100) + '%';
      btnPrev.disabled = index <= 0 && x <= 1;
      btnNext.disabled = index >= n - 1 && x >= maxX() - 1;
      panels.forEach((p, k) => {
        p.dataset.active = String(k === index);
        const img = p.querySelector('img');
        if (!img) return;
        const offset = (k * step() - x) / Math.max(1, view.clientWidth);
        img.style.transform = 'scale(1.06) translateX(' + (offset * -18) + 'px)';
      });
    };

    const goTo = (i, hard) => {
      target = clamp(i, 0, n - 1) * step();
      if (hard || reducedMotion) { x = target; vel = 0; apply(); }
    };

    const tick = () => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      if (dragging) return;
      if (Math.abs(vel) > 0.15) {
        x += vel;
        vel *= 0.92;
        target = x;
      } else {
        vel = 0;
        x += (target - x) * (reducedMotion ? 1 : 0.14);
      }
      x = clamp(x, 0, maxX());
      target = clamp(target, 0, maxX());
      if (Math.abs(target - x) < 0.2 && Math.abs(vel) < 0.15) x = target;
      apply();
    };

    const scheduleSnap = () => {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        if (dragging) return;
        goTo(Math.round(x / Math.max(1, step())), false);
      }, 90);
    };

    const onWheel = (e) => {
      e.preventDefault();
      const dy = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      target = clamp(target + dy * 1.05, 0, maxX());
      vel = 0;
      scheduleSnap();
    };

    const onDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      moved = false;
      dragX0 = e.clientX;
      dragOrigin = x;
      vel = 0;
      clearTimeout(snapTimer);
      view.classList.add('is-drag');
      view.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragX0;
      if (Math.abs(dx) > 4) moved = true;
      x = clamp(dragOrigin - dx, 0, maxX());
      target = x;
      apply();
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      view.classList.remove('is-drag');
      try { view.releasePointerCapture(e.pointerId); } catch {}
      if (moved) view.dataset.dragged = '1';
      const s = step();
      let i = Math.round(x / s);
      const flick = (dragOrigin - x);
      if (Math.abs(flick) > 40) i = flick > 0 ? Math.ceil(dragOrigin / s) : Math.floor(dragOrigin / s);
      goTo(i, false);
    };

    view.addEventListener('click', (e) => {
      if (view.dataset.dragged === '1') {
        e.preventDefault();
        e.stopPropagation();
        view.dataset.dragged = '0';
      }
    }, true);

    const keys = (e) => {
      if (els.modal.dataset.open === 'true') return;
      if (state.layout !== 'corridor') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index + 1, false); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index - 1, false); }
    };

    btnPrev.addEventListener('click', () => goTo(index - 1, false));
    btnNext.addEventListener('click', () => goTo(index + 1, false));
    view.addEventListener('wheel', onWheel, { passive: false });
    view.addEventListener('pointerdown', onDown);
    view.addEventListener('pointermove', onMove);
    view.addEventListener('pointerup', onUp);
    view.addEventListener('pointercancel', onUp);
    document.addEventListener('keydown', keys);
    window.addEventListener('resize', () => { goTo(index, true); });

    apply();
    tick();

    onCleanup(() => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(snapTimer);
      view.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', keys);
    });
  }

  // =========================================================
  // IMAGE 5 — ROAD: طريق لا نهائي بحركة كاميرا ناعمة
  // =========================================================
  function renderRoad(list) {
    const n = list.length;
    els.root.innerHTML = '<div class="rd-wrap">'
      + '<div class="rd-bar">'
      + '<p class="rd-hint">سكرول ببطء للمشي للأمام · الحركة ناعمة وملفوفة بلا نهاية</p>'
      + '<span class="rd-pos" data-rd-pos>01 / ' + String(n).padStart(2, '0') + '</span>'
      + '</div>'
      + '<div class="rd-stage" data-rd-stage tabindex="0" role="region" aria-label="طريق الأعمال اللانهائي">'
      + '<div class="rd-sky" aria-hidden="true"></div>'
      + '<div class="rd-haze" aria-hidden="true"></div>'
      + '<div class="rd-floor" data-rd-floor aria-hidden="true"><span class="rd-lane"></span></div>'
      + '<div class="rd-world" data-rd-world></div>'
      + '<div class="rd-vignette" aria-hidden="true"></div>'
      + '</div></div>';

    const stage = els.root.querySelector('[data-rd-stage]');
    const world = els.root.querySelector('[data-rd-world]');
    const floor = els.root.querySelector('[data-rd-floor]');
    const posEl = els.root.querySelector('[data-rd-pos]');

    const mkCard = (item, i, copy) => {
      const gi = state.items.indexOf(item);
      const a = document.createElement('a');
      a.href = caseUrl(item);
      a.className = 'rd-card';
      a.dataset.side = i % 2 === 0 ? 'left' : 'right';
      a.dataset.openItem = String(gi);
      a.dataset.rdI = String(i);
      a.dataset.copy = String(copy);
      a.setAttribute('aria-label', 'فتح ' + txt(item.title));
      a.innerHTML = '<span class="rd-frame">'
        + (item.cover ? '<img src="' + esc(item.cover) + '" alt="' + esc(item.title) + '" loading="lazy" decoding="async" draggable="false">' : '')
        + '</span>'
        + '<span class="rd-cap" dir="rtl"><b>' + esc(item.title) + '</b><small>' + esc(tagLabel(item.tag)) + '</small></span>';
      return a;
    };

    for (let copy = 0; copy < 2; copy++) {
      list.forEach((item, i) => world.appendChild(mkCard(item, i, copy)));
    }
    const cards = [...world.querySelectorAll('.rd-card')];

    const spacing = 640;
    const loop = Math.max(spacing, n * spacing);
    const fogFar = loop * 0.88;
    let cam = -spacing * 0.4;
    let camTarget = -spacing * 0.4;
    let raf = 0;
    let alive = true;
    let dragging = false;
    let lastY = 0;
    let moved = false;

    const wrapCam = () => {
      while (camTarget >= loop) { camTarget -= loop; cam -= loop; }
      while (camTarget < 0) { camTarget += loop; cam += loop; }
    };

    const nearestIndex = () => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        let d = Math.abs(i * spacing - cam);
        d = Math.min(d, Math.abs(d - loop));
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };

    const place = () => {
      cards.forEach((card) => {
        const i = Number(card.dataset.rdI);
        const copy = Number(card.dataset.copy);
        const worldZ = (copy * n + i) * spacing;
        const ahead = worldZ - cam;
        if (ahead < -spacing * 0.35 || ahead > fogFar) {
          card.style.visibility = 'hidden';
          card.style.pointerEvents = 'none';
          return;
        }
        card.style.visibility = 'visible';

        const z = -180 - ahead;
        const side = i % 2 === 0 ? -1 : 1;
        const spread = 1 - clamp(ahead / fogFar, 0, 1);
        const x = side * (155 + ahead * 0.085 + (1 - spread) * 40);
        const y = 28 + ahead * 0.012;
        const fadeIn = clamp(ahead / 90, 0, 1);
        const fadeOut = clamp((fogFar - ahead) / (spacing * 1.1), 0, 1);
        const opacity = fadeIn * fadeOut;
        const scale = 0.82 + spread * 0.22;

        card.style.transform = 'translate3d(calc(-50% + ' + x.toFixed(2) + 'px), calc(-50% + ' + y.toFixed(2) + 'px), ' + z.toFixed(2) + 'px) scale(' + scale.toFixed(3) + ')';
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = String(Math.round(100000 - ahead));
        card.style.pointerEvents = ahead < spacing * 1.1 && opacity > 0.45 ? 'auto' : 'none';
        card.dataset.near = String(ahead < spacing * 0.75 && ahead > 40);
      });

      if (floor) {
        const run = ((cam % 180) + 180) % 180;
        floor.style.setProperty('--rd-run', run.toFixed(2) + 'px');
      }
      posEl.textContent = pad2(nearestIndex()) + ' / ' + pad2(n - 1);
    };

    const tick = () => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      wrapCam();
      const ease = reducedMotion ? 1 : (dragging ? 0.35 : 0.075);
      cam += (camTarget - cam) * ease;
      if (Math.abs(camTarget - cam) < 0.05) cam = camTarget;
      place();
    };

    const onWheel = (e) => {
      e.preventDefault();
      camTarget += e.deltaY * 0.72;
      wrapCam();
    };

    const onDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      moved = false;
      lastY = e.clientY;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-drag');
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dy = e.clientY - lastY;
      if (Math.abs(dy) > 2) moved = true;
      lastY = e.clientY;
      camTarget += dy * 1.15;
      wrapCam();
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      try { stage.releasePointerCapture(e.pointerId); } catch {}
      stage.classList.remove('is-drag');
      if (moved) stage.dataset.dragged = '1';
    };

    stage.addEventListener('click', (e) => {
      if (stage.dataset.dragged === '1') {
        e.preventDefault();
        e.stopPropagation();
        stage.dataset.dragged = '0';
      }
    }, true);

    const keys = (e) => {
      if (els.modal.dataset.open === 'true') return;
      if (state.layout !== 'road') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); camTarget += 120; wrapCam(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); camTarget -= 120; wrapCam(); }
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    document.addEventListener('keydown', keys);
    place();
    tick();

    onCleanup(() => {
      alive = false;
      cancelAnimationFrame(raf);
      stage.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', keys);
    });
  }


  // ---------- render dispatch ----------
  function render() {
    runCleanups();
    stopAllVideos();
    const list = visible();
    els.result.textContent = list.length + ' / ' + state.items.length;
    els.count.textContent = state.items.length + (mode === 'video' ? ' فيديو' : ' مشروع');

    if (!list.length) {
      els.root.innerHTML = '<div class="g-empty">لا أعمال ضمن هذا التصنيف حالياً.</div>';
      return;
    }
    if (mode === 'image') {
      if (state.layout === 'lighttable') renderLightTable(list);
      else if (state.layout === 'slivers') renderSlivers(list);
      else if (state.layout === 'corridor') renderCorridor(list);
      else if (state.layout === 'road') renderRoad(list);
      else renderDrift(list);
    } else {
      if (state.layout === 'reels') renderReels(list);
      else if (state.layout === 'orbit') renderOrbit(list);
      else renderLivewall(list);
    }
  }

  // ---------- modal ----------
  function metadataHtml(item) {
    const rows = [
      ['العميل', item.client], ['السنة', item.year], ['المدة', item.duration],
    ].filter(([, v]) => v != null && v !== '');
    return rows.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('');
  }

  function openModal(index, trigger) {
    const item = state.items[index];
    if (!item) return;
    state.modalIndex = index;
    state.lastTrigger = trigger || null;

    els.modalTag.textContent = txt(item.tag);
    els.modalTitle.textContent = txt(item.title);
    els.modalDesc.textContent = txt(item.detail) || '';
    els.metadata.innerHTML = metadataHtml(item);
    if (els.modalPage) {
      els.modalPage.href = (mode === 'video' ? '/film/' : '/work/') + encodeURIComponent(item.slug || item.id);
    }

    stopAllVideos();
    const old = els.modalMedia.querySelector('video');
    if (old) destroyVideo(old);
    if (mode === 'video') {
      els.modalMedia.replaceChildren(makeVideo(item, { autoplay: true, muted: false, controls: true }));
    } else {
      const img = document.createElement('img');
      img.src = txt(item.cover);
      img.alt = txt(item.title);
      img.decoding = 'async';
      els.modalMedia.replaceChildren(img);
    }

    els.modal.dataset.open = 'true';
    els.modal.setAttribute('aria-hidden', 'false');
    body.classList.add('modal-open');
    els.modalClose.focus();
  }

  function closeModal() {
    if (els.modal.dataset.open !== 'true') return;
    const v = els.modalMedia.querySelector('video');
    if (v) destroyVideo(v);
    els.modalMedia.replaceChildren();
    els.modal.dataset.open = 'false';
    els.modal.setAttribute('aria-hidden', 'true');
    body.classList.remove('modal-open');
    state.modalIndex = -1;
    if (state.lastTrigger && document.contains(state.lastTrigger)) {
      try { state.lastTrigger.focus(); } catch {}
    }
  }

  function stepModal(dir) {
    if (state.modalIndex < 0) return;
    const list = visible();
    const pos = list.indexOf(state.items[state.modalIndex]);
    if (pos < 0) return;
    const next = list[(pos + dir + list.length) % list.length];
    openModal(state.items.indexOf(next), state.lastTrigger);
  }

  // ---------- data ----------
  async function load() {
    try {
      const res = await fetch('/api/content', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const content = await res.json();
      const key = mode === 'video' ? 'videos' : 'images';
      state.items = ((content.works && content.works[key]) || [])
        .filter((it) => it && it.published !== false);

      const settings = (content.works && content.works[mode === 'video' ? 'videoGallery' : 'gallery']) || {};
      els.brand.forEach((n) => { n.textContent = txt((content.site && content.site.brand) || 'Wexon'); });
      if (settings.eyebrow) els.eyebrow.textContent = txt(settings.eyebrow);
      if (settings.title) els.title.textContent = txt(settings.title);
      if (settings.description) els.description.textContent = txt(settings.description);
      if (settings.cta) els.cta.textContent = txt(settings.cta);

      renderFilters();
      render();
    } catch (e) {
      console.error('[Wexon gallery]', e);
      els.status.hidden = false;
      els.status.textContent = 'تعذّر تحميل المعرض — أعد المحاولة بعد قليل.';
      els.count.textContent = '';
    }
  }

  // ---------- global events ----------
  els.filters.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (b) setFilter(b.dataset.filter);
  });

  // نقر عادي → مودال | ctrl/cmd/shift/وسط → يتبع href الحقيقي لصفحة المشروع
  els.root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open-item]');
    if (!b) return;
    const plain = !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0);
    if (!plain) return;
    e.preventDefault();
    openModal(Number(b.dataset.openItem), b);
  });

  els.switchBtns.forEach((b) => {
    b.addEventListener('click', () => setLayout(b.dataset.layoutOption));
  });

  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
  if (els.modalPrev) els.modalPrev.addEventListener('click', () => stepModal(-1));
  if (els.modalNext) els.modalNext.addEventListener('click', () => stepModal(1));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (els.modal.dataset.open === 'true' && mode === 'image') {
      if (e.key === 'ArrowRight') stepModal(-1);
      if (e.key === 'ArrowLeft') stepModal(1);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAllVideos();
  });

  // لمعة الحدود تتبع المؤشر — مثل بطاقات الهوم
  if (finePointer) {
    const GLOW_SEL = '.dr-item a, .lt-cell, .lw-card, .ob-card, .sv-panel, .rl-slide, .cr-panel, .rd-frame';
    document.addEventListener('pointermove', (e) => {
      const el = e.target && e.target.closest ? e.target.closest(GLOW_SEL) : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      el.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 100).toFixed(2) + '%');
      el.style.setProperty('--gy', ((e.clientY - r.top) / r.height * 100).toFixed(2) + '%');
    }, { passive: true });
  }

  document.addEventListener('play', (e) => {
    if (e.target && e.target.tagName === 'VIDEO' && !e.target.muted) stopAllVideos(e.target);
  }, true);

  setLayout(state.layout);
  load();
})();
