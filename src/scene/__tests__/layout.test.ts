/**
 * اختبارات تخطيط المشهد الجديدة — إصلاحات:
 * 1) منصة المنجنيق دائمًا جهة مركز الخريطة (أمام القبة) لكل القلاع الأربع.
 * 2) كومة الذهب الخارجية خارج قاعدة القلعة المدوّرة بهامش واضح (غير مدفونة).
 */
import { describe, expect, it } from 'vitest';
import { createInitialState } from '@/engine/logic/state';
import { castlePosition } from '@/engine/logic/geometry';
import {
  CATAPULT_PLATFORM_DIST,
  catapultPlatformLocal,
  catapultPlatformWorld,
  castleFacingYaw,
  goldPileDisplayPosition,
  outsideSoldierPosition,
  stonesPosition,
} from '../layout';

const R4 = [0, 1, 2, 3]; // أربع قلاع على الحلقة

describe('منصة المنجنيق', () => {
  it('المنصة دائمًا بين القلعة ومركز الخريطة (أمام القبة من منظور FPS)', () => {
    for (const i of R4) {
      const c = castlePosition(i, 4);
      const p = catapultPlatformWorld(c, 10);
      // اتجاه (قلعة→منصة) يطابق اتجاه (قلعة→مركز): جداء داخلي موجب تام
      const dot = (p.x - c.x) * -c.x + (p.z - c.z) * -c.z;
      expect(dot).toBeGreaterThan(0);
      // على البعد المطلوب بالضبط من مركز القلعة
      expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeCloseTo(CATAPULT_PLATFORM_DIST, 6);
      expect(p.y).toBeCloseTo(10.3, 6);
    }
  });

  it('الإزاحة المحلية تطابق العالمية بعد دوران القلعة (castleFacingYaw)', () => {
    for (const i of R4) {
      const c = castlePosition(i, 4);
      const yaw = castleFacingYaw(c);
      const local = catapultPlatformLocal(c);
      // تدوير three حول Y: x' = x·cos + z·sin ، z' = -x·sin + z·cos
      const wx = local.x * Math.cos(yaw) + local.z * Math.sin(yaw);
      const wz = -local.x * Math.sin(yaw) + local.z * Math.cos(yaw);
      const world = catapultPlatformWorld(c, 0);
      expect(c.x + wx).toBeCloseTo(world.x, 6);
      expect(c.z + wz).toBeCloseTo(world.z, 6);
    }
  });
});

describe('كومة الذهب الخارجية', () => {
  it('خارج قاعدة القلعة المدوّرة (نصف القطر الأقصى ~6.4) بهامش واضح لكل القلاع', () => {
    const s = createInitialState();
    for (const team of s.teams) {
      const c = castlePosition(s.teams.indexOf(team), s.teams.length);
      const g = goldPileDisplayPosition(s, team.id);
      const d = Math.hypot(g.x - c.x, g.z - c.z);
      expect(d).toBeGreaterThan(8.5);
    }
  });

  it('كومة الحجارة أيضًا خارج قاعدة القلعة ولا تتداخل مع كومة الذهب', () => {
    const s = createInitialState();
    for (const team of s.teams) {
      const c = castlePosition(s.teams.indexOf(team), s.teams.length);
      const st = stonesPosition(s, team.id);
      const g = goldPileDisplayPosition(s, team.id);
      expect(Math.hypot(st.x - c.x, st.z - c.z)).toBeGreaterThan(8.5);
      expect(Math.hypot(st.x - g.x, st.z - g.z)).toBeGreaterThan(3);
    }
  });
});

describe('جهة النوافذ (اتجاه الكاميرا 45°)', () => {
  const WX = Math.cos(Math.PI / 4);
  const WZ = Math.sin(Math.PI / 4);
  it('الأكوام والجنود الخارجيون في اتجاه واجهة القلعة لكل القلاع', () => {
    const state = createInitialState();
    for (const team of state.teams) {
      const c = castlePosition(state.teams.indexOf(team), state.teams.length);
      const g = goldPileDisplayPosition(state, team.id);
      const st = stonesPosition(state, team.id);
      const s0 = outsideSoldierPosition(state, team.id, 0, 1);
      for (const p of [g, st, s0]) {
        // جيب تمام الزاوية بين (قلعة→نقطة) واتجاه الواجهة > 0.5 (ضمن ±60°)
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const len = Math.hypot(dx, dz) || 1;
        const cosA = (dx * WX + dz * WZ) / len;
        expect(cosA).toBeGreaterThan(0.5);
      }
    }
  });
});
