/**
 * اختبارات كاشف الشاشة البنية (الدالة النقية analyzeSamples / isBrownScreen):
 * - عيّنات موحّدة بلون خلفية الصفحة (wood-900) → شاشة بنية.
 * - عيّنات شفافة تمامًا (ألفا≈0: كانفس فارغ فوق خلفية بنية) → شاشة بنية.
 * - عيّنات متنوعة (مشهد حي: سماء + تضاريس + قلاع) → سليمة.
 * - أسود/داكن معتم موحّد (إطار تحميل) → ليست بنية (قرار مقصود).
 * - مدخلات فاسدة/ناقصة → حكم آمن (ليس بنيًّا).
 */
import { describe, expect, it } from 'vitest';
import {
  analyzeSamples,
  isBrownScreen,
  PAGE_BACKGROUND,
  sampleGridPoints,
  type PixelSample,
} from '../brown-detector';
import { reportBrownScreen, requestSceneRemount, useSceneBridge } from '../bridge';

const px = (r: number, g: number, b: number, a = 255): PixelSample => ({ r, g, b, a });

/** 25 عيّنة موحّدة اللون */
const uniform = (p: PixelSample, count = 25): PixelSample[] => Array.from({ length: count }, () => ({ ...p }));

describe('analyzeSamples — الشاشة البنية تُرصد', () => {
  it('عيّنات موحّدة بلون خلفية الصفحة تمامًا → بنية', () => {
    const res = analyzeSamples(uniform(px(PAGE_BACKGROUND.r, PAGE_BACKGROUND.g, PAGE_BACKGROUND.b)));
    expect(res.uniform).toBe(true);
    expect(res.nearBackground).toBe(true);
    expect(res.brown).toBe(true);
  });

  it('عيّنات موحّدة قريبة من البني (ضمن السماحية) → بنية', () => {
    const res = analyzeSamples(uniform(px(PAGE_BACKGROUND.r + 20, PAGE_BACKGROUND.g + 15, PAGE_BACKGROUND.b + 10)));
    expect(res.brown).toBe(true);
  });

  it('عيّنات شفافة تمامًا (كانفس لا يرسم شيئًا فوق صفحة بنية) → بنية', () => {
    const res = analyzeSamples(uniform(px(0, 0, 0, 0)));
    expect(res.uniform).toBe(true);
    expect(res.transparent).toBe(true);
    expect(res.brown).toBe(true);
  });
});

describe('analyzeSamples — المشهد السليم لا يُرصد خطأً', () => {
  it('عيّنات متنوعة (سماء + رمل + تربة + قلاع) → ليست بنية', () => {
    const samples: PixelSample[] = [
      ...uniform(px(0xae, 0xe3, 0xf5), 7), // سماء
      ...uniform(px(0xf6, 0xee, 0xd9), 5), // أفق
      ...uniform(px(0xe9, 0xd8, 0xa6), 6), // رمل
      ...uniform(px(0x6b, 0x45, 0x27), 4), // خشب قلعة
      ...uniform(px(0x2e, 0x1b, 0x0e), 3), // بقعة بنية داكنة
    ];
    const res = analyzeSamples(samples);
    expect(res.uniform).toBe(false);
    expect(res.brown).toBe(false);
  });

  it('عيّنات موحّدة لكنها بلون بعيد عن البني (سماء صافية) → ليست بنية', () => {
    expect(isBrownScreen(uniform(px(0xae, 0xe3, 0xf5)))).toBe(false);
  });

  it('أسود معتم موحّد (إطار تحميل/لحظة فارغة) → ليست بنية', () => {
    const res = analyzeSamples(uniform(px(0, 0, 0, 255)));
    expect(res.uniform).toBe(true);
    expect(res.nearBackground).toBe(false);
    expect(res.transparent).toBe(false);
    expect(res.brown).toBe(false);
  });

  it('داكن معتم موحّد غير مطابق للبني (ليل مثلًا) → ليست بنية', () => {
    expect(isBrownScreen(uniform(px(10, 10, 30, 255)))).toBe(false);
  });

  it('عيّنة واحدة شاذة وسط بني موحّد تكسر «التوحّد» → ليست بنية', () => {
    const samples = uniform(px(PAGE_BACKGROUND.r, PAGE_BACKGROUND.g, PAGE_BACKGROUND.b));
    samples[12] = px(0xae, 0xe3, 0xf5); // قلعة/سماء ظاهرة — المشهد حي فعلًا
    expect(analyzeSamples(samples).brown).toBe(false);
  });
});

describe('analyzeSamples — مدخلات فاسدة/ناقصة تحكم بأمان', () => {
  it('عيّنات أقل من الحد الأدنى → ليست بنية', () => {
    expect(isBrownScreen(uniform(px(PAGE_BACKGROUND.r, PAGE_BACKGROUND.g, PAGE_BACKGROUND.b), 4))).toBe(false);
    expect(isBrownScreen([])).toBe(false);
  });

  it('قناة غير منتهية (NaN) → ليست بنية', () => {
    const samples = uniform(px(PAGE_BACKGROUND.r, PAGE_BACKGROUND.g, PAGE_BACKGROUND.b));
    samples[3] = px(NaN, 0, 0);
    expect(analyzeSamples(samples).brown).toBe(false);
  });
});

describe('جسر المشهد — راية الشاشة البنية وعدّاد الاستعادة', () => {
  it('reportBrownScreen يرفع الراية وrequestSceneRemount يزيد العدّاد ويمسحها', () => {
    const before = useSceneBridge.getState();
    expect(before.brownScreen).toBe(false);
    reportBrownScreen();
    expect(useSceneBridge.getState().brownScreen).toBe(true);
    requestSceneRemount();
    const after = useSceneBridge.getState();
    expect(after.sceneNonce).toBe(before.sceneNonce + 1);
    expect(after.brownScreen).toBe(false);
  });
});

describe('sampleGridPoints — شبكة العيّنات', () => {
  it('5×5 = 25 نقطة كلها داخل 10%..90% من الأبعاد', () => {
    const pts = sampleGridPoints(5);
    expect(pts).toHaveLength(25);
    for (const p of pts) {
      expect(p.fx).toBeGreaterThanOrEqual(0.1);
      expect(p.fx).toBeLessThanOrEqual(0.9);
      expect(p.fy).toBeGreaterThanOrEqual(0.1);
      expect(p.fy).toBeLessThanOrEqual(0.9);
    }
  });

  it('حجم أدنى مضمون (2 على الأقل) ونقاط متميزة', () => {
    const pts = sampleGridPoints(1);
    expect(pts).toHaveLength(4);
    expect(new Set(pts.map((p) => `${p.fx}:${p.fy}`)).size).toBe(4);
  });
});
