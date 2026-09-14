/**
 * اختبارات التقدّم المرئي الرتيب للقافلة — إصلاح «الجنود يرجعون لبداية
 * القسم عند نهاية الجولة». السيناريو المحوري: المؤقت يتصفّر (بداية
 * جولة جديدة) قبل أن يصل بثّ convoy-moved ويحدّث progress، فلا يجوز
 * أن يتراجع التقدّم المرئي.
 */
import { describe, expect, it } from 'vitest';
import { convoyVisualPoint, convoyVisualProgress } from '../convoy-progress';

const STEP = 1 / 3; // أربع مجموعات

describe('convoyVisualProgress — رتابة عبر حدود الجولة', () => {
  it('يتقدم مع كسر الجولة داخل القسم', () => {
    expect(convoyVisualProgress(0, 0, STEP, 0)).toBe(0);
    expect(convoyVisualProgress(0, 0, STEP, 0.5)).toBeCloseTo(STEP / 2, 9);
    expect(convoyVisualProgress(0, 0, STEP, 1)).toBeCloseTo(STEP, 9);
  });

  it('تصفير المؤقت قبل تحديث الحالة لا يرجع الجنود لبداية القسم', () => {
    // نهاية الجولة: وصلنا مرئيًا لنهاية الثلث الأول
    const atSectionEnd = convoyVisualProgress(0, 0, STEP, 1);
    expect(atSectionEnd).toBeCloseTo(STEP, 9);
    // بدأت جولة جديدة (frac = 0) لكن convoy-moved لم يصل بعد (progress ما زال 0)
    const duringRace = convoyVisualProgress(atSectionEnd, 0, STEP, 0);
    expect(duringRace).toBeCloseTo(STEP, 9); // ثابت عند نهاية القسم، لا رجوع
  });

  it('عند وصول convoy-moved يلتحم المنطقي بالمرئي عند حدود القسم بالضبط', () => {
    const atSectionEnd = convoyVisualProgress(0, 0, STEP, 1);
    const afterUpdate = convoyVisualProgress(atSectionEnd, STEP, STEP, 0);
    expect(afterUpdate).toBeCloseTo(STEP, 9);
  });

  it('الجولة التالية تواصل من نهاية القسم نحو نهاية الثلث التالي', () => {
    let v = convoyVisualProgress(0, 0, STEP, 1); // نهاية القسم 1
    v = convoyVisualProgress(v, 0, STEP, 0); // سباق التحديث — ثبات
    v = convoyVisualProgress(v, STEP, STEP, 0); // وصل البثّ
    v = convoyVisualProgress(v, STEP, STEP, 0.5); // منتصف الجولة التالية
    expect(v).toBeCloseTo(STEP + STEP / 2, 9);
    v = convoyVisualProgress(v, STEP, STEP, 1); // نهاية الجولة التالية
    expect(v).toBeCloseTo(2 * STEP, 9);
  });

  it('لا يتراجع أبدًا مهما كان ترتيب التحديثات (توقف مؤقت mid-round)', () => {
    let v = convoyVisualProgress(0, 0, STEP, 0.6);
    // إيقاف المؤقت (إعدادات): frac يسقط إلى 0 وprogress لم يتغير
    const frozen = convoyVisualProgress(v, 0, STEP, 0);
    expect(frozen).toBeCloseTo(v, 9);
    // استئناف من النقطة نفسها
    const resumed = convoyVisualProgress(frozen, 0, STEP, 0.6);
    expect(resumed).toBeCloseTo(v, 9);
  });

  it('لا يتجاوز 1 ولا يقل عن التقدّم المنطقي', () => {
    expect(convoyVisualProgress(0.9, 0.9, STEP, 1)).toBe(1);
    expect(convoyVisualProgress(0.1, 0.5, STEP, 0)).toBe(0.5);
  });
});

describe('convoyVisualPoint — موضع العرض على الطريق', () => {
  const home = { x: 30, y: 0, z: 0 };
  const pos = { x: 0, y: 0, z: 0 }; // progress = 0

  it('التقدّم المرئي = المنطقي يعني الوقوف عند موضع الحالة', () => {
    const p = convoyVisualPoint(pos, home, 0, 0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(0, 9);
  });

  it('فائض مرئي بمقدار step يتقدم نحو القلعة بلا رجوع', () => {
    const p = convoyVisualPoint(pos, home, 0, STEP);
    expect(p.x).toBeCloseTo(30 * STEP, 9);
    // بعد تحديث الحالة (progress = STEP والموضع تقدّم) يبقى الموضع نفسه
    const pos2 = { x: 30 * STEP, y: 0, z: 0 };
    const p2 = convoyVisualPoint(pos2, home, STEP, STEP);
    expect(p2.x).toBeCloseTo(30 * STEP, 9);
  });

  it('progress = 1 (وصول) لا ينتج قسمة على صفر', () => {
    const p = convoyVisualPoint(home, home, 1, 1);
    expect(p.x).toBeCloseTo(home.x, 9);
  });
});
