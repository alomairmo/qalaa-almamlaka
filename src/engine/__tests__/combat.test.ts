/**
 * اختبارات الغزو والمعارك — §6: فوز/خسارة/تعادل/ضرر متدفق/غنيمة/قلعة فارغة.
 */
import { describe, expect, it } from 'vitest';
import { dispatchArmy } from '../logic/combat';
import { makeState, addSoldier, give, scriptedRng } from './helpers';
import type { BattleResolvedEvent } from '@/contracts/types';

const battle = (events: { type: string }[]) =>
  events.find((e) => e.type === 'battle-resolved') as BattleResolvedEvent | undefined;

describe('الغزو — §6', () => {
  it('فوز المهاجم: يموت كل المدافعين ويغنم الناجون بمقدار قوتهم', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-2', 10, 0);
    addSoldier(s, 'team-1', 'expert', 'inside'); // مهاجم
    addSoldier(s, 'team-2', 'novice', 'inside'); // مدافع

    // القوة المسحوبة: مهاجم 7، مدافع 3
    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 0, soldier: 0, expert: 1 },
      scriptedRng([7, 3]),
    );

    const b = battle(events);
    expect(b).toBeDefined();
    expect(b!.attackerWon).toBe(true);
    expect(b!.attackPower).toBe(7);
    expect(b!.defensePower).toBe(3);
    expect(b!.defenderLosses).toHaveLength(1); // كل المدافعين ماتوا
    // الضرر المتدفق (3) أقل من قوة أضعف ناجٍ (7) ← لا خسائر للفائز
    expect(b!.attackerLosses).toHaveLength(0);
    // الغنيمة: 7 (قوة الناجي) من خزنة العدو
    expect(state.teams[1].goldInside).toBe(3);
    const convoy = state.convoys[0];
    expect(convoy).toBeDefined();
    expect(convoy.teamId).toBe('team-1');
    expect(convoy.goldCarried).toBe(7);
    expect(convoy.soldiers[0].pendingPromotion).toBe(true); // ناجٍ منتصر
    expect(events.some((e) => e.type === 'convoy-departed')).toBe(true);
  });

  it('خسارة المهاجم: يموت كل المهاجمين ويترقى المدافعون الناجون', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'novice', 'inside');
    const defender = addSoldier(s, 'team-2', 'soldier', 'inside');

    // مهاجم 2، مدافع 5
    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 1, soldier: 0, expert: 0 },
      scriptedRng([2, 5]),
    );

    const b = battle(events);
    expect(b!.attackerWon).toBe(false);
    expect(b!.attackerLosses).toHaveLength(1);
    expect(state.teams[0].soldiers).toHaveLength(0); // مات المهاجم
    // الضرر المتدفق (2) < قوة المدافع (5) ← لا خسائر للمدافع
    expect(b!.defenderLosses).toHaveLength(0);
    // المدافع الناجي المنتصر ترقى فورًا: جندي ← خبير
    const promoted = state.teams[1].soldiers.find((x) => x.id === defender.id);
    expect(promoted?.rank).toBe('expert');
    expect(events.some((e) => e.type === 'soldier-promoted')).toBe(true);
    expect(state.convoys).toHaveLength(0); // لا قافلة بلا ناجين مهاجمين
  });

  it('التعادل = فشل الغزو', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'soldier', 'inside');
    addSoldier(s, 'team-2', 'soldier', 'inside');

    const { events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 0, soldier: 1, expert: 0 },
      scriptedRng([4, 4]), // تعادل
    );
    expect(battle(events)!.attackerWon).toBe(false);
  });

  it('الضرر المتدفق: يقتل الأضعف فالأضعف وينتقل الفائض', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-2', 100, 0);
    addSoldier(s, 'team-1', 'novice', 'inside');
    addSoldier(s, 'team-1', 'novice', 'inside');
    addSoldier(s, 'team-1', 'novice', 'inside');
    addSoldier(s, 'team-2', 'novice', 'inside');

    // مهاجمون 2+2+2=6 > مدافع 3. خسائر الفائز: ضرر 3 يقتل أضعف (2) ويتبقى 1 < 2
    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 3, soldier: 0, expert: 0 },
      scriptedRng([2, 2, 2, 3]),
    );

    const b = battle(events);
    expect(b!.attackerWon).toBe(true);
    expect(b!.attackerLosses).toHaveLength(1); // مات أضعف مهاجم فقط
    // الناجيان يحملان 2+2=4 من خزنة العدو
    expect(state.convoys[0].goldCarried).toBe(4);
    expect(state.teams[1].goldInside).toBe(96);
  });

  it('قلعة بلا جنود داخلها = سرقة بلا قتال', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-2', 10, 0);
    addSoldier(s, 'team-1', 'expert', 'inside');
    addSoldier(s, 'team-2', 'expert', 'outside'); // خارجي لا يدافع عن الداخل

    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 0, soldier: 0, expert: 1 },
      scriptedRng([7]),
    );

    expect(battle(events)).toBeUndefined(); // لا معركة إطلاقًا
    expect(state.convoys[0].goldCarried).toBe(7); // حمل بمقدار قوته
    expect(state.teams[1].goldInside).toBe(3);
    // الجندي الخارجي للمدافع لم يُمس
    expect(state.teams[1].soldiers).toHaveLength(1);
    // لا ترقية بلا معركة
    expect(state.convoys[0].soldiers[0].pendingPromotion).toBeFalsy();
  });

  it('لا يمكن إرسال جنود لا يملكهم الفريق (تشكيلة غير ممكنة)', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'novice', 'inside');
    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 0, soldier: 0, expert: 2 }, // لا يملك خبراء
      scriptedRng(),
    );
    expect(events).toHaveLength(0);
    expect(state).toBe(s); // لا تغيير
  });

  it('ترتيب أحداث المعركة: battle-resolved أولًا ثم سقوط الجنود ثم القافلة', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-2', 10, 0);
    addSoldier(s, 'team-1', 'expert', 'inside');
    addSoldier(s, 'team-2', 'novice', 'inside');

    const { events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 0, soldier: 0, expert: 1 },
      scriptedRng([7, 3]),
    );

    const types = events.map((e) => e.type);
    const iBattle = types.indexOf('battle-resolved');
    const iDeath = types.indexOf('soldier-died');
    const iConvoy = types.indexOf('convoy-departed');
    expect(iBattle).toBeGreaterThanOrEqual(0);
    expect(iDeath).toBeGreaterThan(iBattle); // إشعارات الموت بعد بطاقة المعركة
    expect(iConvoy).toBeGreaterThan(iDeath); // ثم انطلاق قافلة الغنيمة

    // الحمولة ذاتية الاكتفاء لبطاقة النتائج
    const b = battle(events)!;
    expect(b.battleKind).toBe('castle');
    expect(b.lootGold).toBe(7);
    expect(b.convoyId).toBeDefined();
    expect(b.defenderLossDetails).toEqual([{ soldierId: b.defenderLosses[0], rank: 'novice' }]);
    expect(b.attackerLossDetails).toEqual([]);
  });

  it('فشل الغزو: battle-resolved يسبق الموت والترقية، والغنيمة صفر', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'novice', 'inside');
    addSoldier(s, 'team-2', 'soldier', 'inside');

    const { events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 1, soldier: 0, expert: 0 },
      scriptedRng([2, 5]),
    );

    const types = events.map((e) => e.type);
    expect(types.indexOf('battle-resolved')).toBeLessThan(types.indexOf('soldier-died'));
    expect(types.indexOf('soldier-died')).toBeLessThan(types.indexOf('soldier-promoted'));
    const b = battle(events)!;
    expect(b.lootGold).toBe(0);
    expect(b.convoyId).toBeUndefined();
    expect(b.attackerLossDetails).toEqual([{ soldierId: b.attackerLosses[0], rank: 'novice' }]);
  });

  it('اعتراض قافلة: battleKind=convoy والغنيمة المحمولة موثقة في الحدث', () => {
    const s = makeState();
    s.turnIndex = 0;
    // قافلة team-2 بجندي مبتدئ وذهب 8
    const team2 = s.teams[1];
    const hp = s.settings.combat.rankHp.novice;
    const convoySoldier = { id: 'cnv-sol-x', rank: 'novice' as const, hp, maxHp: hp, state: 'convoy' as const, convoyId: 'cnv-x' };
    team2.soldiers.push(convoySoldier);
    s.convoys.push({
      id: 'cnv-x',
      teamId: 'team-2',
      fromTeamId: 'team-1',
      soldiers: [convoySoldier],
      goldCarried: 8,
      progress: 0.5,
      position: { x: 0, y: 0, z: 0 },
    });
    addSoldier(s, 'team-1', 'expert', 'inside');

    const { events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'convoy', convoyId: 'cnv-x' },
      { novice: 0, soldier: 0, expert: 1 },
      scriptedRng([7, 3]),
    );

    const types = events.map((e) => e.type);
    expect(types.indexOf('battle-resolved')).toBeLessThan(types.indexOf('soldier-died'));
    const b = battle(events)!;
    expect(b.battleKind).toBe('convoy');
    expect(b.lootGold).toBe(7); // الناجي يحمل بمقدار قوته
    expect(b.convoyId).toBeDefined();
    expect(b.defenderLossDetails[0].rank).toBe('novice');
  });
});
