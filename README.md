# قلاع المملكة 🏰

لعبة لوحية استراتيجية تعليمية تُعرض على السبورات الذكية في الفصول الدراسية — فرق تبني قلاعها وتجّند الجنود وتتقاذف بالمنجنيق، وتتزامن نقودها الذهبية لحظيًا مع كشف درجات المجموعات في قاعدة بيانات Supabase.

## التقنيات

- React 19 + TypeScript + Vite
- Three.js عبر @react-three/fiber + drei (مشهد ثلاثي الأبعاد)
- zustand لإدارة الحالة · framer-motion + GSAP للحركات
- Tailwind CSS · واجهة عربية RTL بالكامل
- Supabase (PostgREST) لربط ذهب اللعبة بدرجات المجموعات الأسبوعية + الحفظ السحابي لكل صف/أسبوع
- vitest للاختبارات (149+ اختبارًا)

## التشغيل محليًا

```bash
npm install
bash scripts/restore-assets.sh   # استعادة الصور الثنائية إلى public/ (مرة واحدة)
npm run dev
```

## البناء للإنتاج

```bash
npm run build
```

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
