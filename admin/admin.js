(() => {
  const SECTIONS = [
    { id: 'dashboard', title: 'نظرة عامة', sub: 'إحصائيات الزيارات' },
    { id: 'texts', title: 'نصوص', sub: 'Hero والصفحات الثابتة' },
    { id: 'services', title: 'خدمات', sub: 'إضافة وتعديل الخدمات' },
    { id: 'worksImages', title: 'أعمال صور', sub: 'معرض الأعمال المصوّرة' },
    { id: 'worksVideos', title: 'أعمال فيديو', sub: 'أغلفة ومقاطع مرئية' },
    { id: 'team', title: 'فريق', sub: 'أعضاء الفريق' },
    { id: 'partners', title: 'شركاء', sub: 'شعارات الشريط المتحرك' },
    { id: 'testimonials', title: 'آراء', sub: 'شهادات العملاء' },
    { id: 'settings', title: 'إعدادات', sub: 'العلامة والتواصل' },
    { id: 'seo', title: 'SEO / GEO', sub: 'محركات البحث والذكاء الاصطناعي' },
    { id: 'media', title: 'وسائط', sub: 'رفع وإدارة الملفات' },
  ];

  const state = {
    content: null,
    baseline: null,
    section: 'dashboard',
    stats: null,
    media: [],
    dirty: false,
  };

  const $ = (s, r = document) => r.querySelector(s);
  const authEl = $('#auth');
  const appEl = $('#app');
  const viewEl = $('#view');
  const navEl = $('#nav');
  const saveBtn = $('#saveBtn');
  const saveState = $('#saveState');

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  const SOCIAL_PLATFORMS = [
    { id: 'instagram', label: 'Instagram' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'x', label: 'X / Twitter' },
    { id: 'behance', label: 'Behance' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'dribbble', label: 'Dribbble' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'custom', label: 'رابط مخصص' },
  ];

  function normalizeSocialLinks(site) {
    if (!site) return [];
    // احترم المصفوفة حتى لو فارغة (لا ترجع للـ legacy بعد الحذف)
    if (Array.isArray(site.socialLinks)) {
      return site.socialLinks.map((s) => ({
        id: s.id || uid('soc'),
        platform: s.platform || 'custom',
        label: s.label || s.platform || 'رابط',
        url: s.url == null ? '' : String(s.url),
      }));
    }
    const legacy = site.socials || {};
    return Object.keys(legacy).map((platform) => ({
      id: uid('soc'),
      platform,
      label: (SOCIAL_PLATFORMS.find((p) => p.id === platform) || {}).label || platform,
      url: legacy[platform] || '',
    }));
  }

  function syncSocialsObject(site) {
    if (!site) return;
    const links = Array.isArray(site.socialLinks) ? site.socialLinks : [];
    const obj = {};
    links.forEach((s) => {
      if (s && s.platform && s.platform !== 'custom') obj[s.platform] = s.url || '#';
    });
    site.socials = obj;
  }

  async function ensureMediaLoaded() {
    if (state._mediaReady) return;
    try {
      await loadMedia();
    } catch (_) {
      state.media = state.media || [];
    }
    state._mediaReady = true;
  }

  function openMediaPicker({ accept = 'image', onPick } = {}) {
    return ensureMediaLoaded().then(() => {
      const items = (state.media || []).filter((m) => {
        if (accept === 'image') return !/\.(mp4|webm|mov|m4v)$/i.test(m.name);
        if (accept === 'video') return /\.(mp4|webm|mov|m4v)$/i.test(m.name);
        return true;
      });
      const overlay = document.createElement('div');
      overlay.className = 'media-picker';
      overlay.innerHTML = `
        <div class="media-picker-box" role="dialog" aria-modal="true" aria-label="مكتبة الوسائط">
          <div class="media-picker-head">
            <h3>اختر من المكتبة</h3>
            <button type="button" class="btn sm" data-mp-close>إغلاق</button>
          </div>
          <p class="muted" style="margin:0 0 12px">ارفع ملفات جديدة من قسم «وسائط» إن لم تجد ما تحتاجه هنا.</p>
          <div class="media-picker-grid">
            ${items.map((m) => `
              <button type="button" class="media-picker-item" data-mp-url="${esc(m.url)}" title="${esc(m.name)}">
                <img src="${esc(m.url)}" alt="" loading="lazy" onerror="this.style.opacity=.2">
                <span>${esc(m.name)}</span>
              </button>`).join('') || '<p class="muted">لا صور في المكتبة بعد — ارفع من قسم الوسائط.</p>'}
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      overlay.querySelector('[data-mp-close]').onclick = close;
      overlay.querySelectorAll('[data-mp-url]').forEach((b) => {
        b.onclick = () => {
          if (typeof onPick === 'function') onPick(b.getAttribute('data-mp-url'));
          close();
        };
      });
    });
  }

  function mediaPickBtn(path) {
    return `<button type="button" class="btn sm" data-pick-media="${esc(path)}">من المكتبة</button>`;
  }

  function resolveApiUrl(url) {
    const base = (window.__WEXON_API_BASE__ || '').replace(/\/+$/, '');
    if (!base) return url;
    return base + url;
  }

  async function api(url, opts = {}) {
    const fullUrl = resolveApiUrl(url);
    const useCredentials = (window.__WEXON_API_BASE__ || '').trim() ? 'include' : 'same-origin';
    const res = await fetch(fullUrl, {
      credentials: useCredentials,
      headers: opts.body && !(opts.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...(opts.headers || {}) }
        : opts.headers,
      ...opts,
      body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'طلب فاشل');
    return data;
  }

  function markDirty(v = true) {
    state.dirty = v;
    saveBtn.disabled = !v;
    saveState.textContent = v ? 'غير محفوظ' : 'محفوظ';
    saveState.className = 'save-state ' + (v ? 'dirty' : 'saved');
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function field(label, keyPath, multiline, full) {
    const val = getPath(state.content, keyPath) ?? '';
    const id = 'f-' + keyPath.replace(/\./g, '-');
    return `<label class="field ${full ? 'full' : ''}">
      <span>${label}</span>
      ${multiline
        ? `<textarea data-path="${keyPath}" id="${id}">${esc(val)}</textarea>`
        : `<input data-path="${keyPath}" id="${id}" value="${esc(val)}">`}
    </label>`;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
  }

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bindFields(root) {
    root.querySelectorAll('[data-path]').forEach((el) => {
      const apply = () => {
        setPath(state.content, el.getAttribute('data-path'), el.value);
        markDirty(true);
      };
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    });
  }

  function bindBooleans(root) {
    root.querySelectorAll('[data-bool]').forEach((el) => {
      el.addEventListener('change', () => {
        setPath(state.content, el.getAttribute('data-bool'), el.checked);
        markDirty(true);
      });
    });
  }

  function renderNav() {
    navEl.innerHTML = SECTIONS.map(
      (s) => `<button type="button" data-nav="${s.id}" class="${state.section === s.id ? 'active' : ''}">${s.title}</button>`
    ).join('');
    navEl.querySelectorAll('[data-nav]').forEach((b) => {
      b.addEventListener('click', () => {
        state.section = b.getAttribute('data-nav');
        render();
      });
    });
  }

  function setHeader() {
    const s = SECTIONS.find((x) => x.id === state.section) || SECTIONS[0];
    $('#pageTitle').textContent = s.title;
    $('#pageSub').textContent = s.sub;
  }

  function renderDashboard() {
    const st = state.stats || { today: 0, week: 0, month: 0, total: 0, last7: [], topPages: [] };
    const max = Math.max(1, ...((st.last7 || []).map((d) => d.count)));
    viewEl.innerHTML = `
      <div class="stat-row">
        <div class="stat"><div class="n">${st.today}</div><div class="l">اليوم</div></div>
        <div class="stat"><div class="n">${st.week}</div><div class="l">آخر 7 أيام</div></div>
        <div class="stat"><div class="n">${st.month}</div><div class="l">آخر 30 يوم</div></div>
        <div class="stat"><div class="n">${st.total}</div><div class="l">الإجمالي</div></div>
      </div>
      <div class="card">
        <div class="section-head"><h2>آخر أسبوع</h2></div>
        <div class="spark">${(st.last7 || []).map((d) => `<span title="${new Date(d.date).toLocaleDateString('ar')}: ${d.count}" style="height:${Math.round((d.count / max) * 100)}%"></span>`).join('')}</div>
      </div>
      <div class="card">
        <div class="section-head"><h2>أكثر الصفحات زيارة</h2></div>
        <table class="table">
          <thead><tr><th>المسار</th><th>الزيارات</th></tr></thead>
          <tbody>
            ${(st.topPages || []).map((p) => `<tr><td><code>${esc(p.path)}</code></td><td>${p.count}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">لا بيانات بعد</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function renderTexts() {
    viewEl.innerHTML = `
      <div class="card">
        <div class="section-head"><h2>Hero</h2></div>
        <div class="grid-2" style="margin-top:14px">
          ${field('Eyebrow', 'hero.eyebrow')}
          ${field('عنوان فرعي', 'hero.subtitle')}
          <label class="field full"><span>العنوان الرئيسي (HTML مسموح لـ br/span)</span>
            <textarea data-path="hero.titleHtml">${esc(state.content.hero.titleHtml)}</textarea>
          </label>
          ${field('الوصف', 'hero.description', true, true)}
          ${field('زر أساسي', 'hero.ctaPrimary')}
          ${field('زر ثانوي', 'hero.ctaSecondary')}
          ${field('رابط فيديو الخلفية (اختياري)', 'hero.videoSrc', false, true)}
        </div>
      </div>
      <div class="card">
        <div class="section-head"><h2>تواصل</h2></div>
        <div class="grid-2" style="margin-top:14px">
          ${field('تسمية القسم', 'contact.label')}
          ${field('العنوان', 'contact.title')}
          ${field('وصف', 'contact.subtitle', true, true)}
          ${field('Placeholder الاسم', 'contact.namePlaceholder')}
          ${field('Placeholder النوع', 'contact.typePlaceholder')}
          ${field('Placeholder الرسالة', 'contact.msgPlaceholder')}
          ${field('نص الزر', 'contact.button')}
        </div>
      </div>
      <div class="card">
        <div class="section-head"><h2>فوتر</h2></div>
        <div class="grid-2" style="margin-top:14px">
          ${field('نبذة', 'footer.blurb', true, true)}
          ${field('حقوق النشر', 'footer.copyright', false, true)}
        </div>
      </div>`;
    bindFields(viewEl);
  }

  function itemActions(kind, id) {
    return `<div class="item-actions">
      <button type="button" class="btn sm" data-up="${kind}:${id}">↑</button>
      <button type="button" class="btn sm" data-down="${kind}:${id}">↓</button>
      <button type="button" class="btn sm danger" data-del="${kind}:${id}">حذف</button>
    </div>`;
  }

  function renderServices() {
    const list = state.content.services || [];
    viewEl.innerHTML = `
      <div class="section-head">
        <h2>الخدمات (${list.length})</h2>
        <button type="button" class="btn primary sm" id="addService">+ إضافة خدمة</button>
      </div>
      <div class="list">
        ${list.map((s, i) => `
          <div class="item" data-id="${esc(s.id)}">
            <img class="thumb" src="${esc(s.image || '')}" alt="" onerror="this.style.opacity=.25">
            <div class="item-fields">
              <label class="field"><span>الرقم</span><input data-arr="services.${i}.index" value="${esc(s.index || '')}"></label>
              <label class="field"><span>المحاذاة</span>
                <select data-arr="services.${i}.align">
                  <option value="end" ${s.align === 'end' ? 'selected' : ''}>نص يمين / صورة يسار</option>
                  <option value="start" ${s.align === 'start' ? 'selected' : ''}>نص يسار / صورة يمين</option>
                </select>
              </label>
              <label class="field full"><span>العنوان</span><input data-arr="services.${i}.title" value="${esc(s.title || '')}"></label>
              <label class="field full"><span>الوصف</span><textarea data-arr="services.${i}.description">${esc(s.description || '')}</textarea></label>
              <label class="field"><span>نص الزر</span><input data-arr="services.${i}.cta" value="${esc(s.cta || '')}"></label>
              <label class="field"><span>رابط الصورة</span><input data-arr="services.${i}.image" value="${esc(s.image || '')}"></label>
              <label class="field full"><span>وجهة زر الخدمة</span><input data-arr="services.${i}.link" value="${esc(s.link || '')}" placeholder="/gallery أو #contact"></label>
            </div>
            ${itemActions('services', s.id)}
          </div>`).join('') || '<div class="card muted">لا خدمات بعد</div>'}
      </div>`;
    bindArray(viewEl);
    $('#addService').onclick = () => {
      state.content.services.push({
        id: uid('svc'),
        index: String(state.content.services.length + 1).padStart(2, '0'),
        title: 'خدمة جديدة',
        description: '',
        cta: 'اكتشف الخدمة →',
        image: '',
        link: '#contact',
        align: state.content.services.length % 2 ? 'start' : 'end',
      });
      markDirty(true);
      render();
    };
  }

  function ensureCaseStudy(w) {
    if (!w.caseStudy || typeof w.caseStudy !== 'object') w.caseStudy = {};
    if (!Array.isArray(w.caseStudy.phases)) w.caseStudy.phases = [];
    if (!Array.isArray(w.caseStudy.gallery)) w.caseStudy.gallery = [];
    return w.caseStudy;
  }

  function caseStudyEditor(listKey, i, w) {
    const cs = ensureCaseStudy(w);
    const base = `works.${listKey}.${i}`;
    const kind = listKey === 'videos' ? 'film' : 'work';
    const url = '/' + kind + '/' + encodeURIComponent(w.slug || w.id);
    return `<details class="cs-editor">
      <summary>صفحة المشروع (دراسة الحالة) — <a href="${esc(url)}" target="_blank" rel="noopener">معاينة ↗</a></summary>
      <div class="grid-2">
        <label class="field full"><span>الرابط الذكي Slug (إنجليزي بشرطات — يظهر في عنوان الصفحة)</span>
          <input data-arr="${base}.slug" value="${esc(w.slug || '')}" placeholder="${esc(w.id)}" dir="ltr"></label>
        <label class="field full"><span>النبذة / التحدي</span><textarea data-arr="${base}.caseStudy.intro">${esc(cs.intro || '')}</textarea></label>
        <label class="field full"><span>الهدف</span><textarea data-arr="${base}.caseStudy.objective">${esc(cs.objective || '')}</textarea></label>
        <label class="field"><span>الخدمات (مفصولة بفواصل)</span><input data-arr="${base}.caseStudy.services" value="${esc(cs.services || '')}"></label>
        <label class="field"><span>الأدوات (مفصولة بفواصل)</span><input data-arr="${base}.caseStudy.tools" value="${esc(cs.tools || '')}"></label>
        ${listKey === 'images' ? `<label class="field full"><span>لوحة الألوان (hex مفصولة بفواصل)</span><input data-arr="${base}.caseStudy.palette" value="${esc(cs.palette || '')}" placeholder="#3e2f23,#c8a06b" dir="ltr"></label>` : ''}
        <label class="field full"><span>النتيجة / الأثر</span><textarea data-arr="${base}.caseStudy.outcome">${esc(cs.outcome || '')}</textarea></label>
        <label class="field full"><span>اقتباس العميل</span><textarea data-arr="${base}.caseStudy.quote">${esc(cs.quote || '')}</textarea></label>
        <label class="field"><span>صاحب الاقتباس</span><input data-arr="${base}.caseStudy.quoteAuthor" value="${esc(cs.quoteAuthor || '')}"></label>
        <label class="field full"><span>معرض لقطات العمل (رابط في كل سطر)</span>
          <textarea data-cs-gallery="${listKey}:${i}" dir="ltr">${esc(cs.gallery.join('\n'))}</textarea></label>
      </div>
      <div class="cs-phases-admin">
        <h4>مراحل العمل (${listKey === 'videos' ? 'فكرة، سكربت، ستوري بورد، مونتاج، صوت…' : 'بحث، شعار، ألوان، تطبيقات…'})</h4>
        ${cs.phases.map((p, j) => `<div class="item cs-phase-row">
          <div class="grid-2">
            <label class="field"><span>عنوان المرحلة ${j + 1}</span><input data-arr="${base}.caseStudy.phases.${j}.title" value="${esc(p.title || '')}"></label>
            <label class="field"><span>وسيط المرحلة (صورة أو فيديو)</span><input data-arr="${base}.caseStudy.phases.${j}.media" value="${esc(p.media || '')}" placeholder="/uploads/..." dir="ltr"></label>
            <label class="field full"><span>وصف المرحلة</span><textarea data-arr="${base}.caseStudy.phases.${j}.body">${esc(p.body || '')}</textarea></label>
          </div>
          <div class="item-actions"><button type="button" class="btn sm danger" data-cs-delphase="${listKey}:${i}:${j}">حذف المرحلة</button></div>
        </div>`).join('') || '<p class="muted">لا مراحل بعد — أضف أول مرحلة</p>'}
        <button type="button" class="btn sm" data-cs-addphase="${listKey}:${i}">+ إضافة مرحلة</button>
      </div>
    </details>`;
  }

  function bindCaseStudy(root) {
    root.querySelectorAll('[data-cs-gallery]').forEach((el) => {
      const apply = () => {
        const [listKey, i] = el.getAttribute('data-cs-gallery').split(':');
        const w = state.content.works[listKey][Number(i)];
        ensureCaseStudy(w).gallery = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
        markDirty(true);
      };
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    });
    root.querySelectorAll('[data-cs-addphase]').forEach((b) => {
      b.onclick = () => {
        const [listKey, i] = b.getAttribute('data-cs-addphase').split(':');
        const w = state.content.works[listKey][Number(i)];
        ensureCaseStudy(w).phases.push({ title: '', body: '', media: '' });
        markDirty(true);
        render();
      };
    });
    root.querySelectorAll('[data-cs-delphase]').forEach((b) => {
      b.onclick = () => {
        const [listKey, i, j] = b.getAttribute('data-cs-delphase').split(':');
        const w = state.content.works[listKey][Number(i)];
        ensureCaseStudy(w).phases.splice(Number(j), 1);
        markDirty(true);
        render();
      };
    });
  }

  function renderWorksImages() {
    const list = state.content.works.images || [];
    viewEl.innerHTML = `
      <div class="card grid-2">
        ${field('تسمية القسم', 'works.imagesLabel')}
        ${field('عنوان القسم', 'works.imagesTitle')}
      </div>
      <div class="card">
        <div class="section-head"><h2>صفحة معرض التصاميم</h2><a class="ghost" href="/gallery" target="_blank" rel="noopener">معاينة ↗</a></div>
        <div class="grid-2" style="margin-top:14px">
          ${field('Eyebrow', 'works.gallery.eyebrow')}
          ${field('العنوان', 'works.gallery.title')}
          ${field('الوصف', 'works.gallery.description', true, true)}
          ${field('نص CTA', 'works.gallery.cta')}
          ${field('SEO Title', 'works.gallery.seoTitle')}
          ${field('SEO Description', 'works.gallery.seoDescription', true, true)}
        </div>
      </div>
      <div class="section-head">
        <h2>المشاريع (${list.length})</h2>
        <button type="button" class="btn primary sm" id="addWi">+ مشروع</button>
      </div>
      <div class="list">
        ${list.map((w, i) => `
          <div class="item">
            <img class="thumb" src="${esc(w.cover || '')}" alt="" onerror="this.style.opacity=.25">
            <div class="item-fields">
              <label class="field"><span>التصنيف / الخدمة</span><input data-arr="works.images.${i}.tag" value="${esc(w.tag || '')}"></label>
              <label class="field"><span>العنوان</span><input data-arr="works.images.${i}.title" value="${esc(w.title || '')}"></label>
              <label class="field"><span>العميل</span><input data-arr="works.images.${i}.client" value="${esc(w.client || '')}"></label>
              <label class="field"><span>السنة</span><input data-arr="works.images.${i}.year" value="${esc(w.year || '')}"></label>
              <label class="field"><span>المدة</span><input data-arr="works.images.${i}.duration" value="${esc(w.duration || '')}"></label>
              <label class="field check"><span>يظهر في الهوم</span><input type="checkbox" data-bool="works.images.${i}.showOnHome" ${w.showOnHome !== false ? 'checked' : ''}></label>
              <label class="field check"><span>منشور في المعرض</span><input type="checkbox" data-bool="works.images.${i}.published" ${w.published !== false ? 'checked' : ''}></label>
              <label class="field full"><span>الغلاف (رابط)</span><input data-arr="works.images.${i}.cover" value="${esc(w.cover || '')}"></label>
              <label class="field full"><span>التفاصيل</span><textarea data-arr="works.images.${i}.detail">${esc(w.detail || '')}</textarea></label>
              ${caseStudyEditor('images', i, w)}
            </div>
            ${itemActions('works.images', w.id)}
          </div>`).join('')}
      </div>`;
    bindFields(viewEl);
    bindArray(viewEl);
    bindBooleans(viewEl);
    bindCaseStudy(viewEl);
    $('#addWi').onclick = () => {
      state.content.works.images.push({
        id: uid('wi'),
        tag: 'PROJECT',
        title: 'مشروع جديد',
        cover: '',
        detail: '',
        client: '',
        year: String(new Date().getFullYear()),
        duration: '',
        showOnHome: false,
        published: true,
      });
      markDirty(true);
      render();
    };
  }

  function renderWorksVideos() {
    const list = state.content.works.videos || [];
    viewEl.innerHTML = `
      <div class="card grid-2">
        ${field('تسمية القسم', 'works.videosLabel')}
        ${field('عنوان القسم', 'works.videosTitle')}
      </div>
      <div class="card">
        <div class="section-head"><h2>صفحة معرض الفيديو</h2><a class="ghost" href="/video-gallery" target="_blank" rel="noopener">معاينة ↗</a></div>
        <div class="grid-2" style="margin-top:14px">
          ${field('Eyebrow', 'works.videoGallery.eyebrow')}
          ${field('العنوان', 'works.videoGallery.title')}
          ${field('الوصف', 'works.videoGallery.description', true, true)}
          ${field('نص CTA', 'works.videoGallery.cta')}
          ${field('SEO Title', 'works.videoGallery.seoTitle')}
          ${field('SEO Description', 'works.videoGallery.seoDescription', true, true)}
        </div>
      </div>
      <div class="section-head">
        <h2>الفيديوهات (${list.length})</h2>
        <button type="button" class="btn primary sm" id="addWv">+ فيديو</button>
      </div>
      <div class="list">
        ${list.map((w, i) => `
          <div class="item">
            <img class="thumb ${w.size === 'tall' ? 'tall' : ''}" src="${esc(w.cover || '')}" alt="" onerror="this.style.opacity=.25">
            <div class="item-fields">
              <label class="field"><span>التصنيف</span><input data-arr="works.videos.${i}.tag" value="${esc(w.tag || '')}"></label>
              <label class="field"><span>المقاس</span>
                <select data-arr="works.videos.${i}.size">
                  <option value="wide" ${w.size === 'wide' ? 'selected' : ''}>عريض 420×236</option>
                  <option value="tall" ${w.size === 'tall' ? 'selected' : ''}>طولي 250×444</option>
                </select>
              </label>
              <label class="field full"><span>العنوان</span><input data-arr="works.videos.${i}.title" value="${esc(w.title || '')}"></label>
              <label class="field check"><span>يظهر في الهوم</span><input type="checkbox" data-bool="works.videos.${i}.showOnHome" ${w.showOnHome !== false ? 'checked' : ''}></label>
              <label class="field check"><span>منشور في المعرض</span><input type="checkbox" data-bool="works.videos.${i}.published" ${w.published !== false ? 'checked' : ''}></label>
              <label class="field check"><span>تشغيل متكرر Loop</span><input type="checkbox" data-bool="works.videos.${i}.loop" ${w.loop !== false ? 'checked' : ''}></label>
              <label class="field full"><span>الغلاف</span><input data-arr="works.videos.${i}.cover" value="${esc(w.cover || '')}"></label>
              <label class="field full"><span>رابط الفيديو (m3u8 / mp4)</span><input data-arr="works.videos.${i}.videoUrl" value="${esc(w.videoUrl || '')}"></label>
              <label class="field"><span>العميل</span><input data-arr="works.videos.${i}.client" value="${esc(w.client || '')}"></label>
              <label class="field"><span>السنة</span><input data-arr="works.videos.${i}.year" value="${esc(w.year || '')}"></label>
              <label class="field"><span>المدة</span><input data-arr="works.videos.${i}.duration" value="${esc(w.duration || '')}"></label>
              <label class="field full"><span>التفاصيل</span><textarea data-arr="works.videos.${i}.detail">${esc(w.detail || '')}</textarea></label>
              ${caseStudyEditor('videos', i, w)}
            </div>
            ${itemActions('works.videos', w.id)}
          </div>`).join('')}
      </div>`;
    bindFields(viewEl);
    bindArray(viewEl);
    bindBooleans(viewEl);
    bindCaseStudy(viewEl);
    $('#addWv').onclick = () => {
      state.content.works.videos.push({
        id: uid('wv'),
        tag: 'REEL',
        title: 'عمل مرئي جديد',
        cover: '',
        videoUrl: '',
        size: 'tall',
        showOnHome: false,
        published: true,
        loop: true,
      });
      markDirty(true);
      render();
    };
  }

  function renderTeam() {
    const list = state.content.team || [];
    viewEl.innerHTML = `
      <div class="section-head">
        <h2>الأعضاء (${list.length})</h2>
        <button type="button" class="btn primary sm" id="addTm">+ عضو</button>
      </div>
      <div class="list">
        ${list.map((m, i) => `
          <div class="item">
            <img class="thumb tall" src="${esc(m.image || '')}" alt="" onerror="this.style.opacity=.25">
            <div class="item-fields">
              <label class="field"><span>الاسم</span><input data-arr="team.${i}.name" value="${esc(m.name || '')}"></label>
              <label class="field"><span>المسمّى</span><input data-arr="team.${i}.role" value="${esc(m.role || '')}"></label>
              <label class="field full"><span>الصورة</span><input data-arr="team.${i}.image" value="${esc(m.image || '')}"></label>
            </div>
            ${itemActions('team', m.id)}
          </div>`).join('')}
      </div>`;
    bindArray(viewEl);
    $('#addTm').onclick = () => {
      state.content.team.push({ id: uid('tm'), name: 'عضو جديد', role: 'دور', image: '' });
      markDirty(true);
      render();
    };
  }

  function logosEditor(key, label) {
    const arr = state.content.partners[key] || [];
    return `<div class="card">
      <div class="section-head">
        <h2>${label}</h2>
        <button type="button" class="btn sm" data-add-logo="${key}">+ شعار</button>
      </div>
      <div class="list" style="margin-top:12px">
        ${arr.map((item, i) => {
          const logo = typeof item === 'string' ? { name: item, image: '' } : (item || {});
          const imgPath = `partners.${key}.${i}.image`;
          return `
          <div class="item" data-id="${key}-${i}">
            <img class="thumb" src="${esc(logo.image || '')}" alt="" onerror="this.style.opacity=.2">
            <div class="item-fields">
              <label class="field"><span>الاسم (alt)</span>
                <input data-arr="partners.${key}.${i}.name" value="${esc(logo.name || '')}">
              </label>
              <label class="field full"><span>صورة الشعار</span>
                <div class="media-input-row">
                  <input data-arr="${imgPath}" value="${esc(logo.image || '')}" placeholder="/uploads/logo.png" dir="ltr">
                  ${mediaPickBtn(imgPath)}
                </div>
              </label>
            </div>
            <div class="item-actions">
              <button type="button" class="btn sm danger" data-del-logo="${key}:${i}">حذف</button>
            </div>
          </div>`;
        }).join('') || '<p class="muted">فارغ — اضغط «+ شعار» واختر صورة من المكتبة</p>'}
      </div>
    </div>`;
  }

  function bindMediaPickers(root) {
    root.querySelectorAll('[data-pick-media]').forEach((b) => {
      b.onclick = () => {
        const path = b.getAttribute('data-pick-media');
        openMediaPicker({
          accept: 'image',
          onPick: (url) => {
            setPath(state.content, path, url);
            const input = root.querySelector(`[data-arr="${path}"], [data-path="${path}"]`);
            if (input) input.value = url;
            const item = b.closest('.item');
            const thumb = item && item.querySelector('img.thumb');
            if (thumb) { thumb.src = url; thumb.style.opacity = '1'; }
            markDirty(true);
          },
        });
      };
    });
  }

  function renderPartners() {
    // normalize legacy string logos → {name,image}
    ['logosA', 'logosB', 'logosC'].forEach((k) => {
      const arr = state.content.partners[k] || [];
      state.content.partners[k] = arr.map((x) => (typeof x === 'string' ? { name: x, image: '' } : x));
    });
    viewEl.innerHTML = `
      <div class="card">${field('تسمية القسم', 'partners.label', false, true)}</div>
      <p class="muted" style="margin:0 0 12px">ارفع الشعارات من «وسائط»، ثم من هنا اضغط «من المكتبة» لاختيارها (يفضّل PNG شفاف).</p>
      ${logosEditor('logosA', 'الصف الأول')}
      ${logosEditor('logosB', 'الصف الثاني')}
      ${logosEditor('logosC', 'الصف الثالث')}`;
    bindFields(viewEl);
    bindArray(viewEl);
    bindMediaPickers(viewEl);
    viewEl.querySelectorAll('[data-add-logo]').forEach((b) => {
      b.onclick = () => {
        const key = b.getAttribute('data-add-logo');
        state.content.partners[key].push({ name: 'عميل جديد', image: '' });
        markDirty(true);
        render();
      };
    });
    viewEl.querySelectorAll('[data-del-logo]').forEach((b) => {
      b.onclick = () => {
        const [key, idx] = b.getAttribute('data-del-logo').split(':');
        state.content.partners[key].splice(Number(idx), 1);
        markDirty(true);
        render();
      };
    });
  }

  function renderTestimonials() {
    const list = state.content.testimonials || [];
    viewEl.innerHTML = `
      <div class="section-head">
        <h2>الشهادات (${list.length})</h2>
        <button type="button" class="btn primary sm" id="addTs">+ شهادة</button>
      </div>
      <div class="list">
        ${list.map((t, i) => `
          <div class="item" data-id="${esc(t.id)}">
            <img class="thumb round" src="${esc(t.avatar || '')}" alt="" onerror="this.style.opacity=.25">
            <div class="item-fields">
              <label class="field full"><span>الاقتباس</span><textarea data-arr="testimonials.${i}.quote">${esc(t.quote || '')}</textarea></label>
              <label class="field"><span>الاسم</span><input data-arr="testimonials.${i}.name" value="${esc(t.name || '')}"></label>
              <label class="field"><span>الدور / الشركة</span><input data-arr="testimonials.${i}.role" value="${esc(t.role || '')}"></label>
              <label class="field full"><span>صورة دائرية (رابط PNG/JPG أو من الوسائط)</span><input data-arr="testimonials.${i}.avatar" value="${esc(t.avatar || '')}" placeholder="/uploads/..."></label>
            </div>
            ${itemActions('testimonials', t.id)}
          </div>`).join('') || '<div class="card muted">لا آراء بعد</div>'}
      </div>`;
    bindArray(viewEl);
    $('#addTs').onclick = () => {
      state.content.testimonials.push({ id: uid('ts'), quote: '', name: '', role: '', avatar: '' });
      markDirty(true);
      render();
    };
  }

  function ensureSeo() {
    if (!state.content.seo) state.content.seo = {};
    const s = state.content.seo;
    if (!s.geo) s.geo = {};
    if (!Array.isArray(s.geo.faqs)) s.geo.faqs = [];
    if (s.robotsIndex === undefined) s.robotsIndex = true;
    if (s.robotsFollow === undefined) s.robotsFollow = true;
    const g = s.geo;
    if (g.allowGptBot === undefined) g.allowGptBot = true;
    if (g.allowGoogleExtended === undefined) g.allowGoogleExtended = true;
    if (g.allowPerplexity === undefined) g.allowPerplexity = true;
  }

  function check(label, keyPath) {
    const on = !!getPath(state.content, keyPath);
    return `<label class="field check"><span>${label}</span>
      <input type="checkbox" data-bool="${keyPath}" ${on ? 'checked' : ''}>
    </label>`;
  }

  function renderSeo() {
    ensureSeo();
    const faqs = state.content.seo.geo.faqs || [];
    viewEl.innerHTML = `
      <div class="card">
        <div class="section-head"><h2>SEO أساسي</h2></div>
        <p class="muted" style="margin:8px 0 0">يظهر في جوجل ومعاينات الروابط (Open Graph / Twitter).</p>
        <div class="grid-2" style="margin-top:14px">
          ${field('عنوان الصفحة (Title)', 'seo.title', false, true)}
          ${field('الرابط الأساسي Canonical (https://...)', 'seo.canonical', false, true)}
          ${field('الوصف Meta Description', 'seo.description', true, true)}
          ${field('كلمات مفتاحية (اختياري)', 'seo.keywords', false, true)}
          ${field('صورة المشاركة OG (رابط)', 'seo.ogImage', false, true)}
          ${field('لغة / Locale', 'seo.locale')}
          ${field('عنوان OG بديل', 'seo.ogTitle')}
          ${field('وصف OG بديل', 'seo.ogDescription', true)}
          ${check('السماح بالفهرسة (index)', 'seo.robotsIndex')}
          ${check('السماح بتتبع الروابط (follow)', 'seo.robotsFollow')}
        </div>
      </div>

      <div class="card">
        <div class="section-head"><h2>GEO — محركات الذكاء الاصطناعي</h2></div>
        <p class="muted" style="margin:8px 0 0">ملخص قابل للاقتباس + Schema + ملف <code>/llms.txt</code> لـ ChatGPT / Perplexity / AI Overviews.</p>
        <div class="grid-2" style="margin-top:14px">
          ${field('ملخص الوكالة (40–70 كلمة — أهم فقرة للـ AI)', 'seo.geo.summary', true, true)}
          ${field('نوع المنظمة (Schema)', 'seo.geo.organizationType')}
          ${field('مناطق الخدمة', 'seo.geo.areaServed')}
          ${field('البريد الرسمي', 'seo.geo.email')}
          ${field('سنة التأسيس', 'seo.geo.foundingDate')}
          ${field('روابط الهوية sameAs (سطر لكل رابط: LinkedIn, IG, Wikipedia...)', 'seo.geo.sameAs', true, true)}
          ${field('محتوى llms.txt مخصص (اتركه فارغاً للتوليد التلقائي)', 'seo.geo.llmsTxt', true, true)}
          ${check('السماح لـ GPTBot', 'seo.geo.allowGptBot')}
          ${check('السماح لـ Google-Extended', 'seo.geo.allowGoogleExtended')}
          ${check('السماح لـ PerplexityBot', 'seo.geo.allowPerplexity')}
        </div>
        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <a class="ghost" href="/llms.txt" target="_blank" rel="noopener">معاينة llms.txt ↗</a>
          <a class="ghost" href="/robots.txt" target="_blank" rel="noopener">معاينة robots.txt ↗</a>
          <a class="ghost" href="/sitemap.xml" target="_blank" rel="noopener">معاينة sitemap.xml ↗</a>
        </div>
      </div>

      <div class="card">
        <div class="section-head">
          <h2>أسئلة شائعة (FAQ Schema)</h2>
          <button type="button" class="btn primary sm" id="addFaq">+ سؤال</button>
        </div>
        <p class="muted" style="margin:8px 0 12px">أسئلة قصيرة بإجابات مباشرة — مفيدة لجوجل وللـ AI citations.</p>
        <div class="list">
          ${faqs.map((f, i) => `
            <div class="item plain">
              <div class="item-fields">
                <label class="field full"><span>السؤال</span><input data-arr="seo.geo.faqs.${i}.q" value="${esc(f.q || '')}"></label>
                <label class="field full"><span>الإجابة</span><textarea data-arr="seo.geo.faqs.${i}.a">${esc(f.a || '')}</textarea></label>
              </div>
              <div class="item-actions">
                <button type="button" class="btn sm danger" data-del-faq="${i}">حذف</button>
              </div>
            </div>`).join('') || '<p class="muted">لا أسئلة بعد</p>'}
        </div>
      </div>`;
    bindFields(viewEl);
    bindArray(viewEl);
    viewEl.querySelectorAll('[data-bool]').forEach((el) => {
      el.addEventListener('change', () => {
        setPath(state.content, el.getAttribute('data-bool'), el.checked);
        markDirty(true);
      });
    });
    $('#addFaq').onclick = () => {
      ensureSeo();
      state.content.seo.geo.faqs.push({ q: '', a: '' });
      markDirty(true);
      render();
    };
    viewEl.querySelectorAll('[data-del-faq]').forEach((b) => {
      b.onclick = () => {
        state.content.seo.geo.faqs.splice(Number(b.getAttribute('data-del-faq')), 1);
        markDirty(true);
        render();
      };
    });
  }

  function renderSettings() {
    if (!state.content.site) state.content.site = {};
    state.content.site.socialLinks = normalizeSocialLinks(state.content.site);
    syncSocialsObject(state.content.site);
    const links = state.content.site.socialLinks;

    viewEl.innerHTML = `
      <div class="card">
        <div class="section-head"><h2>العلامة</h2></div>
        <div class="grid-2" style="margin-top:14px">
          ${field('اسم العلامة', 'site.brand')}
          ${field('واتساب (دولي بدون +)', 'site.whatsapp')}
        </div>
      </div>

      <div class="card social-card" style="margin-top:14px">
        <div class="section-head">
          <div>
            <h2>روابط التواصل</h2>
            <p class="muted social-lead">أضف المنصات التي تظهر في الفوتر — احذف أو أعد الترتيب بحرية.</p>
          </div>
        </div>

        <div class="social-table" data-social-root>
          <div class="social-table-head" aria-hidden="true">
            <span>المنصة</span>
            <span>الرابط</span>
            <span></span>
          </div>
          ${links.map((s, i) => {
            const isCustom = s.platform === 'custom';
            return `
            <div class="social-row" data-soc-i="${i}">
              <label class="social-platform">
                <select data-soc-field="platform" data-soc-i="${i}" aria-label="المنصة">
                  ${SOCIAL_PLATFORMS.map((p) => `<option value="${p.id}" ${s.platform === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
                </select>
              </label>
              <div class="social-url-wrap">
                ${isCustom ? `<input class="social-label-input" data-soc-field="label" data-soc-i="${i}" value="${esc(s.label || '')}" placeholder="اسم الرابط" aria-label="التسمية">` : ''}
                <input data-soc-field="url" data-soc-i="${i}" value="${esc(s.url || '')}" placeholder="https://..." dir="ltr" aria-label="الرابط">
              </div>
              <div class="social-actions">
                <button type="button" class="icon-btn" data-soc-up="${i}" aria-label="أعلى" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="icon-btn" data-soc-down="${i}" aria-label="أسفل" ${i === links.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="icon-btn danger" data-soc-del="${i}" aria-label="حذف">✕</button>
              </div>
            </div>`;
          }).join('') || '<p class="muted social-empty">لا روابط بعد.</p>'}
        </div>

        <div class="social-add-row">
          <button type="button" class="btn primary" data-add-social>+ إضافة منصة</button>
        </div>
      </div>`;

    bindFields(viewEl);

    const commit = () => {
      syncSocialsObject(state.content.site);
      markDirty(true);
    };

    const root = viewEl.querySelector('[data-social-root]') || viewEl;

    viewEl.querySelectorAll('[data-soc-field]').forEach((el) => {
      const apply = () => {
        const i = Number(el.getAttribute('data-soc-i'));
        const fieldName = el.getAttribute('data-soc-field');
        const row = state.content.site.socialLinks[i];
        if (!row) return;
        row[fieldName] = el.value;
        if (fieldName === 'platform') {
          const preset = SOCIAL_PLATFORMS.find((p) => p.id === el.value);
          if (preset) row.label = preset.label;
          // إعادة الرسم فقط عند التحويل من/إلى مخصص لإظهار حقل الاسم
          commit();
          renderSettings();
          return;
        }
        commit();
      };
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    });

    const addBtn = viewEl.querySelector('[data-add-social]');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!Array.isArray(state.content.site.socialLinks)) state.content.site.socialLinks = [];
        state.content.site.socialLinks.push({
          id: uid('soc'),
          platform: 'tiktok',
          label: 'TikTok',
          url: '',
        });
        commit();
        renderSettings();
      });
    }

    viewEl.querySelectorAll('[data-soc-del]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        state.content.site.socialLinks.splice(Number(b.getAttribute('data-soc-del')), 1);
        commit();
        renderSettings();
      });
    });

    viewEl.querySelectorAll('[data-soc-up],[data-soc-down]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const up = b.hasAttribute('data-soc-up');
        const i = Number(up ? b.getAttribute('data-soc-up') : b.getAttribute('data-soc-down'));
        const j = up ? i - 1 : i + 1;
        const arr = state.content.site.socialLinks;
        if (!arr || j < 0 || j >= arr.length) return;
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
        commit();
        renderSettings();
      });
    });

    void root;
  }

  async function loadMedia() {
    const data = await api('/api/admin/media');
    state.media = data.items || [];
  }

  function renderMedia() {
    viewEl.innerHTML = `
      <div class="card upload-bar">
        <input type="file" id="fileInput" accept="image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov">
        <button type="button" class="btn primary sm" id="uploadBtn">رفع</button>
        <span class="muted">حتى 120MB — صور أو فيديو (mp4 / webm / mov)</span>
      </div>
      <div class="media-grid">
        ${state.media.map((m) => {
          const isVid = /\.(mp4|webm|mov|m4v)$/i.test(m.name);
          return `
          <div class="media-card">
            ${isVid
              ? `<video src="${esc(m.url)}" muted playsinline style="width:100%;height:120px;object-fit:cover;background:#000"></video>`
              : `<img src="${esc(m.url)}" alt="" onerror="this.style.opacity=.2">`}
            <div class="meta">
              <code>${esc(m.url)}</code>
              <div class="row">
                <button type="button" class="btn sm" data-copy="${esc(m.url)}">نسخ</button>
                <button type="button" class="btn sm danger" data-rm="${esc(m.name)}">حذف</button>
              </div>
            </div>
          </div>`;
        }).join('') || '<p class="muted">لا ملفات مرفوعة</p>'}
      </div>`;
    $('#uploadBtn').onclick = async () => {
      const file = $('#fileInput').files[0];
      if (!file) return alert('اختر ملفاً');
      const fd = new FormData();
      fd.append('file', file);
      try {
        await api('/api/admin/media', { method: 'POST', body: fd });
        state._mediaReady = false;
        await loadMedia();
        state._mediaReady = true;
        render();
      } catch (e) {
        alert(e.message);
      }
    };
    viewEl.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = async () => {
        try {
          await navigator.clipboard.writeText(b.getAttribute('data-copy'));
          b.textContent = 'تم';
          setTimeout(() => (b.textContent = 'نسخ'), 1000);
        } catch {
          prompt('انسخ الرابط:', b.getAttribute('data-copy'));
        }
      };
    });
    viewEl.querySelectorAll('[data-rm]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('حذف الملف؟')) return;
        try {
          await api('/api/admin/media/' + encodeURIComponent(b.getAttribute('data-rm')), { method: 'DELETE' });
          await loadMedia();
          render();
        } catch (e) {
          alert(e.message);
        }
      };
    });
  }

  function resolveArray(path) {
    // partners.logosA.0 or works.images.0.tag or services.0.title
    const parts = path.split('.');
    let cur = state.content;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      const n = Number(p);
      cur = Number.isInteger(n) && String(n) === p ? cur[n] : cur[p];
    }
    return { parent: cur, key: parts[parts.length - 1], parts };
  }

  function bindArray(root) {
    root.querySelectorAll('[data-arr]').forEach((el) => {
      const apply = () => {
        const path = el.getAttribute('data-arr');
        const parts = path.split('.');
        let cur = state.content;
        for (let i = 0; i < parts.length - 1; i++) {
          const p = parts[i];
          const n = Number(p);
          cur = Number.isInteger(n) && String(n) === p ? cur[n] : cur[p];
        }
        const last = parts[parts.length - 1];
        const nLast = Number(last);
        if (Number.isInteger(nLast) && String(nLast) === last && Array.isArray(cur)) {
          cur[nLast] = el.value;
        } else {
          cur[last] = el.value;
        }
        markDirty(true);
      };
      el.addEventListener('input', apply);
      el.addEventListener('change', apply);
    });

    root.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => {
        const [kind, id] = b.getAttribute('data-del').split(':');
        const arr = getPath(state.content, kind);
        if (!Array.isArray(arr)) return;
        const idx = arr.findIndex((x) => x && x.id === id);
        if (idx >= 0) arr.splice(idx, 1);
        markDirty(true);
        render();
      };
    });

    root.querySelectorAll('[data-up],[data-down]').forEach((b) => {
      b.onclick = () => {
        const attr = b.hasAttribute('data-up') ? 'data-up' : 'data-down';
        const [kind, id] = b.getAttribute(attr).split(':');
        const arr = getPath(state.content, kind);
        if (!Array.isArray(arr)) return;
        const idx = arr.findIndex((x) => x && x.id === id);
        if (idx < 0) return;
        const swap = attr === 'data-up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= arr.length) return;
        const tmp = arr[idx];
        arr[idx] = arr[swap];
        arr[swap] = tmp;
        markDirty(true);
        render();
      };
    });
  }

  async function render() {
    renderNav();
    setHeader();
    if (state.section === 'dashboard') {
      try {
        state.stats = await api('/api/admin/stats');
      } catch (_) {
        state.stats = null;
      }
      renderDashboard();
    } else if (state.section === 'texts') renderTexts();
    else if (state.section === 'services') renderServices();
    else if (state.section === 'worksImages') renderWorksImages();
    else if (state.section === 'worksVideos') renderWorksVideos();
    else if (state.section === 'team') renderTeam();
    else if (state.section === 'partners') renderPartners();
    else if (state.section === 'testimonials') renderTestimonials();
    else if (state.section === 'settings') renderSettings();
    else if (state.section === 'seo') renderSeo();
    else if (state.section === 'media') {
      try {
        await loadMedia();
      } catch (_) {}
      renderMedia();
    }
  }

  async function save() {
    try {
      if (state.content && state.content.site) {
        state.content.site.socialLinks = normalizeSocialLinks(state.content.site);
        syncSocialsObject(state.content.site);
      }
      await api('/api/admin/content', { method: 'PUT', body: state.content });
      state.baseline = clone(state.content);
      markDirty(false);
    } catch (e) {
      alert(e.message);
    }
  }

  async function enterApp() {
    state.content = await api('/api/content');
    if (state.content && state.content.site) {
      state.content.site.socialLinks = normalizeSocialLinks(state.content.site);
      syncSocialsObject(state.content.site);
    }
    state.baseline = clone(state.content);
    markDirty(false);
    $('#authKey').value = '';
    $('#authConfirm').value = '';
    authEl.hidden = true;
    appEl.hidden = false;
    window.scrollTo(0, 0);
    await render();
  }

  function showAuth(setup) {
    authEl.hidden = false;
    appEl.hidden = true;
    $('#authTitle').textContent = setup ? 'إنشاء مفتاح الدخول' : 'دخول الأدمن';
    $('#authHint').textContent = setup
      ? 'مرة واحدة فقط: اختر مفتاحاً شخصياً (8 أحرف فأكثر). بعدها تدخل به مباشرة للوحة.'
      : 'أدخل مفتاحك للمتابعة إلى لوحة التحكم.';
    $('#authConfirmWrap').hidden = !setup;
    $('#authSubmit').textContent = setup ? 'إنشاء ودخول' : 'دخول';
    $('#authForm').dataset.mode = setup ? 'setup' : 'login';
    window.scrollTo(0, 0);
  }

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = $('#authKey').value;
    const err = $('#authError');
    const btn = $('#authSubmit');
    err.hidden = true;
    btn.disabled = true;
    try {
      if ($('#authForm').dataset.mode === 'setup') {
        const c = $('#authConfirm').value;
        if (key !== c) throw new Error('المفتاحان غير متطابقين');
        await api('/api/admin/setup', { method: 'POST', body: { key } });
      } else {
        await api('/api/admin/login', { method: 'POST', body: { key } });
      }
      await enterApp();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST', body: {} });
    location.reload();
  });

  saveBtn.addEventListener('click', save);

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  (async () => {
    try {
      const st = await api('/api/admin/status');
      if (st.setupRequired) showAuth(true);
      else if (st.authenticated) await enterApp();
      else showAuth(false);
    } catch (e) {
      showAuth(false);
      $('#authError').textContent = e.message;
      $('#authError').hidden = false;
    }
  })();
})();
