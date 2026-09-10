# بنية Redeploy متوافقة مع Cloudflare

## الخلاصة

المشروع الحالي يعمل على Node.js + Express ويعتمد على:

- قراءة/كتابة ملفات محلية مثل `data/content.json`
- رفع ملفات إلى `uploads/`
- جلسات admin داخل الخادم
- خدمة الصفحات من Express

هذه الخصائص لا تناسب Deployment بسيط على Cloudflare Pages أو Workers دون إعادة هيكلة.

الهيكلية الصحيحة هي عموماً:

1. Frontend ثابت (الصفحة العامة + اللوحة الإدارية) على Cloudflare Pages
2. API على Cloudflare Workers
3. بيانات المحتوى على D1 / R2
4. ملفات الوسائط على R2

---

## الهيكلية الموصى بها

```text
.
├── apps/
│   ├── public/
│   │   ├── assets/
│   │   ├── gallery/
│   │   ├── admin/
│   │   ├── Landing.dc.html
│   │   ├── support.js
│   │   └── vendor/
│   └── admin-ui/
│       ├── src/
│       └── build/
├── workers/
│   ├── api/
│   │   ├── src/
│   │   ├── package.json
│   │   └── wrangler.toml
│   └── site/
│       ├── src/
│       └── wrangler.toml
├── db/
│   ├── schema.sql
│   └── seed.sql
├── storage/
│   └── r2-policy.md
├── scripts/
│   ├── sync-content.js
│   └── upload-assets.js
├── package.json
├── wrangler.toml
├── .env.example
└── README.md
```

---

## ماذا نغيّر من المشروع الحالي

### 1) الواجهة العامة

الصفحة العامة الحالية في:

- `Landing.dc.html`
- `assets/landing.css`
- `gallery/`
- `vendor/`
- `uploads/samples/`

يمكن نقلها إلى `apps/public/` أو مباشرة إلى مجلد `public/` ليتولى Cloudflare Pages خدمتها.

### 2) لوحة الإدارة

اللوحة الحالية في:

- `admin/index.html`
- `admin/admin.js`
- `admin/admin.css`

يمكن تركها كواجهة ثابتة، لكن يجب أن تتصل بـ Worker API بدل Express API.

### 3) API الحالي

المسارات الحالية في `server/index.js` مثل:

- `/api/content`
- `/api/admin/*`
- `/api/admin/media`
- `/api/visits/track`
- `/robots.txt`
- `/sitemap.xml`

هذه جميعها تحتاج إلى ترجمتها إلى Worker Routes أو API Functions.

### 4) البيانات

الملفات الحالية:

- `data/content.json`
- `data/admin.json`
- `data/visits.jsonl`

يجب استبدالها بـ:

- D1 database للمحتوى والإحصائيات
- R2 bucket للملفات المرفوعة
- KV أو D1 لتخزين مفتاح الأدمن (مع التشفير المناسب)

---

## الترتيب المنطقي لـ Cloudflare

### A) Cloudflare Pages

تخدم:

- الصفحة الرئيسية
- صفحات المعرض
- اللوحة الإدارية (الواجهة فقط)
- الملفات الثابتة: CSS/JS/صور/خطوط

### B) Cloudflare Workers

تخدم:

- `/api/content`
- `/api/admin/login`
- `/api/admin/setup`
- `/api/admin/content`
- `/api/admin/media`
- `/api/visits/track`
- `/robots.txt`
- `/sitemap.xml`

### C) D1

تخزن:

- المحتوى العام
- إعدادات الموقع
- سجل الزيارات

### D) R2

تخزن:

- الصور
- الفيديوهات
- ملفات المعرض
- الصور المرفوعة من اللوحة

---

## ما الذي يُستبدل من Express

### يجب إزالتها من الخادم الحالي

- `server/index.js`
- `server/content.js`
- `server/auth.js`
- `server/media.js`
- `server/analytics.js`
- `server/seo.js`

### يجب نقل منطقها إلى Worker / D1 / R2

- `content.js` → D1 queries
- `auth.js` → Worker session handling + KV أو D1
- `media.js` → R2 upload/delete/list
- `analytics.js` → D1 inserts/queries
- `seo.js` → Worker route generation

---

## مثال بسيط للهيكلية الفعلية

```text
public/
  index.html
  assets/
  gallery/
  admin/
  vendor/

workers/api/
  src/
    index.ts
    routes/
      content.ts
      admin.ts
      media.ts
      seo.ts

workers/site/
  src/
    index.ts

schema.sql
wrangler.toml
```

---

## الترتيب العملي للتنفيذ

### المرحلة 1 — استخراج Frontend

- نقل ملفات `Landing.dc.html` و`assets/` و`gallery/` إلى `public/`
- إبقاء `admin/` كواجهة ثابتة مستقلة
- ضبط الروابط بحيث تعمل عبر Worker API

### المرحلة 2 — إنشاء Worker API

- إنشاء route لـ `/api/content`
- إنشاء route لـ `/api/admin/login`
- إنشاء route لـ `/api/admin/content`
- إنشاء route لـ `/api/admin/media`

### المرحلة 3 — ربط D1

- إنشاء جدول `site_content`
- إنشاء جدول `visits`
- إنشاء جدول `media_meta`

### المرحلة 4 — ربط R2

- إنشاء bucket upload
- إضافة upload/delete/list

### المرحلة 5 — إعداد SEO

- تحويل `/robots.txt`
- تحويل `/sitemap.xml`
- تحويل `/llms.txt`

### المرحلة 6 — إعداد Cloudflare deployment

- `wrangler.toml`
- إعداد bindings لـ D1 وR2 وKV
- ربط Pages مع Worker

---

## ملاحظات مهمة

### 1) لا ترسل `.env` إلى Git

هذا المشروع الحالي يضم `.env` محلياً، وهذا صحيح، لكن على Cloudflare لا تستخدم `.env` كآلية تشغيل. استخدم:

- Cloudflare Secrets
- `wrangler secret put`

### 2) لا تعتمد على filesystem داخل Worker

Cloudflare Workers لا تدعم filesystem المحلي. لذلك:

- لا تستخدم `fs.readFileSync()` داخل Worker
- لا تعتمد على `uploads/` محلياً
- استخدم D1/R2 بدلاً من ذلك

### 3) يجب فصل frontend عن backend

المشروع الحالي مختلط في بنية واحدة. هذا جيد محلياً، لكنه لا يعمل بشكل نظيف على Cloudflare.

---

## الخلاصة العملية

الهيكلية السليمة لـ Cloudflare هي:

- Pages أو static assets للأمامي
- Worker API للـ API
- D1 لأنظمة البيانات
- R2 للملفات المرفوعة

إذا أردت، يمكنني الآن المساعدة في الخطوة التالية:

1. إنشاء `wrangler.toml` جاهز
2. كتابة `workers/api/src/index.ts` أساسي
3. تصميم جداول D1
4. تحويل `admin/admin.js` بحيث يتصل بـ API Worker بدل Express
