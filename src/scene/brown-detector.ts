/**
 * كاشف «الشاشة البنية» — منطق نقي بلا WebGL (قابل لاختبار vitest).
 *
 * الخلفية: بلاغ متكرر أن بدء موسم مرتبط يُظهر أحيانًا خلفية التربة/الخشب
 * الداكنة للصفحة (wood-900 ‏#2E1B0E) بلا مشهد إطلاقًا — الكانفس شفاف لأن
 * R3F يرسم بألفا (لا scene.background؛ السماء قبة داخل المشهد)، فأي فشل
 * صامت في الرسم (كاميرا NaN في مكان لم يغطه الحارس، فقد سياق WebGL…) يُظهر
 * لون body البني. حد الأخطاء لا يلتقطه لأنه لا استثناء.
 *
 * الحكم: نأخذ عيّنات بكسلات على شبكة (5×5) من إطار WebGL فور رسمه، فإن كانت
 * شبه موحّدة (تباين شبه معدوم) **و** (قريبة من لون خلفية الصفحة البني أو
 * شفافة تمامًا — ألفا ≈ 0 تعني أن ما يراه المستخدم هو خلفية الصفحة البنية)
 * اعتبرناها «شاشة بنية».
 *
 * قرار مقصود: الأسود المعتم الموحّد (إطار تحميل/لحظة فارغة بألفا كاملة) لا
 * يُحسب بنيًّا — بعيد عن لون الخلفية وليس شفافًا.
 */

/** عيّنة بكسل واحدة بقيم 0..255 */
export interface PixelSample {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** لون خلفية الصفحة (wood-900 في index.css) — ما يراه المستخدم حين يفرغ الكانفس */
export const PAGE_BACKGROUND = { r: 0x2e, g: 0x1b, b: 0x0e } as const;

export interface BrownDetectOptions {
  /** أقصى انحراف قناة (r/g/b) لعيّنة عن متوسط العيّنات لتبقى «موحّدة» */
  uniformTolerance: number;
  /** أقصى فرق قناة بين متوسط العيّنات ولون خلفية الصفحة ليُحسب «قريبًا منها» */
  backgroundTolerance: number;
  /** متوسط ألفا الذي عنده أو دونه يُحسب الإطار شفافًا (يرى المستخدم خلفية الصفحة) */
  alphaFloor: number;
  /** أقل عدد عيّنات مقبول للحكم (شبكة ناقصة = لا حكم) */
  minSamples: number;
}

export const DEFAULT_BROWN_OPTIONS: BrownDetectOptions = {
  uniformTolerance: 10,
  backgroundTolerance: 26,
  alphaFloor: 12,
  minSamples: 9,
};

export interface BrownAnalysis {
  sampleCount: number;
  /** التباين شبه معدوم (كل القنوات ضمن uniformTolerance من المتوسط) */
  uniform: boolean;
  /** الإطار شفاف (متوسط ألفا ≈ 0) — ما يراه المستخدم هو خلفية الصفحة */
  transparent: boolean;
  /** متوسط اللون قريب من بني خلفية الصفحة */
  nearBackground: boolean;
  /** الحكم النهائي: شاشة بنية */
  brown: boolean;
  mean: PixelSample;
  /** أقصى انحراف قناة لون (r/g/b) لأي عيّنة عن المتوسط */
  maxDeviation: number;
}

function finiteChannel(v: number): boolean {
  return Number.isFinite(v);
}

/**
 * تحليل عيّنات البكسلات — الدالة النقية الأساسية.
 * مدخلات غير صالحة (قائمة قصيرة، قناة غير منتهية) ترجع حكمًا آمنًا: ليست بنية.
 */
export function analyzeSamples(
  samples: readonly PixelSample[],
  options: Partial<BrownDetectOptions> = {},
): BrownAnalysis {
  const opts: BrownDetectOptions = { ...DEFAULT_BROWN_OPTIONS, ...options };
  const safe: BrownAnalysis = {
    sampleCount: samples.length,
    uniform: false,
    transparent: false,
    nearBackground: false,
    brown: false,
    mean: { r: 0, g: 0, b: 0, a: 0 },
    maxDeviation: 0,
  };
  if (samples.length < opts.minSamples) return safe;
  for (const s of samples) {
    if (!finiteChannel(s.r) || !finiteChannel(s.g) || !finiteChannel(s.b) || !finiteChannel(s.a)) {
      return safe; // عيّنة فاسدة — لا حكم متسرّع
    }
  }

  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sa = 0;
  for (const s of samples) {
    sr += s.r;
    sg += s.g;
    sb += s.b;
    sa += s.a;
  }
  const n = samples.length;
  const mean: PixelSample = { r: sr / n, g: sg / n, b: sb / n, a: sa / n };

  let maxDeviation = 0;
  for (const s of samples) {
    const d = Math.max(Math.abs(s.r - mean.r), Math.abs(s.g - mean.g), Math.abs(s.b - mean.b));
    if (d > maxDeviation) maxDeviation = d;
  }

  const uniform = maxDeviation <= opts.uniformTolerance;
  const transparent = mean.a <= opts.alphaFloor;
  const nearBackground =
    Math.abs(mean.r - PAGE_BACKGROUND.r) <= opts.backgroundTolerance &&
    Math.abs(mean.g - PAGE_BACKGROUND.g) <= opts.backgroundTolerance &&
    Math.abs(mean.b - PAGE_BACKGROUND.b) <= opts.backgroundTolerance;

  return {
    sampleCount: n,
    uniform,
    transparent,
    nearBackground,
    brown: uniform && (nearBackground || transparent),
    mean,
    maxDeviation,
  };
}

/** اختصار: هل هذه العيّنات تشخّص «شاشة بنية»؟ */
export function isBrownScreen(
  samples: readonly PixelSample[],
  options: Partial<BrownDetectOptions> = {},
): boolean {
  return analyzeSamples(samples, options).brown;
}

// ─── إيقاع الكشف (يستخدمه BrownScreenWatchdog) ───

/** عيّنة كل هذا القدر أثناء اللعب (خفيف — لا قياس كل إطار) */
export const BROWN_SAMPLE_INTERVAL_MS = 2000;
/** مهلة سماح بعد تركيب المشهد/بدء الموسم قبل أول حكم (المشهد يحتاج وقت تركيب) */
export const BROWN_GRACE_MS = 3000;
/** كم حكمًا إيجابيًا متتاليًا يلزم قبل إعلان الشاشة البنية (تحصّن من لقطة عابرة) */
export const BROWN_REQUIRED_STREAK = 2;
/** أبعاد شبكة العيّنات (5×5 = 25 نقطة) */
export const BROWN_GRID_SIZE = 5;

/**
 * نقاط شبكة العيّنات بإحداثيات نسبية (0..1) من عرض/ارتفاع مخزن الرسم.
 * نتجنب الحواف القصوى (10%..90%) حتى لا تقع العيّنات على إطار النافذة.
 * y بنفس اتفاقية readPixels (الأسفل = 0) — لا يهم الاتجاه لأن الحكم إحصائي.
 */
export function sampleGridPoints(size = BROWN_GRID_SIZE): { fx: number; fy: number }[] {
  const n = Math.max(2, Math.floor(size));
  const pts: { fx: number; fy: number }[] = [];
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      pts.push({ fx: 0.1 + (0.8 * gx) / (n - 1), fy: 0.1 + (0.8 * gy) / (n - 1) });
    }
  }
  return pts;
}
