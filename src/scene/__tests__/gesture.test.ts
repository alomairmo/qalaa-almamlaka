/**
 * اختبارات رياضيات إيماء المنجنيق — اتجاه الحركة ودوران 360°:
 * - يمين الفارة (movementX > 0) يزيد الزاوية (التفاف يمين من منظور اللاعب).
 * - أعلى الفارة (movementY < 0) يزيد القوة، وأسفلها ينقصها.
 * - لا تثبيت زاوي: الزاوية تقبل أي قيمة (دورة كاملة وأكثر).
 */
import { describe, expect, it } from 'vitest';
import {
  applyGestureAim,
  GESTURE_POWER_SPEED,
  GESTURE_YAW_SPEED,
  nearestEquivalentAngle,
  normalizeAngle,
} from '../camera/gesture';

describe('applyGestureAim — اتجاه الإيماء', () => {
  it('تحريك الفارة يمينًا يزيد الزاوية (يلف يمينًا)', () => {
    const r = applyGestureAim(0.5, 0.4, 10, 0);
    expect(r.yaw).toBeCloseTo(0.5 + 10 * GESTURE_YAW_SPEED, 9);
    expect(r.yaw).toBeGreaterThan(0.5);
  });

  it('تحريك الفارة يسارًا ينقص الزاوية (يلف يسارًا)', () => {
    const r = applyGestureAim(0.5, 0.4, -10, 0);
    expect(r.yaw).toBeLessThan(0.5);
  });

  it('تحريك الفارة للأعلى يزيد القوة وللأسفل ينقصها', () => {
    const up = applyGestureAim(0, 0.5, 0, -20);
    expect(up.power).toBeCloseTo(0.5 + 20 * GESTURE_POWER_SPEED, 9);
    expect(up.power).toBeGreaterThan(0.5);
    const down = applyGestureAim(0, 0.5, 0, 20);
    expect(down.power).toBeLessThan(0.5);
  });

  it('القوة مثبتة ضمن 0..1 والزاوية بلا تثبيت (360°)', () => {
    expect(applyGestureAim(0, 0.98, 0, -1000).power).toBe(1);
    expect(applyGestureAim(0, 0.02, 0, 1000).power).toBe(0);
    // دورة كاملة وأكثر مسموحة: لا clamp على ±60° ولا ±150°
    const spun = applyGestureAim(Math.PI * 2 - 0.01, 0.5, 100, 0);
    expect(spun.yaw).toBeGreaterThan(Math.PI * 2);
  });
});

describe('normalizeAngle / nearestEquivalentAngle', () => {
  it('normalizeAngle يعيد الزاوية إلى (−π, π]', () => {
    expect(normalizeAngle(0.3)).toBeCloseTo(0.3, 9);
    expect(normalizeAngle(Math.PI * 2 + 0.3)).toBeCloseTo(0.3, 9);
    expect(normalizeAngle(-Math.PI * 2 - 0.3)).toBeCloseTo(-0.3, 9);
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 9);
  });

  it('nearestEquivalentAngle يمنع اللفة الطويلة عند عبور ±π', () => {
    const ref = Math.PI * 2 - 0.05; // زاوية داخلية نامية (إيماء/تنعيم)
    const target = 0.1; // ما يعادل 2π+0.1
    const nearest = nearestEquivalentAngle(target, ref);
    expect(Math.abs(nearest - ref)).toBeLessThanOrEqual(Math.PI);
    expect(nearest).toBeCloseTo(Math.PI * 2 + 0.1, 9);
  });
});
