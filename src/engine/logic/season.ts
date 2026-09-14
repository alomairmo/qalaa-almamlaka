/**
 * دورة الموسم — §18: حساب الفائز، التصفير اليدوي، تحديث الإعدادات.
 */
import type {
  GameEvent,
  GameResetEvent,
  GameSettings,
  GameState,
  Question,
  SettingsChangedEvent,
  TeamId,
  VictoryDeclaredEvent,
} from '@/contracts/types';
import { cloneState, createInitialState, pushLog, stamp, type LogicResult } from './state';
import type { RNG } from '../rng';

/** الذهب الكلي لمجموعة: داخل القلعة + خارجها + في قوافلها على الطريق — §18 */
export function teamTotalGold(state: GameState, teamId: TeamId): number {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return 0;
  const inConvoys = state.convoys
    .filter((c) => c.teamId === teamId)
    .reduce((sum, c) => sum + c.goldCarried, 0);
  return team.goldInside + team.goldOutside + inConvoys;
}

/** إعلان الفائز بنهاية الأسبوع: أعلى ذهب كلي — §18 */
export function declareWinner(state: GameState, rng: RNG): LogicResult {
  const s = cloneState(state);
  const totals: Record<TeamId, number> = {};
  let winner: TeamId = s.teams[0]?.id ?? '';
  let best = -1;
  for (const t of s.teams) {
    totals[t.id] = teamTotalGold(s, t.id);
    if (totals[t.id] > best) {
      best = totals[t.id];
      winner = t.id;
    }
  }
  s.winnerTeamId = winner;
  s.phase = 'victory';
  pushLog(s, `أُعلن الفائز بنهاية الأسبوع بـ ${best} ذهب`, winner);
  const events: GameEvent[] = [stamp<VictoryDeclaredEvent>(rng, { type: 'victory-declared', winnerTeamId: winner, totals })];
  return { state: s, events };
}

/**
 * تصفير اللعبة والإعادة — يدوي بالكامل من الإعدادات مع تأكيد تحذيري.
 * يُبقي الإعدادات وبنك الأسئلة الحاليين، ويصفّر كل التقدم.
 */
export function resetGame(state: GameState | null, rng: RNG): LogicResult {
  const settings = state?.settings;
  const bank = state?.questionBank ?? [];
  const s = createInitialState(settings, bank);
  pushLog(s, 'تم تصفير اللعبة وبدء موسم جديد');
  return { state: s, events: [stamp<GameResetEvent>(rng, { type: 'game-reset' })] };
}

/**
 * تحديث جزئي للإعدادات. ملاحظة موثّقة: تغيير teamCount لا يعيد
 * بناء القلاع وسط الموسم — يُطبق عند resetGame/newSeason التالية.
 */
export function updateSettings(state: GameState, patch: Partial<GameSettings>, rng: RNG): LogicResult {
  const s = cloneState(state);
  s.settings = {
    ...s.settings,
    ...structuredClone(patch),
    round: { ...s.settings.round, ...(patch.round ?? {}) },
    catapult: { ...s.settings.catapult, ...(patch.catapult ?? {}) },
    economy: { ...s.settings.economy, ...(patch.economy ?? {}) },
    combat: { ...s.settings.combat, ...(patch.combat ?? {}) },
    healing: { ...s.settings.healing, ...(patch.healing ?? {}) },
    general: { ...s.settings.general, ...(patch.general ?? {}) },
  };
  const events: GameEvent[] = [stamp<SettingsChangedEvent>(rng, { type: 'settings-changed' })];
  pushLog(s, 'عُدّلت الإعدادات');
  return { state: s, events };
}

/** استبدال بنك الأسئلة كاملًا + تصفير سجل العدالة (أسئلة جديدة كلها) */
export function setQuestionBank(state: GameState, questions: Question[], rng: RNG): LogicResult {
  const s = cloneState(state);
  s.questionBank = questions;
  for (const t of s.teams) s.usedQuestionsPerTeam[t.id] = [];
  s.currentQuestionId = undefined;
  const events: GameEvent[] = [stamp<SettingsChangedEvent>(rng, { type: 'settings-changed' })];
  pushLog(s, `حُدّث بنك الأسئلة (${questions.length} سؤالًا)`);
  return { state: s, events };
}
