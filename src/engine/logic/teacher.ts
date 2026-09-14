/**
 * منحة المعلم وجزاؤه — §15 تبويب 2.
 * - الإضافة: أنيميشنات متتابعة مرتبة (مال ثم جنود ثم طوابق) —
 *   ترتيب الأحداث المرجعة يعكس هذا التسلسل.
 * - الخصم: حدث «قصف من السماء» (teacher-penalty) على العناصر المخصومة.
 */
import type {
  FloorBuiltEvent,
  FloorDestroyedEvent,
  GameEvent,
  GameState,
  ResourcesGainedEvent,
  SoldierDiedEvent,
  SoldierRecruitedEvent,
  TeacherGrantEvent,
  TeacherPenaltyEvent,
  TeamAdjustment,
  TeamId,
} from '@/contracts/types';
import { cloneState, getTeam, makeId, noChange, pushLog, stamp, type LogicResult } from './state';
import { depositGold, enforceCapacity, rankWeight, syncOutsidePile } from './economy';
import { createSoldier } from './soldiers';
import type { RNG } from '../rng';

export function applyTeacherAdjustment(
  state: GameState,
  teamId: TeamId,
  delta: TeamAdjustment,
  rng: RNG,
): LogicResult {
  const s = cloneState(state);
  const team = getTeam(s, teamId);
  const events: GameEvent[] = [];
  const applied: TeamAdjustment = {};

  // ── الذهب ──────────────────────────────────
  if (delta.gold && delta.gold !== 0) {
    if (delta.gold > 0) {
      depositGold(s, team, delta.gold, rng);
      applied.gold = delta.gold;
      events.push(stamp<ResourcesGainedEvent>(rng, { type: 'resources-gained', teamId, gold: delta.gold, stones: 0 }));
    } else {
      // الخصم: من الداخل أولًا ثم الخارج (الجزاء يصيب الخزنة المحمية أيضًا)
      let need = -delta.gold;
      const fromInside = Math.min(team.goldInside, need);
      team.goldInside -= fromInside;
      need -= fromInside;
      const fromOutside = Math.min(team.goldOutside, need);
      team.goldOutside -= fromOutside;
      syncOutsidePile(s, team, rng);
      applied.gold = -(fromInside + fromOutside);
    }
  }

  // ── الحجارة ────────────────────────────────
  if (delta.stones && delta.stones !== 0) {
    if (delta.stones > 0) {
      team.stonesOutside += delta.stones;
      applied.stones = delta.stones;
      events.push(stamp<ResourcesGainedEvent>(rng, { type: 'resources-gained', teamId, gold: 0, stones: delta.stones }));
    } else {
      const removed = Math.min(team.stonesOutside, -delta.stones);
      team.stonesOutside -= removed;
      applied.stones = -removed;
    }
  }

  // ── الجنود ─────────────────────────────────
  if (delta.soldiers && delta.soldiers !== 0) {
    if (delta.soldiers > 0) {
      for (let i = 0; i < delta.soldiers; i++) {
        const soldier = createSoldier(s, 'soldier', rng); // منحة المعلم: رتبة «جندي» الوسطى
        team.soldiers.push(soldier);
        events.push(stamp<SoldierRecruitedEvent>(rng, { type: 'soldier-recruited', teamId, soldier }));
      }
      applied.soldiers = delta.soldiers;
    } else {
      // الخصم يأخذ الأضعف أولًا (الأدنى رتبة ثم الأدنى صحة)
      let toRemove = -delta.soldiers;
      const removable = team.soldiers
        .filter((x) => x.state !== 'convoy')
        .sort((a, b) => rankWeight(a.rank) - rankWeight(b.rank) || a.hp - b.hp);
      let removed = 0;
      for (const soldier of removable) {
        if (removed >= toRemove) break;
        team.soldiers = team.soldiers.filter((x) => x.id !== soldier.id);
        events.push(stamp<SoldierDiedEvent>(rng, { type: 'soldier-died', teamId, soldierId: soldier.id }));
        removed++;
      }
      applied.soldiers = -removed;
    }
  }

  // ── الطوابق ────────────────────────────────
  if (delta.floors && delta.floors !== 0) {
    if (delta.floors > 0) {
      for (let i = 0; i < delta.floors; i++) {
        const floor = { id: makeId('floor', rng), hp: s.settings.combat.floorHp, maxHp: s.settings.combat.floorHp };
        team.castle.floors.push(floor);
        events.push(stamp<FloorBuiltEvent>(rng, { type: 'floor-built', teamId, floorId: floor.id }));
      }
      applied.floors = delta.floors;
    } else {
      let toRemove = -delta.floors;
      let removed = 0;
      while (removed < toRemove && team.castle.floors.length > 0) {
        const floor = team.castle.floors[team.castle.floors.length - 1]; // يُخصم الأعلى أولًا
        team.castle.floors.pop();
        const { spilledGold, spilledSoldierIds } = enforceCapacity(s, team, rng);
        events.push(
          stamp<FloorDestroyedEvent>(rng, { type: 'floor-destroyed', teamId, floorId: floor.id, spilledGold, spilledSoldierIds }),
        );
        removed++;
      }
      applied.floors = -removed;
    }
  }

  const hasAny = Object.values(applied).some((v) => v && v !== 0);
  if (!hasAny) return noChange(state);

  // حدث المظلة: منحة (أنيميشنات إضافة متتابعة) أو جزاء (قصف سماء) — §15/§16
  const positive = (applied.gold ?? 0) + (applied.stones ?? 0) + (applied.soldiers ?? 0) + (applied.floors ?? 0) > 0;
  if (positive) {
    events.unshift(stamp<TeacherGrantEvent>(rng, { type: 'teacher-grant', teamId, delta: applied }));
    pushLog(s, `منحة المعلم لـ ${team.name}`, teamId);
  } else {
    events.unshift(stamp<TeacherPenaltyEvent>(rng, { type: 'teacher-penalty', teamId, delta: applied }));
    pushLog(s, `جزاء المعلم على ${team.name} (قصف سماء)`, teamId);
  }
  return { state: s, events };
}
