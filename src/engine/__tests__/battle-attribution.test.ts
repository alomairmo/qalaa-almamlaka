/**
 * اختبارات نسب الفوز/الخسارة وقاعدة الإفناء — الإصلاح المُبلغ:
 * «هجمت فظهرت علامة الفوز والفائز الحقيقي هو المجموعة الأخرى».
 *
 * القاعدة: المهاجم إن مات كل جنوده خسر، وإن مات كل جنود الخصم فاز.
 * وكل مؤشرات العرض (بطاقة/توهج/احتفال) يجب أن تُشتق من حدث battle-resolved
 * نفسه لا من state.turnIndex الحالية — فالبطاقة مؤجلة حتى نهاية عنقود
 * المعركة وقد ينتهي عداد الجولة أثناءه فيتقدّم الدور قبل ظهورها.
 */
import { describe, expect, it } from 'vitest';
import {
  dispatchArmy,
  battleWinnerTeamId,
  didTeamWinBattle,
  battleDeathSide,
} from '../logic/combat';
import { getTeam, makeId } from '../logic/state';
import { makeState, addSoldier, give, scriptedRng } from './helpers';
import type { BattleResolvedEvent, Convoy, GameState, Soldier } from '@/contracts/types';

const battle = (events: { type: string }[]) =>
  events.find((e) => e.type === 'battle-resolved') as BattleResolvedEvent | undefined;

/** قافلة اختبار في الطريق لمجموعة (جنودها في convoy.soldiers وفي team.soldiers) */
function addConvoy(
  state: GameState,
  teamId: string,
  fromTeamId: string,
  gold: number,
  ranks: ('novice' | 'soldier' | 'expert')[],
): Convoy {
  const team = getTeam(state, teamId);
  const convoyId = makeId('cnv', scriptedRng());
  const soldiers: Soldier[] = ranks.map((rank, i) => {
    const hp = state.settings.combat.rankHp[rank];
    return { id: `cnv-sol-${convoyId}-${i}`, rank, hp, maxHp: hp, state: 'convoy', convoyId, pendingPromotion: false };
  });
  team.soldiers.push(...soldiers);
  const convoy: Convoy = {
    id: convoyId,
    teamId,
    fromTeamId,
    soldiers,
    goldCarried: gold,
    progress: 0.5,
    position: { x: 5, y: 0, z: 5 },
  };
  state.convoys.push(convoy);
  return convoy;
}

describe('قاعدة الإفناء — نتيجة المعركة من من بدأ الهجوم', () => {
  it('غزو فائز: كل المدافعين قتلى وdefenderLosses تغطيهم جميعًا', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-2', 20, 0);
    addSoldier(s, 'team-1', 'expert', 'inside');
    addSoldier(s, 'team-1', 'expert', 'inside');
    addSoldier(s, 'team-2', 'novice', 'inside');
    addSoldier(s, 'team-2', 'novice', 'inside');
    addSoldier(s, 'team-2', 'novice', 'inside');

    // مهاجمان 7+7=14 ضد ثلاثة مدافعين 1+1+1=3
    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 0, soldier: 0, expert: 2 },
      scriptedRng([7, 7, 1, 1, 1]),
    );

    const b = battle(events)!;
    expect(b.attackerWon).toBe(true);
    // إفناء كامل للمدافعين: لا جندي «داخل» قلعة team-2 بعد المعركة
    expect(getTeam(state, 'team-2').soldiers.filter((x) => x.state === 'inside')).toHaveLength(0);
    expect(b.defenderLosses).toHaveLength(3);
    expect(b.defenderLossDetails).toHaveLength(3);
    expect(battleWinnerTeamId(b)).toBe('team-1');
    expect(didTeamWinBattle(b, 'team-1')).toBe(true);
    expect(didTeamWinBattle(b, 'team-2')).toBe(false);
  });

  it('غزو خاسر: كل المهاجمين قتلى وattackerLosses تغطيهم جميعًا', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'novice', 'inside');
    addSoldier(s, 'team-1', 'novice', 'inside');
    addSoldier(s, 'team-2', 'expert', 'inside');

    // مهاجمان 1+1=2 ضد مدافع 7
    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 2, soldier: 0, expert: 0 },
      scriptedRng([1, 1, 7]),
    );

    const b = battle(events)!;
    expect(b.attackerWon).toBe(false);
    expect(b.attackerLosses).toHaveLength(2); // مات كل المهاجمين
    expect(b.attackerLossDetails).toHaveLength(2);
    expect(getTeam(state, 'team-1').soldiers).toHaveLength(0);
    // المدافع الفائز لا يُفنى أبدًا
    expect(b.defenderLosses).toHaveLength(0);
    expect(getTeam(state, 'team-2').soldiers).toHaveLength(1);
    expect(battleWinnerTeamId(b)).toBe('team-2');
    expect(didTeamWinBattle(b, 'team-1')).toBe(false);
    expect(didTeamWinBattle(b, 'team-2')).toBe(true);
  });

  it('اعتراض قافلة فائز: يموت كل جنود القافلة (المدافعين)', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'expert', 'inside');
    const convoy = addConvoy(s, 'team-2', 'team-1', 10, ['novice']);

    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'convoy', convoyId: convoy.id },
      { novice: 0, soldier: 0, expert: 1 },
      scriptedRng([7, 1]),
    );

    const b = battle(events)!;
    expect(b.battleKind).toBe('convoy');
    expect(b.attackerWon).toBe(true);
    expect(b.defenderTeamId).toBe('team-2'); // صاحب القافلة هو المدافع
    expect(b.defenderLosses).toHaveLength(1); // كل جنود القافلة ماتوا
    expect(state.convoys.find((c) => c.id === convoy.id)).toBeUndefined();
    expect(didTeamWinBattle(b, 'team-1')).toBe(true);
    expect(didTeamWinBattle(b, 'team-2')).toBe(false);
  });

  it('اعتراض قافلة خاسر: يموت كل المهاجمين والقافلة تكمل طريقها', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'novice', 'inside');
    const convoy = addConvoy(s, 'team-2', 'team-1', 10, ['expert']);

    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'convoy', convoyId: convoy.id },
      { novice: 1, soldier: 0, expert: 0 },
      scriptedRng([1, 7]),
    );

    const b = battle(events)!;
    expect(b.attackerWon).toBe(false);
    expect(b.attackerLosses).toHaveLength(1); // مات كل المهاجمين
    expect(getTeam(state, 'team-1').soldiers).toHaveLength(0);
    expect(state.convoys.find((c) => c.id === convoy.id)).toBeDefined(); // القافلة نجت
    expect(didTeamWinBattle(b, 'team-1')).toBe(false);
    expect(didTeamWinBattle(b, 'team-2')).toBe(true);
  });
});

describe('نسب الفوز مشتق من الحدث لا من الدور الحالي (الحالة المتأخرة)', () => {
  it('تقدّم turnIndex قبل عرض البطاقة المؤجلة لا يقلب النتيجة', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'novice', 'inside');
    addSoldier(s, 'team-2', 'expert', 'inside');

    // المهاجم (team-1) يخسر: 1 ضد 7
    const { events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 1, soldier: 0, expert: 0 },
      scriptedRng([1, 7]),
    );
    const b = battle(events)!;

    // محاكاة الخلل المُبلغ: عداد الجولة انتهى أثناء عنقود المعركة فتقدّم
    // الدور إلى team-2 (المدافع) قبل ظهور بطاقة النتائج المؤجلة.
    const activeAfterTimeout = 'team-2';
    // الحساب الصحيح (من منظور المهاجم = صاحب الهجوم): المهاجم خسر ⇒ 'lose'
    const wonByAttackerPerspective = didTeamWinBattle(b, b.attackerTeamId);
    expect(wonByAttackerPerspective).toBe(false);
    // الحساب القديم المنقلب (من منظور الدور المتأخر) كان سيعطي فوزًا زائفًا
    const staleTurnWinner = didTeamWinBattle(b, activeAfterTimeout);
    expect(staleTurnWinner).toBe(true); // هذا ما كان يُظهر التوهج الأخضر خطأً
    // الفائز الحقيقي من الحدث نفسه
    expect(battleWinnerTeamId(b)).toBe('team-2');
  });
});

describe('جهة القتيل في المعركة (تلوين الإشعارات)', () => {
  it('جندي المهاجم ⇒ attacker، جندي المدافع/القافلة ⇒ defender، وغيرهما null', () => {
    const b = {
      attackerTeamId: 'team-1',
      defenderTeamId: 'team-2',
    };
    expect(battleDeathSide(b, 'team-1')).toBe('attacker');
    expect(battleDeathSide(b, 'team-2')).toBe('defender');
    expect(battleDeathSide(b, 'team-3')).toBe(null);
  });
});
