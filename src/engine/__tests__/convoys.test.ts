/**
 * اختبارات القوافل — §7: أثلاث الطريق، الوصول، الترقية، القصف، الاعتراض.
 */
import { describe, expect, it } from 'vitest';
import { cloneState, getTeam, makeId } from '../logic/state';
import { processConvoysAtTurnStart } from '../logic/convoys';
import { dispatchArmy } from '../logic/combat';
import { fireCatapult } from '../logic/catapult';
import { makeState, addSoldier, give, scriptedRng } from './helpers';
import type { Convoy, Soldier } from '@/contracts/types';

/** إنشاء قافلة اختبار لمجموعة (جنودها داخل convoy.soldiers وفي team.soldiers) */
function addConvoy(
  state: ReturnType<typeof makeState>,
  teamId: string,
  fromTeamId: string,
  gold: number,
  ranks: ('novice' | 'soldier' | 'expert')[],
  pendingPromotion = false,
): Convoy {
  const team = getTeam(state, teamId);
  const convoyId = makeId('cnv', scriptedRng());
  const soldiers: Soldier[] = ranks.map((rank, i) => {
    const hp = state.settings.combat.rankHp[rank];
    return {
      id: `cnv-sol-${convoyId}-${i}`,
      rank,
      hp,
      maxHp: hp,
      state: 'convoy',
      convoyId,
      pendingPromotion,
    };
  });
  team.soldiers.push(...soldiers);
  const convoy: Convoy = {
    id: convoyId,
    teamId,
    fromTeamId,
    soldiers,
    goldCarried: gold,
    progress: 0,
    position: { x: 0, y: 0, z: 0 },
  };
  state.convoys.push(convoy);
  return convoy;
}

describe('دورة القافلة — §7', () => {
  it('تتقدم ثلث الطريق في جولة كل مجموعة أخرى وتصل في جولة صاحبها', () => {
    const s = makeState(); // 4 مجموعات ← الطريق 3 أثلاث
    addConvoy(s, 'team-1', 'team-2', 10, ['novice', 'soldier'], true);

    // جولة مجموعة أخرى: تتقدم 1/3
    let cs = cloneState(s);
    processConvoysAtTurnStart(cs, 'team-2', scriptedRng());
    expect(cs.convoys[0].progress).toBeCloseTo(1 / 3);

    // جولة ثالثة ورابعة: 2/3 ثم 1
    processConvoysAtTurnStart(cs, 'team-3', scriptedRng());
    expect(cs.convoys[0].progress).toBeCloseTo(2 / 3);
    processConvoysAtTurnStart(cs, 'team-4', scriptedRng());
    expect(cs.convoys[0].progress).toBeCloseTo(1);
    expect(cs.convoys).toHaveLength(1); // لم تصل بعد — تصل في جولة صاحبها

    // جولة صاحبها: وصول + ذهب + ترقية
    const events = processConvoysAtTurnStart(cs, 'team-1', scriptedRng());
    expect(cs.convoys).toHaveLength(0);
    const arrival = events.find((e) => e.type === 'convoy-arrived');
    expect(arrival).toBeDefined();
    // الذهب أُضاف عند الوصول فقط
    expect(getTeam(cs, 'team-1').goldInside).toBe(10);
    // ترتيب الأحداث: الوصول (الذهب) قبل الترقيات — §4
    const arrivalIdx = events.findIndex((e) => e.type === 'convoy-arrived');
    const promoIdx = events.findIndex((e) => e.type === 'soldier-promoted');
    expect(promoIdx).toBeGreaterThan(arrivalIdx);
    // الناجون المنتصرون ترقوا: مبتدئ←جندي، جندي←خبير
    const team = getTeam(cs, 'team-1');
    expect(team.soldiers.map((x) => x.rank).sort()).toEqual(['expert', 'soldier']);
    // عادوا داخل القلعة (سعة 2)
    expect(team.soldiers.every((x) => x.state === 'inside')).toBe(true);
  });

  it('قصف القافلة يصيب جنديًا محددًا ومن مات أسقط ذهبه', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-1', 0, 3); // ذخيرة
    const convoy = addConvoy(s, 'team-2', 'team-1', 10, ['novice']);
    convoy.position = { x: 5, y: 0, z: 5 };
    const targetSoldier = convoy.soldiers[0]; // مبتدئ صحته 4

    // ضرر 5 > صحة 4 ← موت وسقوط الذهب
    const { state, events } = fireCatapult(
      s,
      'team-1',
      { kind: 'convoy', convoyId: convoy.id, soldierId: targetSoldier.id },
      0.6,
      scriptedRng([5]),
    );

    expect(state.convoys).toHaveLength(0); // قافلة بلا جنود تختفي
    const dropped = state.piles.find((p) => p.kind === 'dropped');
    expect(dropped?.amount).toBe(10); // كل الذهب سقط (جندي وحيد)
    expect(dropped?.position).toEqual({ x: 5, y: 0, z: 5 });
    expect(events.some((e) => e.type === 'gold-dropped')).toBe(true);
    expect(events.some((e) => e.type === 'soldier-died')).toBe(true);
  });

  it('اعتراض القافلة: الفائز يأخذ الذهب ويبدأ عودته، والفائض يسقط', () => {
    const s = makeState();
    s.turnIndex = 0;
    const convoy = addConvoy(s, 'team-2', 'team-1', 8, ['novice']);
    addSoldier(s, 'team-1', 'expert', 'inside');

    // مهاجم 7 > مدافع 3
    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'convoy', convoyId: convoy.id },
      { novice: 0, soldier: 0, expert: 1 },
      scriptedRng([7, 3]),
    );

    const b = events.find((e) => e.type === 'battle-resolved');
    expect(b).toBeDefined();
    // قافلة العدو الأصلية اختفت، وقافلة جديدة للمعترض تحمل 7 (قوة الناجي)
    const newConvoy = state.convoys.find((c) => c.teamId === 'team-1');
    expect(newConvoy).toBeDefined();
    expect(newConvoy!.goldCarried).toBe(7);
    // الفائض (8−7=1) سقط كومة على الطريق
    const dropped = state.piles.find((p) => p.kind === 'dropped');
    expect(dropped?.amount).toBe(1);
    expect(newConvoy!.soldiers[0].pendingPromotion).toBe(true);
  });

  it('صدّ الاعتراض: تكمل القافلة طريقها ويسقط ذهب قتلاها', () => {
    const s = makeState();
    s.turnIndex = 0;
    const convoy = addConvoy(s, 'team-2', 'team-1', 8, ['expert', 'novice']);
    convoy.position = { x: 9, y: 0, z: 9 };
    addSoldier(s, 'team-1', 'novice', 'inside');

    // مهاجم 2 < مدافعون 7+3=10. خسائر القافلة المتدفقة: ضرر 2 يقتل الأضعف (المبتدئ قوته 3؟ لا: 2<3 ينجو)
    // نجعل المبتدئ يسحب 2: الضرر 2 يقتله (2>=2) ويسقط ذهبه
    const { state } = dispatchArmy(
      s,
      'team-1',
      { kind: 'convoy', convoyId: convoy.id },
      { novice: 1, soldier: 0, expert: 0 },
      scriptedRng([2, 7, 2]), // مهاجم 2، خبير 7، مبتدئ 2
    );

    const surviving = state.convoys.find((c) => c.id === convoy.id);
    expect(surviving).toBeDefined();
    expect(surviving!.soldiers).toHaveLength(1); // مات المبتدئ
    expect(surviving!.soldiers[0].rank).toBe('expert');
    // حصة المبتدئ (الأخير): 8÷2 = 4 لكل واحد — سقط 4
    expect(surviving!.goldCarried).toBe(4);
    const dropped = state.piles.find((p) => p.kind === 'dropped');
    expect(dropped?.amount).toBe(4);
    // المهاجم مات
    expect(getTeam(state, 'team-1').soldiers).toHaveLength(0);
  });

  it('التقاط كومة ذهب ساقطة بلا قتال', () => {
    const s = makeState();
    s.turnIndex = 0;
    s.piles.push({ id: 'pile-x', amount: 6, position: { x: 1, y: 0, z: 1 }, kind: 'dropped' });
    addSoldier(s, 'team-1', 'soldier', 'inside');

    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'gold-pile', pileId: 'pile-x' },
      { novice: 0, soldier: 1, expert: 0 },
      scriptedRng([5]), // قوة 5 ← يحمل 5 من 6
    );

    expect(events.some((e) => e.type === 'battle-resolved')).toBe(false);
    const convoy = state.convoys.find((c) => c.teamId === 'team-1');
    expect(convoy?.goldCarried).toBe(5);
    expect(state.piles.find((p) => p.id === 'pile-x')?.amount).toBe(1); // الباقي بقي
  });
});
