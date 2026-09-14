/**
 * نظام الجولات — §12.
 * - عجلة أدوار ثابتة: 1 ← 2 ← 3 ← 4 ← 1 (turnIndex دوّار).
 * - الجولة: سؤال ثم جولة تصرف (العدادات يديرها المتجر).
 * - مع بداية جولة مجموعة: وصول قوافلها + تقدّم قوافل الآخرين + شفاءها.
 * - الإجابة الصحيحة: +ذهب/+حجارة (من الإعدادات) ثم طور التصرف.
 * - الإجابة الخاطئة: نهاية الجولة فورًا.
 */
import type {
  CorrectAnswerEvent,
  GameEvent,
  GameState,
  QuestionShownEvent,
  ResourcesGainedEvent,
  TurnChangedEvent,
  WrongAnswerEvent,
} from '@/contracts/types';
import { cloneState, currentTeam, noChange, pushLog, stamp, type LogicResult } from './state';
import { depositGold, syncOutsidePile } from './economy';
import { processConvoysAtTurnStart } from './convoys';
import { applyHealingForTeam } from './soldiers';
import { pickQuestionForTeam } from './questions';
import type { RNG } from '../rng';

/**
 * بدء جولة المجموعة الحالية:
 * 1) إنهاء حماية إعادة الإعمار الخاصة بها (قضت جولة كاملة محمية).
 * 2) معالجة القوافل (وصول/تقدّم) والشفاء.
 * 3) سحب السؤال التالي بعدالة وعرضه (phase = 'question').
 */
export function startTurn(state: GameState, rng: RNG): LogicResult {
  const s = cloneState(state);
  const team = currentTeam(s);

  // عداد حماية المجموعة ينقضي مع بداية جولتها التالية
  if ((s.protectionRoundsLeft[team.id] ?? 0) > 0) {
    s.protectionRoundsLeft[team.id] -= 1;
  }

  const events: GameEvent[] = [];
  events.push(...processConvoysAtTurnStart(s, team.id, rng));
  events.push(...applyHealingForTeam(s, team.id, rng));

  const { question, usedIds } = pickQuestionForTeam(s, team.id, rng);
  if (question) {
    s.usedQuestionsPerTeam[team.id] = usedIds;
    s.currentQuestionId = question.id;
    s.phase = 'question';
    events.push(stamp<TurnChangedEvent>(rng, { type: 'turn-changed', teamId: team.id, roundNumber: s.roundNumber }));
    events.push(stamp<QuestionShownEvent>(rng, { type: 'question-shown', teamId: team.id, questionId: question.id }));
  } else if (s.settings.round.questionMode === 'oral') {
    // النمط الشفهي لا يشترط بنكًا — §13.2: المعلم يسأل من عنده ثم يحكم صحيح/خاطئ
    s.currentQuestionId = undefined;
    s.phase = 'question';
    events.push(stamp<TurnChangedEvent>(rng, { type: 'turn-changed', teamId: team.id, roundNumber: s.roundNumber }));
    pushLog(s, `بدأت جولة ${team.name} (سؤال شفهي — المعلم يسأل من عنده)`, team.id);
  } else {
    // لا أسئلة في البنك: ننتقل مباشرة لجولة التصرف
    s.currentQuestionId = undefined;
    s.phase = 'action';
    events.push(stamp<TurnChangedEvent>(rng, { type: 'turn-changed', teamId: team.id, roundNumber: s.roundNumber }));
    pushLog(s, `بدأت جولة ${team.name} (بلا سؤال — البنك فارغ)`, team.id);
  }
  return { state: s, events };
}

/**
 * الحكم على الإجابة (MCQ مؤكدة أو شفهية محكومة من المعلم):
 * صحيحة ← موارد + طور التصرف. خاطئة ← نهاية الجولة.
 */
export function resolveAnswer(state: GameState, correct: boolean, rng: RNG): LogicResult {
  const s = cloneState(state);
  const team = currentTeam(s);
  const questionId = s.currentQuestionId ?? 'oral';
  const events: GameEvent[] = [];

  if (correct) {
    const { answerGoldReward, answerStoneReward } = s.settings.economy;
    depositGold(s, team, answerGoldReward, rng);
    team.stonesOutside += answerStoneReward;
    syncOutsidePile(s, team, rng);
    events.push(stamp<CorrectAnswerEvent>(rng, { type: 'correct-answer', teamId: team.id, questionId }));
    events.push(
      stamp<ResourcesGainedEvent>(rng, {
        type: 'resources-gained',
        teamId: team.id,
        gold: answerGoldReward,
        stones: answerStoneReward,
      }),
    );
    pushLog(s, `${team.name} أجابت صحيحًا (+${answerGoldReward} ذهب، +${answerStoneReward} حجارة)`, team.id);
    s.phase = 'action';
    return { state: s, events };
  }

  events.push(stamp<WrongAnswerEvent>(rng, { type: 'wrong-answer', teamId: team.id, questionId }));
  pushLog(s, `${team.name} أجابت خطأ — انتهت جولتها`, team.id);
  return advanceTurnInternal(s, events);
}

/** إنهاء الجولة (مبكرًا أو بانتهاء العداد) — ينقل الدور للمجموعة التالية */
export function endTurn(state: GameState): LogicResult {
  if (state.phase !== 'action') return noChange(state);
  const s = cloneState(state);
  return advanceTurnInternal(s, []);
}

/** نقل الدور دوّارًا؛ اكتمال دورة كاملة يرفع رقم الجولة */
function advanceTurnInternal(s: GameState, events: GameEvent[]): LogicResult {
  s.currentQuestionId = undefined;
  const next = (s.turnIndex + 1) % s.teams.length;
  if (next === 0) s.roundNumber += 1; // اكتملت دورة كل المجموعات — §12
  s.turnIndex = next;
  s.phase = 'idle';
  return { state: s, events };
}
