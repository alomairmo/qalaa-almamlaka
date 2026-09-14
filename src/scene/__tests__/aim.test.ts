/**
 * اختبارات حلّ هدف المنجنيق من مسار القذيفة — إصلاح خلل
 * «الإطلاق على طابق ثانٍ لا يسبب ضررًا»: القذيفة التي تعبر الطابق الثاني
 * بصريًا كانت تهبط على الأرض خلف القلعة (خارج نافذة الالتقاط القديمة d<9)
 * فيُحلّ الهدف إلى أرض فارغة ولا يحدث ضرر. الآن يُشتق الطابق من ارتفاع
 * نقطة اختراق المسار لبرج القلعة.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, Vec3 } from '@/contracts/types';
import { createInitialState, getTeam } from '@/engine/logic/state';
import { castlePosition } from '@/engine/logic/geometry';
import { resolveAimTarget } from '../aim';

/** حالة 4 فرق؛ team-1 صاحبة الدور، وteam-2 عليها طابقان */
function makeAimState(): GameState {
  const s = createInitialState();
  s.turnIndex = 0;
  const defender = getTeam(s, 'team-2');
  defender.castle.floors.push({ id: 'f-low', hp: 10, maxHp: 10 });
  defender.castle.floors.push({ id: 'f-high', hp: 10, maxHp: 10 });
  s.protectionRoundsLeft = {}; // بلا حماية حتى تكون team-2 هدفًا صالحًا
  return s;
}

/** قوس مبسط يمر بالنقاط المعطاة (كما تنتجه computeTrajectory) */
function arcThrough(...pts: Vec3[]): { landing: Vec3; points: Vec3[] } {
  return { points: pts, landing: pts[pts.length - 1] };
}

const enemyCastle = castlePosition(1, 4); // (42, 0, 0)

describe('حل هدف المنجنيق من المسار', () => {
  it('قوس يخترق البرج عند ارتفاع الطابق الثاني يصيب الطابق الثاني بالذات (وليس أرضًا فارغة)', () => {
    const s = makeAimState();
    // القوس يمر عبر (42, 8.6, 0) — داخل الطابق الثاني (7..10) — ثم يهبط بعيدًا خلف القلعة
    const { landing, points } = arcThrough(
      { x: 20, y: 14, z: 0 },
      { x: 38, y: 11, z: 0 },
      { x: 42, y: 8.6, z: 0 },
      { x: 46, y: 5, z: 0 },
      { x: 62, y: 0, z: 0 }, // سقوط على بعد 20 وحدة خلف مركز القلعة
    );
    const target = resolveAimTarget(s, landing, points);
    expect(target).toEqual({ kind: 'floor', teamId: 'team-2', floorId: 'f-high' });
  });

  it('قوس يخترق البرج عند ارتفاع الطابق الأول يصيب الطابق الأول', () => {
    const s = makeAimState();
    const { landing, points } = arcThrough(
      { x: 30, y: 9, z: 0 },
      { x: 41.5, y: 5.6, z: 0 }, // داخل الطابق الأول (4..7)
      { x: 55, y: 0, z: 0 },
    );
    const target = resolveAimTarget(s, landing, points);
    expect(target).toEqual({ kind: 'floor', teamId: 'team-2', floorId: 'f-low' });
  });

  it('قوس يخترق البرج تحت ارتفاع القاعدة يصيب القاعدة', () => {
    const s = makeAimState();
    const { landing, points } = arcThrough(
      { x: 35, y: 5, z: 0 },
      { x: 41, y: 2.2, z: 0 },
      { x: 46, y: 0, z: 0 },
    );
    const target = resolveAimTarget(s, landing, points);
    expect(target).toEqual({ kind: 'base', teamId: 'team-2' });
  });

  it('قوس يعلو القبة ويهبط خلف القلعة بعيدًا = أرض فارغة (لا إصابة وهمية)', () => {
    const s = makeAimState();
    const { landing, points } = arcThrough(
      { x: 30, y: 20, z: 0 },
      { x: 42, y: 18, z: 0 }, // فوق السطح (السطح عند 10 + غطاء القبة)
      { x: 54, y: 8, z: 0 },
      { x: 62, y: 0, z: 0 },
    );
    const target = resolveAimTarget(s, landing, points);
    expect(target.kind).toBe('ground');
  });

  it('سقوط أرضي قريب من القلعة دون اختراق البرج يصيب القاعدة (احتياط)', () => {
    const s = makeAimState();
    const { landing, points } = arcThrough(
      { x: 30, y: 6, z: 0 },
      { x: enemyCastle.x + 6, y: 0, z: 0 }, // على بعد 6 — داخل التراس، خارج اسطوانة البرج
    );
    const target = resolveAimTarget(s, landing, points);
    expect(target).toEqual({ kind: 'base', teamId: 'team-2' });
  });

  it('قلعة محمية لا تُلتقط كهدف حتى لو اخترقها المسار', () => {
    const s = makeAimState();
    s.protectionRoundsLeft = { 'team-2': 1 };
    const { landing, points } = arcThrough(
      { x: 38, y: 11, z: 0 },
      { x: 42, y: 8.6, z: 0 },
      { x: 62, y: 0, z: 0 },
    );
    const target = resolveAimTarget(s, landing, points);
    expect(target.kind).toBe('ground');
  });

  it('قلعة صاحبة الدور لا تُلتقط كهدف أبدًا', () => {
    const s = makeAimState();
    const own = castlePosition(0, 4); // (0, 0, -42)
    const { landing, points } = arcThrough(
      { x: own.x, y: 6, z: own.z },
      { x: own.x, y: 0, z: own.z },
    );
    const target = resolveAimTarget(s, landing, points);
    expect(target.kind).toBe('ground');
  });
});
