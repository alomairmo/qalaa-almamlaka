/**
 * مساعدات الاختبارات: بناء حالات معدّة + مولّد عشوائية مُسكربت
 * (قوة مسحوبة وأضرار محددة سلفًا لجعل المعارك حتمية).
 */
import type { GameState, Rank, Soldier, SoldierState, TeamId } from '@/contracts/types';
import type { RNG } from '../rng';
import { createInitialState, getTeam } from '../logic/state';

/** حالة اختبار ابتدائية (4 مجموعات افتراضيًا) */
export function makeState(): GameState {
  return createInitialState();
}

let counter = 0;
/** إضافة جندي مباشرة لمجموعة في حالة اختبار */
export function addSoldier(
  state: GameState,
  teamId: TeamId,
  rank: Rank,
  soldierState: SoldierState = 'inside',
  hp?: number,
): Soldier {
  const team = getTeam(state, teamId);
  const maxHp = state.settings.combat.rankHp[rank];
  const soldier: Soldier = {
    id: `test-sol-${++counter}`,
    rank,
    hp: hp ?? maxHp,
    maxHp,
    state: soldierState,
  };
  team.soldiers.push(soldier);
  return soldier;
}

/** منح ذهب/حجارة مباشرة */
export function give(state: GameState, teamId: TeamId, gold: number, stones: number): void {
  const team = getTeam(state, teamId);
  team.goldInside += gold;
  team.stonesOutside += stones;
}

/**
 * مولّد مُسكربت: int() يرجع القيم من قائمة powerRolls بالترتيب
 * (قوة المهاجمين أولًا ثم المدافعين — حسب ترتيب السحب في resolveBattle).
 */
export function scriptedRng(rolls: number[] = []): RNG & { remaining: () => number } {
  const queue = rolls.slice();
  return {
    next: () => 0.5,
    int: (min: number, max: number) => {
      const v = queue.shift();
      if (v === undefined) return min;
      return Math.min(max, Math.max(min, v));
    },
    chance: () => true,
    shuffle: <T,>(arr: readonly T[]): T[] => arr.slice(),
    remaining: () => queue.length,
  };
}
