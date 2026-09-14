/**
 * الاقتصاد والسعة والتعبئة — §2، §3 (السعة)، §4 (الأثمن يُحفظ أولًا)، §9.
 *
 * قواعد جوهرية:
 * - سعة الذهب/الجنود = (1 + عدد الطوابق) × سعة المستوى (القاعدة تُحسب مستوى).
 * - ما زاد عن سعة الذهب يفيض لكومة «خارجية» مكشوفة بجوار القلعة.
 * - الجنود الأعلى رتبة يدخلون القلعة أولًا، والأدنى يعسكرون خارجًا.
 * - الحجارة كلها خارج القلعة مكشوفة دائمًا (لا سعة لها).
 */
import type { GameState, GoldPile, Rank, Soldier, Team, TeamId } from '@/contracts/types';
import { RANK_ORDER } from '@/contracts/defaults';
import { outsidePilePosition, castlePosition } from './geometry';
import { makeId } from './state';
import type { RNG } from '../rng';

/** سعة الذهب = القاعدة + الطوابق، كل مستوى يضيف goldCapacityPerLevel */
export function goldCapacity(team: Team, state: GameState): number {
  return (1 + team.castle.floors.length) * state.settings.combat.goldCapacityPerLevel;
}

/** سعة الجنود داخل القلعة */
export function soldierCapacity(team: Team, state: GameState): number {
  return (1 + team.castle.floors.length) * state.settings.combat.soldierCapacityPerLevel;
}

/** وزن الرتبة للمقارنة (خبير > جندي > مبتدئ) */
export function rankWeight(rank: Rank): number {
  return RANK_ORDER.indexOf(rank);
}

/**
 * مزامنة كومة الذهب الخارجية في piles[] مع team.goldOutside.
 * الذهب الخارجي كومة واحدة لكل مجموعة بجوار قلعتها (تُحذف عند الصفر).
 */
export function syncOutsidePile(state: GameState, team: Team, rng: RNG): void {
  const idx = teamIndexSafe(state, team.id);
  const existing = state.piles.find((p) => p.kind === 'outside' && p.ownerTeamId === team.id);
  if (team.goldOutside <= 0) {
    if (existing) state.piles = state.piles.filter((p) => p.id !== existing.id);
    return;
  }
  if (existing) {
    existing.amount = team.goldOutside;
    existing.position = outsidePilePosition(idx, state.teams.length);
  } else {
    const pile: GoldPile = {
      id: makeId('pile', rng),
      amount: team.goldOutside,
      position: outsidePilePosition(idx, state.teams.length),
      kind: 'outside',
      ownerTeamId: team.id,
    };
    state.piles.push(pile);
  }
}

function teamIndexSafe(state: GameState, teamId: TeamId): number {
  const i = state.teams.findIndex((t) => t.id === teamId);
  return i >= 0 ? i : 0;
}

/**
 * إيداع ذهب في خزنة المجموعة مع تطبيق الفيض التلقائي:
 * يملأ الداخل حتى السعة، والزائد يفيض للكومة الخارجية المكشوفة — §3.
 * يرجع مقدار ما فاض فعليًا (للأحداث/السجل).
 */
export function depositGold(state: GameState, team: Team, amount: number, rng: RNG): number {
  const cap = goldCapacity(team, state);
  const room = Math.max(0, cap - team.goldInside);
  const toInside = Math.min(room, amount);
  const spill = amount - toInside;
  team.goldInside += toInside;
  team.goldOutside += spill;
  syncOutsidePile(state, team, rng);
  return spill;
}

/**
 * إعادة توزيع جنود المجموعة بين الداخل والخارج حسب قاعدة
 * «الأثمن يُحفظ أولًا»: الأعلى رتبة يدخل أولًا لملء السعة — §4.
 * (عند التعادل بالرتبة يُفضَّل الأعلى صحة). لا تُلمس جنود القوافل.
 * يرجع معرّفات من خرجوا للتو (لحدث فيض الهدم).
 */
export function regarrison(state: GameState, team: Team): { movedOutside: string[]; movedInside: string[] } {
  const cap = soldierCapacity(team, state);
  const garrison = team.soldiers.filter((s) => s.state === 'inside' || s.state === 'outside');
  const sorted = garrison
    .slice()
    .sort((a, b) => rankWeight(b.rank) - rankWeight(a.rank) || b.hp - a.hp);
  const insideIds = new Set(sorted.slice(0, cap).map((s) => s.id));
  const movedOutside: string[] = [];
  const movedInside: string[] = [];
  for (const s of garrison) {
    const shouldBe: Soldier['state'] = insideIds.has(s.id) ? 'inside' : 'outside';
    if (s.state !== shouldBe) {
      if (shouldBe === 'outside') movedOutside.push(s.id);
      else movedInside.push(s.id);
      s.state = shouldBe;
      delete s.convoyId;
    }
  }
  return { movedOutside, movedInside };
}

/**
 * إعادة فرض السعة بعد تغيّر عدد الطوابق (هدم/خصم):
 * الذهب الزائد يفيض للخارج، والجنود الزائدون يخرجون — §8 (أثر تدمير الطابق).
 * يرجع تفاصيل الفيض للأحداث.
 */
export function enforceCapacity(
  state: GameState,
  team: Team,
  rng: RNG,
): { spilledGold: number; spilledSoldierIds: string[] } {
  const cap = goldCapacity(team, state);
  let spilledGold = 0;
  if (team.goldInside > cap) {
    spilledGold = team.goldInside - cap;
    team.goldInside = cap;
    team.goldOutside += spilledGold;
    syncOutsidePile(state, team, rng);
  }
  const { movedOutside } = regarrison(state, team);
  return { spilledGold, spilledSoldierIds: movedOutside };
}

/** موقع كومة ساقطة جديدة على الطريق (تُستخدم عند موت جندي قافلة) */
export function dropPile(state: GameState, amount: number, position: { x: number; y: number; z: number }, rng: RNG): GoldPile {
  const pile: GoldPile = {
    id: makeId('pile', rng),
    amount,
    position: { ...position },
    kind: 'dropped',
  };
  state.piles.push(pile);
  return pile;
}

/** موقع قلعة مجموعة (لاستخدامه في مواقع الأكوام/القوافل) */
export function teamCastlePosition(state: GameState, teamId: TeamId) {
  return castlePosition(teamIndexSafe(state, teamId), state.teams.length);
}
