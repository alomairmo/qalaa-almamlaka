/**
 * اختبارات اشتقاق خطة مشهد المعركة (planBattle) من حدث battle-resolved
 * والحالة بعده: موقع المعركة، عدد المهاجمين/الناجين، نقطة الانطلاق من
 * بوابة قلعة المهاجم، والمدد (مع وبدون prefers-reduced-motion).
 */
import { describe, expect, it } from 'vitest';
import { dispatchArmy } from '@/engine/logic/combat';
import { addSoldier, give, makeState, scriptedRng } from '@/engine/__tests__/helpers';
import { castleGatePos, pileScenePosition, teamCastlePos, CASTLE_GATE_DIST } from '../layout';
import { planBattle, planLoot } from '../battle-plan';
import type { BattleResolvedEvent, ConvoyDepartedEvent } from '@/contracts/types';

const battle = (events: { type: string }[]) =>
  events.find((e) => e.type === 'battle-resolved') as BattleResolvedEvent | undefined;

function wonRaid() {
  const s = makeState();
  s.turnIndex = 0;
  give(s, 'team-2', 10, 0);
  addSoldier(s, 'team-1', 'expert', 'inside');
  addSoldier(s, 'team-2', 'novice', 'inside');
  const { state, events } = dispatchArmy(
    s,
    'team-1',
    { kind: 'castle', teamId: 'team-2' },
    { novice: 0, soldier: 0, expert: 1 },
    scriptedRng([7, 3]),
  );
  return { state, ev: battle(events)! };
}

function lostRaid() {
  const s = makeState();
  s.turnIndex = 0;
  addSoldier(s, 'team-1', 'novice', 'inside');
  addSoldier(s, 'team-2', 'expert', 'inside');
  const { state, events } = dispatchArmy(
    s,
    'team-1',
    { kind: 'castle', teamId: 'team-2' },
    { novice: 1, soldier: 0, expert: 0 },
    scriptedRng([2, 7]),
  );
  return { state, ev: battle(events)! };
}

describe('planBattle — غزو منتصر', () => {
  it('الموقع = بوابة قلعة المدافع (جهة النوافذ/الكاميرا)، والناجون من قافلة الغنائم', () => {
    const { state, ev } = wonRaid();
    expect(ev.attackerWon).toBe(true);
    const plan = planBattle(ev, state, false);
    const def = teamCastlePos(state, ev.defenderTeamId);
    expect(plan.siteKind).toBe('castle-gate');
    expect(plan.defCastle.x).toBeCloseTo(def.x, 6);
    expect(plan.defCastle.z).toBeCloseTo(def.z, 6);
    // الموقع عند البوابة: على بعد CASTLE_GATE_DIST من مركز القلعة
    expect(Math.hypot(plan.site.x - def.x, plan.site.z - def.z)).toBeCloseTo(CASTLE_GATE_DIST, 6);
    // جهة النوافذ: اتجاه (قلعة→موقع) يطابق اتجاه الكاميرا العامة 45°
    const gate = castleGatePos(def);
    expect(plan.site.x).toBeCloseTo(gate.x, 6);
    expect(plan.site.z).toBeCloseTo(gate.z, 6);
    expect(plan.site.x - def.x).toBeGreaterThan(0);
    expect(plan.site.z - def.z).toBeGreaterThan(0);
    expect(plan.survivorCount).toBe(1);
    expect(plan.attackerCount).toBe(1); // لا خسائر: خاسر الضرر المتدفق أضعف
    expect(plan.attackerRanks).toEqual(['expert']);
    expect(plan.eventId).toBe(ev.id);
  });

  it('نقطة الانطلاق خارج قاعدة قلعة المهاجم بجهة الهدف', () => {
    const { state, ev } = wonRaid();
    const plan = planBattle(ev, state, false);
    const att = teamCastlePos(state, ev.attackerTeamId);
    // على بعد 7 وحدات من مركز القلعة (خارج نصف القطر الأقصى ~6.4)
    expect(Math.hypot(plan.origin.x - att.x, plan.origin.z - att.z)).toBeCloseTo(7, 6);
    // بجهة الهدف: الجداء الداخلي (قلعة→انطلاق)·(قلعة→موقع) موجب
    const dot = (plan.origin.x - att.x) * (plan.site.x - att.x) + (plan.origin.z - att.z) * (plan.site.z - att.z);
    expect(dot).toBeGreaterThan(0);
  });

  it('مدة المسير ضمن 1.5–2.5ث والإجمالي = مجموع الأطوار', () => {
    const { state, ev } = wonRaid();
    const plan = planBattle(ev, state, false);
    expect(plan.marchMs).toBeGreaterThanOrEqual(1500);
    expect(plan.marchMs).toBeLessThanOrEqual(2500);
    expect(plan.fightMs).toBeCloseTo(1800, 6);
    expect(plan.totalMs).toBeCloseTo(plan.marchMs + plan.fightMs + plan.returnMs + plan.fadeMs, 6);
  });
});

describe('planBattle — غزو خاسر', () => {
  it('كل المهاجمين قتلى، لا ناجين، والموقع بوابة قلعة المدافع', () => {
    const { state, ev } = lostRaid();
    expect(ev.attackerWon).toBe(false);
    expect(ev.attackerLosses).toHaveLength(1);
    const plan = planBattle(ev, state, false);
    expect(plan.survivorCount).toBe(0);
    expect(plan.attackerCount).toBe(1);
    expect(plan.attackerDeadShown).toBe(1);
    const def = teamCastlePos(state, ev.defenderTeamId);
    const gate = castleGatePos(def);
    expect(plan.site.x).toBeCloseTo(gate.x, 6);
    expect(plan.site.z).toBeCloseTo(gate.z, 6);
  });
});

describe('planBattle — تقليل الحركة', () => {
  it('تقصير شديد لكل الأطوار مع prefers-reduced-motion', () => {
    const { state, ev } = wonRaid();
    const full = planBattle(ev, state, false);
    const reduced = planBattle(ev, state, true);
    expect(reduced.totalMs).toBeLessThan(full.totalMs * 0.4);
  });
});

// ─── planLoot: مشاهد النهب بلا قتال (قلعة فارغة / كومة ذهب) ───

const departed = (events: { type: string }[]) =>
  events.find((e) => e.type === 'convoy-departed') as ConvoyDepartedEvent | undefined;

describe('planLoot — نهب بلا قتال', () => {
  it('قلعة فارغة: الموقع بوابة القلعة المنهوبة والنوع castle', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-2', 10, 0);
    addSoldier(s, 'team-1', 'novice', 'inside');
    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'castle', teamId: 'team-2' },
      { novice: 1, soldier: 0, expert: 0 },
      scriptedRng([7]),
    );
    const ev = departed(events);
    expect(ev).toBeDefined();
    expect(battle(events)).toBeUndefined(); // بلا معركة
    const plan = planLoot(ev!.convoy, ev!.id, state, false);
    const def = teamCastlePos(state, 'team-2');
    const gate = castleGatePos(def);
    expect(plan.siteKind).toBe('castle');
    expect(plan.lootCastle).not.toBeNull();
    expect(plan.site.x).toBeCloseTo(gate.x, 6);
    expect(plan.site.z).toBeCloseTo(gate.z, 6);
    expect(plan.eventId).toBe(ev!.id);
    expect(plan.lootGold).toBe(ev!.convoy.goldCarried); // محدودة بسعة حمل الجندي
    expect(plan.lootGold).toBeGreaterThan(0);
    expect(plan.soldierRanks).toEqual(['novice']);
    // الانطلاق من جهة قلعة المهاجم
    const att = teamCastlePos(state, 'team-1');
    expect(Math.hypot(plan.origin.x - att.x, plan.origin.z - att.z)).toBeCloseTo(7, 6);
  });

  it('كومة ذهب: الموقع موضع عرض الكومة والنوع pile', () => {
    const s = makeState();
    s.turnIndex = 0;
    s.piles.push({ id: 'pile-x', amount: 5, position: { x: 10, y: 0, z: 10 }, kind: 'dropped' });
    addSoldier(s, 'team-1', 'novice', 'inside');
    const { state, events } = dispatchArmy(
      s,
      'team-1',
      { kind: 'gold-pile', pileId: 'pile-x' },
      { novice: 1, soldier: 0, expert: 0 },
      scriptedRng([7]),
    );
    const ev = departed(events);
    expect(ev).toBeDefined();
    expect(battle(events)).toBeUndefined();
    const plan = planLoot(ev!.convoy, ev!.id, state, false);
    expect(plan.siteKind).toBe('pile');
    expect(plan.lootCastle).toBeNull();
    // الكومة ما تزال في الحالة بعد الالتقاط الجزئي/الكامل حسب المقدار
    const pile = state.piles.find((p) => p.id === 'pile-x');
    if (pile) {
      const disp = pileScenePosition(state, pile);
      expect(plan.site.x).toBeCloseTo(disp.x, 6);
      expect(plan.site.z).toBeCloseTo(disp.z, 6);
    }
    expect(plan.lootGold).toBe(ev!.convoy.goldCarried);
    expect(plan.lootGold).toBeGreaterThan(0);
  });
});
