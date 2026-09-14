/**
 * اختبارات كاميرا المنجنيق المتكيفة مع طول البرج (wave4):
 * كلما كثرت الطوابق رجعت العين وارتفعت وانحدرت نقطة النظر نحو الميدان،
 * مع سقوف تمنع التحول إلى منظور عمودي، وقاطع أمان يمنع اختراق القبة.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/contracts/types';
import { catapultCameraProfile, catapultLookPoint, clampAboveDome } from '../camera/catapult-camera';

describe('catapultCameraProfile — ملف الارتكاز حسب عدد الطوابق', () => {
  it('القلعة بلا طوابق/طابق واحد تحافظ على المنظور السابق', () => {
    const p0 = catapultCameraProfile(0);
    const p1 = catapultCameraProfile(1);
    expect(p0.back).toBeCloseTo(1.7, 5);
    expect(p0.lift).toBeCloseTo(0.5, 5);
    expect(p0.lookAhead).toBeCloseTo(15, 5);
    expect(p0.lookDrop).toBe(0);
    expect(p1).toEqual(p0);
  });

  it('كلما طال البرج زاد الرجوع والرفع والانحدار (رتابة)', () => {
    let prev = catapultCameraProfile(0);
    for (let n = 1; n <= 8; n++) {
      const cur = catapultCameraProfile(n);
      expect(cur.back).toBeGreaterThanOrEqual(prev.back);
      expect(cur.lift).toBeGreaterThanOrEqual(prev.lift);
      expect(cur.lookDrop).toBeGreaterThanOrEqual(prev.lookDrop);
      expect(cur.lookAhead).toBeGreaterThanOrEqual(prev.lookAhead);
      prev = cur;
    }
    // برج من 5 طوابق: فرق ملموس عن القاعدة
    const p5 = catapultCameraProfile(5);
    expect(p5.back).toBeGreaterThan(4);
    expect(p5.lift).toBeGreaterThan(2);
    expect(p5.lookDrop).toBeGreaterThan(4);
  });

  it('سقوف تمنع المنظور العمودي مهما طال البرج', () => {
    const huge = catapultCameraProfile(40);
    expect(huge.back).toBeLessThanOrEqual(1.7 + 9);
    expect(huge.lift).toBeLessThanOrEqual(0.5 + 7);
    expect(huge.lookDrop).toBeLessThanOrEqual(11);
    expect(huge.lookAhead).toBeLessThanOrEqual(45);
  });
});

describe('clampAboveDome — قاطع أمان ضد اختراق القبة/الطوابق', () => {
  const center: Vec3 = { x: 42, y: 0, z: 0 };
  const topY = 19; // 5 طوابق

  it('عين داخل غلاف البرج وتحت قمة القبة تُرفع فوقها', () => {
    const out = clampAboveDome({ x: 43, y: topY + 1, z: 0.5 }, center, topY);
    expect(out.y).toBeCloseTo(topY + 4.3, 5);
  });

  it('عين خارج الغلاف أو فوق القبة لا تُمس', () => {
    const outside = clampAboveDome({ x: 30, y: 10, z: 0 }, center, topY);
    expect(outside).toEqual({ x: 30, y: 10, z: 0 });
    const above = clampAboveDome({ x: 42.5, y: topY + 6, z: 0 }, center, topY);
    expect(above.y).toBeCloseTo(topY + 6, 5);
  });
});

describe('catapultLookPoint — نقطة النظر المنحدرية', () => {
  it('تنحدر تحت العين بمقدار الملف وتتقدم أفقيًا باتجاه التصويب', () => {
    const eye: Vec3 = { x: 0, y: 24, z: 0 };
    const dir: Vec3 = { x: 1, y: 0, z: 0 };
    const prof = catapultCameraProfile(5); // lookDrop 6, lookAhead 31
    const look = catapultLookPoint(eye, dir, prof);
    expect(look.x).toBeCloseTo(31, 5);
    expect(look.y).toBeCloseTo(24 - 2 - 6, 5);
    expect(look.z).toBeCloseTo(0, 5);
  });

  it('أرضية دنيا: لا تنظر تحت مستوى الأرض القريب مهما طال البرج', () => {
    const look = catapultLookPoint({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 1 }, catapultCameraProfile(30));
    expect(look.y).toBeGreaterThanOrEqual(3.2);
  });
});
