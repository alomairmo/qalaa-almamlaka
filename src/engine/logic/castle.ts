/**
 * القلعة: بناء الطوابق وإصلاحها — §3.
 * بناء: −5 حجارة (من الإعدادات). إصلاح: حجر = repairHpPerStone نقاط صحة.
 * (هدم الطوابق بالقصف يعالَج في catapult.ts لأنه يطلق الفيض والإعانة.)
 */
import type { FloorBuiltEvent, FloorRepairedEvent, GameEvent, GameState, TeamId } from '@/contracts/types';
import { cloneState, getTeam, noChange, pushLog, stamp, makeId, type LogicResult } from './state';
import { regarrison } from './economy';
import type { RNG } from '../rng';

/** بناء طابق جديد — يفشل بصمت ([]) إن لم تملك المجموعة الكلفة */
export function buildFloor(state: GameState, teamId: TeamId, rng: RNG): LogicResult {
  const s = cloneState(state);
  const team = getTeam(s, teamId);
  const cost = s.settings.economy.floorCost;
  if (team.stonesOutside < cost) return noChange(state);
  team.stonesOutside -= cost;
  const floor = { id: makeId('floor', rng), hp: s.settings.combat.floorHp, maxHp: s.settings.combat.floorHp };
  team.castle.floors.push(floor);
  // طابق جديد = سعة أوسع: قد يدخل جنود من الخارج (الأثمن أولًا)
  regarrison(s, team);
  const events: GameEvent[] = [stamp<FloorBuiltEvent>(rng, { type: 'floor-built', teamId, floorId: floor.id })];
  pushLog(s, `${team.name} بنت طابقًا جديدًا (الطوابق: ${team.castle.floors.length})`, teamId);
  return { state: s, events };
}

/** إصلاح طابق مصاب: كل حجر = repairHpPerStone نقطة صحة (افتراضي 2) */
export function repairFloor(state: GameState, teamId: TeamId, floorId: string, stonesToSpend: number, rng: RNG): LogicResult {
  const s = cloneState(state);
  const team = getTeam(s, teamId);
  const floor = team.castle.floors.find((f) => f.id === floorId);
  if (!floor || stonesToSpend <= 0) return noChange(state);
  const missing = floor.maxHp - floor.hp;
  if (missing <= 0 || team.stonesOutside <= 0) return noChange(state);
  const hpPerStone = s.settings.economy.repairHpPerStone;
  // لا نصرف حجارة تزيد عن اللازم لإكمال الصحة
  const stonesNeeded = Math.ceil(missing / hpPerStone);
  const spent = Math.min(stonesToSpend, stonesNeeded, team.stonesOutside);
  if (spent <= 0) return noChange(state);
  team.stonesOutside -= spent;
  const restored = Math.min(missing, spent * hpPerStone);
  floor.hp += restored;
  const events: GameEvent[] = [
    stamp<FloorRepairedEvent>(rng, { type: 'floor-repaired', teamId, floorId, hpRestored: restored }),
  ];
  pushLog(s, `${team.name} أصلحت طابقًا (+${restored} صحة)`, teamId);
  return { state: s, events };
}
