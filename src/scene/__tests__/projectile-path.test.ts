/**
 * اختبارات مسار القذيفة المرئي (wave4):
 * - towerSurfaceHit: نقطة الارتطام تُسقَط على وجه البرج (لا داخله) حتى لا
 *   تخترق القذيفة المرئية الطوابق العليا.
 * - truncatePathAt: المسار المرئي ينتهي عند نقطة الاصطدام.
 * - bounceArcPoints: قوس الارتداد يبدأ من ارتفاع الاصطدام ويهبط للأرض.
 * - coveringFocus: تأطير الكاميرا يغطي موقع الإصابة وسقوط الارتداد معًا.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, Vec3 } from '@/contracts/types';
import { createInitialState, getTeam } from '@/engine/logic/state';
import { castlePosition } from '@/engine/logic/geometry';
import { BASE_FACE_RADIUS, TOWER_FACE_RADIUS, towerSurfaceHit } from '../aim';
import { bounceArcPoints, coveringFocus, truncatePathAt } from '../projectile-path';

function makeAimState(): GameState {
  const s = createInitialState();
  s.turnIndex = 0;
  const defender = getTeam(s, 'team-2');
  defender.castle.floors.push({ id: 'f-low', hp: 10, maxHp: 10 });
  defender.castle.floors.push({ id: 'f-high', hp: 10, maxHp: 10 });
  s.protectionRoundsLeft = {};
  return s;
}

const enemy = castlePosition(1, 4); // (42, 0, 0)

describe('towerSurfaceHit — نقطة الارتطام على وجه البرج', () => {
  it('قوس يخترق الطابق الثاني: النقطة على وجه البرج بنفس ارتفاع الدخول', () => {
    const s = makeAimState();
    const points: Vec3[] = [
      { x: 20, y: 14, z: 0 },
      { x: 38, y: 11, z: 0 },
      { x: 42, y: 8.6, z: 0 }, // داخل الاسطوانة عند الطابق الثاني
      { x: 46, y: 5, z: 0 },
      { x: 62, y: 0, z: 0 },
    ];
    const hit = towerSurfaceHit(s, points);
    expect(hit).not.toBeNull();
    expect(hit!.teamId).toBe('team-2');
    expect(hit!.floorIndex).toBe(1);
    expect(hit!.target).toEqual({ kind: 'floor', teamId: 'team-2', floorId: 'f-high' });
    // مُسقطة على وجه البرج لا في مركزه: البعد الأفقي = TOWER_FACE_RADIUS
    expect(Math.hypot(hit!.point.x - enemy.x, hit!.point.z - enemy.z)).toBeCloseTo(TOWER_FACE_RADIUS, 5);
    expect(hit!.point.y).toBeCloseTo(8.6, 5);
    expect(hit!.pathIndex).toBe(2);
  });

  it('اختراق تحت ارتفاع القاعدة: نقطة على وجه القاعدة الأوسع', () => {
    const s = makeAimState();
    const points: Vec3[] = [
      { x: 35, y: 5, z: 0 },
      { x: 41, y: 2.2, z: 0 },
      { x: 46, y: 0, z: 0 },
    ];
    const hit = towerSurfaceHit(s, points);
    expect(hit).not.toBeNull();
    expect(hit!.floorIndex).toBeNull();
    expect(hit!.target).toEqual({ kind: 'base', teamId: 'team-2' });
    expect(Math.hypot(hit!.point.x - enemy.x, hit!.point.z - enemy.z)).toBeCloseTo(BASE_FACE_RADIUS, 5);
  });

  it('تحليق فوق القبة ليس ارتطامًا', () => {
    const s = makeAimState();
    const points: Vec3[] = [
      { x: 30, y: 20, z: 0 },
      { x: 42, y: 18, z: 0 },
      { x: 54, y: 8, z: 0 },
      { x: 62, y: 0, z: 0 },
    ];
    expect(towerSurfaceHit(s, points)).toBeNull();
  });
});

describe('truncatePathAt — اقتطاع المسار المرئي عند الاصطدام', () => {
  it('ينتهي المسار بنقطة الوجه ولا يتجاوزها', () => {
    const points: Vec3[] = [
      { x: 0, y: 5, z: 0 },
      { x: 10, y: 8, z: 0 },
      { x: 20, y: 8.6, z: 0 },
      { x: 30, y: 6, z: 0 },
      { x: 40, y: 0, z: 0 },
    ];
    const face: Vec3 = { x: 22, y: 8.4, z: 0 };
    const out = truncatePathAt(points, 2, face);
    expect(out).toHaveLength(4);
    expect(out[out.length - 1]).toEqual(face);
    expect(out[2]).toEqual({ x: 20, y: 8.6, z: 0 });
  });
});

describe('bounceArcPoints — قوس الارتداد من ارتفاع الاصطدام', () => {
  const start: Vec3 = { x: 38, y: 8.6, z: 0 };
  const landing: Vec3 = { x: 48, y: 0, z: 3 };

  it('يبدأ عند نقطة الاصطدام المرتفعة وينتهي عند السقوط الأرضي', () => {
    const pts = bounceArcPoints(start, landing);
    expect(pts[0].x).toBeCloseTo(start.x, 5);
    expect(pts[0].y).toBeCloseTo(start.y, 5);
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(landing.x, 5);
    expect(last.z).toBeCloseTo(landing.z, 5);
    expect(last.y).toBe(0);
  });

  it('لا يهبط تحت الأرض ويبلغ ذروة فوق خط البداية-النهاية', () => {
    const pts = bounceArcPoints(start, landing);
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(0);
    const peak = Math.max(...pts.map((p) => p.y));
    expect(peak).toBeGreaterThan(start.y * 0.5); // قفزة مرئية فوق الهبوط الخطي
  });

  it('بداية أرضية (لا ربط) تعطي القوس القديم الشكل', () => {
    const pts = bounceArcPoints({ x: 42, y: 0.6, z: 0 }, { x: 50, y: 0, z: 0 });
    expect(pts[0].y).toBeCloseTo(0.6, 5);
    expect(pts[pts.length - 1].y).toBe(0);
  });
});

describe('coveringFocus — تأطير يغطي الإصابة والارتداد', () => {
  it('المركز منتصف القطعة ونصف القطر يغطي الطرفين بهامش', () => {
    const a: Vec3 = { x: 38, y: 8.6, z: 0 };
    const b: Vec3 = { x: 48, y: 0, z: 0 };
    const f = coveringFocus(a, b, 4);
    expect(f.center.x).toBeCloseTo(43, 5);
    expect(f.center.y).toBeCloseTo(8.6, 5); // أعلى النقطتين
    expect(f.radius).toBeCloseTo(5 + 4, 5);
    // الطرفان داخل نصف القطر من المركز أفقيًا
    expect(Math.hypot(a.x - f.center.x, a.z - f.center.z)).toBeLessThanOrEqual(f.radius);
    expect(Math.hypot(b.x - f.center.x, b.z - f.center.z)).toBeLessThanOrEqual(f.radius);
  });
});
