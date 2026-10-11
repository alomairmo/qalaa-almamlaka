# قلاع المملكة 🏰

لعبة لوحية استراتيجية تعليمية تُعرض على السبورات الذكية في الفصول الدراسية — فرق تبني قلاعها وتجّند الجنود وتتقاذف بالمنجنيق، وتتزامن نقودها الذهبية لحظيًا مع كشف درجات المجموعات في قاعدة بيانات Supabase.

## اللعب مباشرة (GitHub Pages)

**https://alomairmo.github.io/qalaa-almamlaka/** — نسخة جاهزة بلا تثبيت:
ملفات التطبيق المبنية في `passets/` + `index.html` الجذري، والمكتبات الكبيرة
(React/Three.js…) من CDN عبر importmap، والصور من Supabase Storage.

## التقنيات

- React 19 + TypeScript + Vite
- Three.js عبر @react-three/fiber + drei (مشهد ثلاثي الأبعاد)
- zustand لإدارة الحالة · framer-motion + GSAP للحركات
- Tailwind CSS · واجهة عربية RTL بالكامل
- Supabase (PostgREST) لربط ذهب اللعبة بدرجات المجموعات الأسبوعية + الحفظ السحابي لكل صف/أسبوع
- vitest للاختبارات (149+ اختبارًا)

## التشغيل محليًا

```bash
npm install                      # يولّد package-lock.json أيضًا (غير مضمّن في المستودع)
bash scripts/restore-assets.sh   # استعادة الصور الثنائية إلى public/ (مرة واحدة)
npm run dev
```

## البناء للإنتاج

```bash
npm run build          # نسخة الاستضافة الرئيسية (dist/)
npm run build:pages    # تحديث نسخة GitHub Pages: يبني passets/ ويولّد index.html الجذري
```

بعد `build:pages` ادفع `passets/` و`index.html` الجذري إلى المستودع فيُحدَّث
موقع Pages تلقائيًا (دقيقة أو دقيقتان).

## الاختبارات

```bash
npx vitest run
```

## ملاحظة عن الصور

ملفات الصور الكبيرة (public/*.png) غير مضمّنة في المستودع مباشرة. استعدها بأمر واحد:

```bash
bash scripts/restore-assets.sh
```

أو نزّل الحزمة يدويًا من:
https://lazyikoawttfcflpdixs.supabase.co/storage/v1/object/public/asset-transfer/public-pngs.tar.gz
ثم فكّ ضغطها في جذر المشروع.

## ربط Supabase

راجع [SUPABASE_SETUP.md](SUPABASE_SETUP.md) لإعداد جداول الدرجات (marks) والحفظ (qalaa_saves) وسياسات الوصول.
