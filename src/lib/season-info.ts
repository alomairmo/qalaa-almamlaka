/**
 * قراءة ملخص الموسم المحفوظ محليًا (لشريط الحالة في شاشة العنوان).
 *
 * المفتاح يجب أن يطابق ما سيستخدمه LocalStorageProvider في المحرك القادم.
 * القراءة دفاعية بالكامل: أي خطأ في التحويل يعامل كعدم وجود حفظ.
 */
import type { GameState } from '@/contracts/types';

export const SAVE_KEY = 'qalaa-almamlaka:game-save';

export interface SeasonSummary {
  roundNumber: number;
  /** فهرس المتصدر داخل teams (0-based) لاختيار رايته */
  leaderIndex: number;
  leaderName: string;
  leaderGold: number;
}

/** يحسب الذهب الكلي لمجموعة: داخل + خارج + ما في الطريق (قوافلها) */
function teamTotalGold(state: GameState, teamIndex: number): number {
  const team = state.teams[teamIndex];
  if (!team) return 0;
  const inConvoys = state.convoys
    .filter((c) => c.teamId === team.id)
    .reduce((sum, c) => sum + c.goldCarried, 0);
  return team.goldInside + team.goldOutside + inConvoys;
}

/** يقرأ الحالة المحفوظة ويلخصها لشاشة العنوان — null إن لم يوجد حفظ صالح */
export function readSeasonSummary(): SeasonSummary | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    if (!state || !Array.isArray(state.teams) || state.teams.length === 0) return null;
    let leaderIndex = 0;
    let leaderGold = -1;
    state.teams.forEach((_, i) => {
      const total = teamTotalGold(state, i);
      if (total > leaderGold) {
        leaderGold = total;
        leaderIndex = i;
      }
    });
    return {
      roundNumber: state.roundNumber ?? 1,
      leaderIndex,
      leaderName: state.teams[leaderIndex].name,
      leaderGold: Math.max(0, leaderGold),
    };
  } catch {
    return null;
  }
}

/** هل يوجد موسم محفوظ؟ */
export function hasSavedSeason(): boolean {
  return readSeasonSummary() !== null;
}
