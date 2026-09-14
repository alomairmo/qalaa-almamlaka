/**
 * gold-pile-owner — اشتقاق مالك/مصدر كومة الذهب المكشوفة أو الساقطة.
 *
 * - الكومة الخارجية ('outside'): مالكها صريح في ownerTeamId، وإن غاب
 *   نُعيد أقرب قلعة لموقعها (اشتقاق موقعي).
 * - الكومة الساقطة ('dropped'): لا تحمل مصدرًا في الحالة؛ نبحث في طابور
 *   الأحداث غير المُستهلك عن حدث gold-dropped لهذه الكومة، وموت الجندي
 *   الحامل (soldier-died مع droppedGold) يُسجَّل في نفس دفعة الأحداث
 *   (قبل حدث السقوط أو بعده مباشرة — انظر combat.ts / catapult.ts)،
 *   فيكشف teamId قافلة المصدر. إن استُهلكت الأحداث يبقى المصدر مجهولًا.
 */
import type { GameEvent, GameState, GoldPile, Team, Vec3 } from '@/contracts/types';
import { castlePosition } from '@/engine/logic/geometry';

export interface GoldPileOwnerInfo {
  /** الفريق المالك (خارجية) أو فريق قافلة المصدر (ساقطة) إن عُرف */
  team: Team | null;
  /** هل الاشتقاق مؤكد من الحالة/الحدث وليس تخمينًا بأقرب قلعة؟ */
  certain: boolean;
}

/** أقرب قلعة لفريق لموقع معيّن (تُستخدم فقط عند غياب ownerTeamId) */
function nearestCastleTeam(state: GameState, pos: Vec3): Team | null {
  let best: Team | null = null;
  let bestDist = Infinity;
  state.teams.forEach((t, i) => {
    const c = castlePosition(i, state.teams.length);
    const d = (c.x - pos.x) ** 2 + (c.z - pos.z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  });
  return best;
}

/** نافذة الأحداث حول gold-dropped التي قد تحمل موت الجندي الحامل */
const EVENT_WINDOW = 4;

export function resolveGoldPileOwner(state: GameState, eventQueue: GameEvent[], pile: GoldPile): GoldPileOwnerInfo {
  if (pile.kind === 'outside') {
    if (pile.ownerTeamId) {
      const owner = state.teams.find((t) => t.id === pile.ownerTeamId);
      if (owner) return { team: owner, certain: true };
    }
    return { team: nearestCastleTeam(state, pile.position), certain: false };
  }
  // كومة ساقطة: المصدر معروف فقط إن كان حدث السقوط ما يزال في طابور الأحداث
  const idx = eventQueue.findIndex((e) => e.type === 'gold-dropped' && e.pileId === pile.id);
  if (idx >= 0) {
    const from = Math.max(0, idx - EVENT_WINDOW);
    const to = Math.min(eventQueue.length - 1, idx + EVENT_WINDOW);
    for (let i = from; i <= to; i++) {
      const e = eventQueue[i];
      if (e.type === 'soldier-died' && e.droppedGold && e.droppedGold > 0) {
        const source = state.teams.find((t) => t.id === e.teamId);
        if (source) return { team: source, certain: true };
      }
    }
  }
  return { team: null, certain: false };
}
