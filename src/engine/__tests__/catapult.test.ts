/**
 * اختبارات المنجنيق — §8: ضرر جماعي (splash)، ارتداد فيزيائي (bounce)،
 * قائمة الإصابات hits، وذاكرة قوة الإطلاق لكل مجموعة.
 */
import { describe, expect, it } from 'vitest';
import { fireCatapult } from '../logic/catapult';
import { outsideSoldierPosition } from '../logic/geometry';
import { makeState, addSoldier, give, scriptedRng } from './helpers';
import { getTeam } from '../logic/state';
import type {
  CatapultBounceEvent,
  GameState,
  ProjectileImpactEvent,
  Soldier,
} from '@/contracts/types';

/** إنشاء قافلة اختبار بسيطة */
function addConvoyAt(
  state: GameState,
  teamId: string,
  gold: number,
  ranks: ('novice' | 'soldier' | 'expert')[],
  position: { x: number; y: number; z: number },
) {
  const team = getTeam(state, teamId);
  const convoyId = `test-convoy-${state.convoys.length + 1}`;
  const soldiers: Soldier[] = ranks.map((rank, i) => {
    const hp = state.settings.combat.rankHp[rank];
    return { id: `${convoyId}-sol-${i}`, rank, hp, maxHp: hp, state: 'convoy', convoyId };
  });
  team.soldiers.push(...soldiers);
  const convoy = { id: convoyId, teamId, fromTeamId: teamId, soldiers, goldCarried: gold, progress: 0.5, position };
  state.convoys.push(convoy);
  return convoy;
}

const impact = (events: { type: string }[]) =>
  events.find((e) => e.type === 'projectile-impact') as ProjectileImpactEvent | undefined;
const bounce = (events: { type: string }[]) =>
  events.find((e) => e.type === 'catapult-bounce') as CatapultBounceEvent | undefined;

describe('المنجنيق — ضرر جماعي (splash)', () => {
  it('القصف على جندي خارجي يصيب كل الجنود ضمن نصف القطر وليس واحدًا فقط', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-1', 0, 3); // ذخيرة
    const a = addSoldier(s, 'team-2', 'novice', 'outside'); // slot 0 — صحة 4
    const b = addSoldier(s, 'team-2', 'novice', 'outside'); // slot 1 — على بُعد ~2.7 (< 3.5)
    const safe = addSoldier(s, 'team-2', 'expert', 'inside'); // داخل القلعة — في مأمن

    const { state, events } = fireCatapult(
      s,
      'team-1',
      { kind: 'soldier', teamId: 'team-2', soldierId: a.id },
      0.6,
      scriptedRng([5]), // ضرر سبلاش 5 > صحة 4
    );

    const imp = impact(events)!;
    expect(imp.result).toEqual({ kind: 'soldier-hit', soldierId: a.id, died: true });
    // كلاهما ضمن النطاق ← إصابتان في قائمة hits
    const soldierHits = imp.hits.filter((h) => h.kind === 'soldier');
    expect(soldierHits).toHaveLength(2);
    expect(soldierHits.map((h) => (h.kind === 'soldier' ? h.soldierId : '')).sort()).toEqual([a.id, b.id].sort());
    // ماتا كلاهما وأُزيلا من القوائم، والجندي الداخلي لم يُمس
    expect(getTeam(state, 'team-2').soldiers.map((x) => x.id)).toEqual([safe.id]);
    expect(events.filter((e) => e.type === 'soldier-died')).toHaveLength(2);
  });

  it('السبلاش لا يصيب من هو خارج نصف القطر', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-1', 0, 3);
    const near = addSoldier(s, 'team-2', 'novice', 'outside'); // slot 0 قرب قلعة team-2
    const far = addSoldier(s, 'team-3', 'expert', 'outside'); // قلعة أخرى — بعيد جدًا

    const { state } = fireCatapult(
      s,
      'team-1',
      { kind: 'soldier', teamId: 'team-2', soldierId: near.id },
      0.6,
      scriptedRng([5]),
    );

    expect(getTeam(state, 'team-2').soldiers.find((x) => x.id === near.id)).toBeUndefined(); // مات القريب
    const survivor = getTeam(state, 'team-3').soldiers.find((x) => x.id === far.id);
    expect(survivor).toBeDefined(); // البعيد نجا
    expect(survivor!.hp).toBe(survivor!.maxHp); // بلا خدش
  });

  it('قصف قافلة يصيب كل جنودها ومن مات أسقط حصته من الذهب', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-1', 0, 3);
    const convoy = addConvoyAt(s, 'team-2', 10, ['novice', 'expert'], { x: 5, y: 0, z: 5 });
    const [weak, strong] = convoy.soldiers; // صحة 4 و8

    const { state, events } = fireCatapult(
      s,
      'team-1',
      { kind: 'convoy', convoyId: convoy.id, soldierId: weak.id },
      0.6,
      scriptedRng([5]),
    );

    const imp = impact(events)!;
    const convoyHits = imp.hits.filter((h) => h.kind === 'convoy-soldier');
    expect(convoyHits).toHaveLength(2); // الاثنان ضمن النطاق
    // المبتدئ مات وأسقط حصته (10 ÷ 2 = 5)، والخبير نجا جريحًا
    const alive = getTeam(state, 'team-2').soldiers.map((x) => x.id);
    expect(alive).toEqual([strong.id]);
    expect(state.convoys[0].soldiers.map((x) => x.id)).toEqual([strong.id]);
    expect(state.convoys[0].goldCarried).toBe(5);
    const dropped = state.piles.find((p) => p.kind === 'dropped');
    expect(dropped?.amount).toBe(5);
    expect(events.some((e) => e.type === 'gold-dropped')).toBe(true);
    // الجندي القوي فقد 5 صحة
    expect(state.convoys[0].soldiers[0].hp).toBe(3);
  });
});

describe('المنجنيق — الارتداد الفيزيائي (bounce)', () => {
  /** حالة: طابق لقلعة team-2 + كومة ذهب ساقطة عند موضع سقوط الارتداد المُسكربت */
  function bounceSetup() {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-1', 0, 3);
    getTeam(s, 'team-2').castle.floors.push({ id: 'fl-1', hp: 10, maxHp: 10 });
    // scriptedRng: next()=0.5 دائمًا ← زاوية الارتداد π ومسافة 4.5 ← السقوط (37.5,0,0)
    // (قلعة team-2 عند (42,0,0)؛ الجنود الخارجيون صاروا جهة النوافذ، فالهدف
    //  الثانوي هنا كومة ذهب ساقطة — نفس آلية الإصابة المخفّضة)
    s.piles.push({ id: 'pile-b1', amount: 9, position: { x: 37.5, y: 0, z: 0 }, kind: 'dropped' });
    return { s };
  }

  it('القذيفة ترتد عن الطابق وتصيب هدفًا ثانويًا بضرر مخفّض 50%', () => {
    const { s } = bounceSetup();
    const { state, events } = fireCatapult(
      s,
      'team-1',
      { kind: 'floor', teamId: 'team-2', floorId: 'fl-1' },
      0.6,
      scriptedRng([5]), // ضرر الطابق 5
    );

    const b = bounce(events);
    expect(b).toBeDefined();
    expect(b!.hits).toHaveLength(1);
    const hit = b!.hits[0];
    expect(hit.kind).toBe('gold-pile');
    if (hit.kind === 'gold-pile') {
      expect(hit.pileId).toBe('pile-b1');
      expect(hit.amount).toBe(3); // round(5 × 0.5) = 3
    }
    expect(state.piles.find((p) => p.id === 'pile-b1')?.amount).toBe(6);
    // ترتيب الأحداث: projectile-impact قبل catapult-bounce
    const types = events.map((e) => e.type);
    expect(types.indexOf('projectile-impact')).toBeLessThan(types.indexOf('catapult-bounce'));
  });

  it('الارتداد الذي لا يصيب شيئًا لا يبث حدثًا إضافيًا', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-1', 0, 3);
    getTeam(s, 'team-2').castle.floors.push({ id: 'fl-1', hp: 10, maxHp: 10 });
    // لا جنود ولا أكوام ولا حجارة حول قلعة team-2

    const { events } = fireCatapult(
      s,
      'team-1',
      { kind: 'floor', teamId: 'team-2', floorId: 'fl-1' },
      0.6,
      scriptedRng([5]),
    );
    expect(bounce(events)).toBeUndefined();
    expect(impact(events)!.result).toEqual({ kind: 'floor-damaged', floorId: 'fl-1', destroyed: false });
  });

  it('تعطيل bounceEnabled يلغي الارتداد كليًا', () => {
    const { s } = bounceSetup();
    s.settings.catapult.bounceEnabled = false;
    const { events } = fireCatapult(
      s,
      'team-1',
      { kind: 'floor', teamId: 'team-2', floorId: 'fl-1' },
      0.6,
      scriptedRng([5]),
    );
    expect(bounce(events)).toBeUndefined();
  });

  it('ضرر الارتداد حده الأدنى 1 مهما صغُر المعامل', () => {
    const { s } = bounceSetup();
    s.settings.catapult.bounceDamageFactor = 0.05; // round(5 × 0.05) = 0 ← يُرفع إلى 1
    const { events } = fireCatapult(
      s,
      'team-1',
      { kind: 'floor', teamId: 'team-2', floorId: 'fl-1' },
      0.6,
      scriptedRng([5]),
    );
    const b = bounce(events);
    expect(b).toBeDefined();
    const hit = b!.hits[0];
    expect(hit.kind).toBe('gold-pile');
    if (hit.kind === 'gold-pile') expect(hit.amount).toBe(1);
  });

  it('إصابة القاعدة أيضًا تسبب ارتدادًا', () => {
    const { s } = bounceSetup();
    const { events } = fireCatapult(
      s,
      'team-1',
      { kind: 'base', teamId: 'team-2' },
      0.6,
      scriptedRng([5]),
    );
    const b = bounce(events);
    expect(b).toBeDefined();
    expect(b!.hits[0].kind).toBe('gold-pile');
  });
});

describe('المنجنيق — ذاكرة قوة الإطلاق لكل مجموعة', () => {
  it('كل إطلاق يحدّث catapultPowerByTeam (0–100)', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-1', 0, 3);
    const { state } = fireCatapult(
      s,
      'team-1',
      { kind: 'ground', position: { x: 0, y: 0, z: 0 } },
      0.72,
      scriptedRng(),
    );
    expect(state.catapultPowerByTeam['team-1']).toBe(72);
    // بقية المجموعات على الافتراضي
    expect(state.catapultPowerByTeam['team-2']).toBe(50);
  });

  it('القوة فوق 1 تُفسَّر كمقياس 0–100 وتُثبَّت ضمن النطاق', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-1', 0, 3);
    const { state } = fireCatapult(
      s,
      'team-1',
      { kind: 'ground', position: { x: 0, y: 0, z: 0 } },
      130,
      scriptedRng(),
    );
    expect(state.catapultPowerByTeam['team-1']).toBe(100);
  });
});

describe('هندسة المواقع المساعدة', () => {
  it('خانات الجنود الخارجيين متجاورة ضمن نطاق السبلاش الافتراضي', () => {
    const p0 = outsideSoldierPosition(1, 4, 0);
    const p1 = outsideSoldierPosition(1, 4, 1);
    const dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    expect(dist).toBeLessThan(3.5); // جنديان متجاوران يُصابان معًا
  });
});
