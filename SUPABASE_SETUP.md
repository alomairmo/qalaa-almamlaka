# ربط Supabase — قلاع المملكة

> **الوضع الحالي:** اللعبة **مربوطة فعليًا** بقاعدة Supabase القائمة لمشروع تعليمي، وتعمل
> محليًا 100% متى لم تُختر جلسة مرتبطة. لا تبعيات جديدة — عميل REST خالص بـ `fetch`
> (`src/engine/storage/supabase-client.ts`) فوق PostgREST.

## 1. بيانات الاتصال (مضمّنة افتراضيًا)

- **URL:** `https://lazyikoawttfcflpdixs.supabase.co`
- **anon key:** `sb_publishable_RNdKa5FTqDB4KAPSpYP4lg_jIcwVjVI` (مفتاح نشر عام — آمن للتضمين)

القيمتان مضمّنتان كافتراضي في `supabase-client.ts` لأن البناء static؛ ويمكن تجاوزهما
عند البناء عبر `.env` (انسخ `.env.example`):

```bash
VITE_SUPABASE_URL=https://lazyikoawttfcflpdixs.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_RNdKa5FTqDB4KAPSpYP4lg_jIcwVjVI
```

## 2. الجداول المستخدمة

### `marks` (جدول المشروع التعليمي — RLS مفتوح للـ anon)
المفتاح: `(class_key, week, student_idx, criterion_idx)`.

- **تعريفات المجموعات:** صف `class_key='grpdef:<CLASS>'` (week=0, student_idx=0, criterion_idx=0)،
  و`value` نص JSON: `[{"id":1787814266137,"name":"1","leader":2,"members":[...]}, ...]`.
- **درجة مجموعة في أسبوع (= ذهبها في اللعبة):** صف `class_key='grp:<CLASS>:<groupId>'`,
  `student_idx=0`, `criterion_idx=0`, `week=<N>`, و`value` رقم كنص (`"65"`).

### `qalaa_saves` (حفظ اللعبة السحابي — أنشئ لهذا الغرض)
`(class_key text, week int, state jsonb, events jsonb, updated_at timestamptz)` —
المفتاح `(class_key, week)`: تخزين مستقل لكل (صف، أسبوع) لا يعمّم، بسياسة anon كاملة.
`state` = لقطة GameState كاملة (مع خريطة `linkGroupIds` المضمّنة لاستعادة ربط الفرق)،
و`events` = سجل الأحداث المتراكم.

## 3. طريقة العمل داخل اللعبة

1. **شاشة العنوان ← «🕌 موسم مرتبط بالنظام التعليمي»:** اختيار الصف (من صفوف `grpdef:*`)
   ثم الأسبوع (من صفوف `grp:<CLASS>:*`؛ تُعرض 1..8 ويُفعَّل الموجود منها فقط).
2. **بدء جديد:** عدد الفرق = عدد المجموعات (2–6)، الاسم «المجموعة <name>»، ذهب البداية =
   درجة الأسبوع، وكل فريق يُربط بـ groupId لمزامنة لحظية.
3. **مزامنة الذهب:** بعد كل تغيير حالة يُحسب إجمالي ذهب كل فريق
   (داخل القلعة + خارجها + ذهب قوافله العائدة) ويُرفع upsert إلى صف المجموعة
   في `marks` (debounce ‏800ms لكل فريق).
4. **حفظ التقدم/الأحداث:** upsert في `qalaa_saves` بعد كل commit (debounce ‏1.5s).
   الاستئناف يحمّل من هناك؛ localStorage يبقى احتياطيًا دائمًا.
5. **مؤشر المزامنة:** ⚪ محلي · 🟠 أثناء الرفع · 🟢 متزامن · 🔴 فشل (مع إعادة محاولة تلقائية).

## 4. شكل الطلبات (PostgREST)

```
GET  /rest/v1/marks?select=class_key&class_key=like.grpdef:*
GET  /rest/v1/marks?select=week&class_key=like.grp:<CLASS>:*
GET  /rest/v1/marks?select=value&class_key=eq.grpdef:<CLASS>
GET  /rest/v1/marks?select=class_key,value&class_key=like.grp:<CLASS>:*&week=eq.<N>&student_idx=eq.0&criterion_idx=eq.0
POST /rest/v1/marks          Prefer: resolution=merge-duplicates   (upsert درجة)
GET  /rest/v1/qalaa_saves?select=state,events,updated_at&class_key=eq.<CLASS>&week=eq.<N>
POST /rest/v1/qalaa_saves    Prefer: resolution=merge-duplicates   (upsert حفظ)
DELETE /rest/v1/qalaa_saves?class_key=eq.<CLASS>&week=eq.<N>       (مسح أسبوع واحد فقط)
```

الترويسات في كل الطلبات: `apikey: <anon-key>` و`Authorization: Bearer <anon-key>`.

## 5. الخطة المستقبلية (اختيارية)

- جداول `game_states`/`game_events`/`question_banks`/`model_assets` وبucket `game-models`
  في `supabase/schema.sql` تبقى متاحة لمزامنة عامة غير مرتبطة بصف، وقناة Realtime
  للمزامنة متعددة الأجهزة لحظيًا.
