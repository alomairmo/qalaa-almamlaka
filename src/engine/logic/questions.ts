/**
 * بنك الأسئلة — §13.
 * - صيغة اللصق: كل 4 أسطر = سؤال (نص / صحيح / خطأ / خطأ آخر).
 * - الخيارات تُخلط عند كل عرض (في المتجر عبر buildQuestionView).
 * - العدالة: لا يُعاد سؤال لنفس المجموعة قبل استنفاد البنك كاملًا.
 */
import type { GameState, Question, TeamId } from '@/contracts/types';
import { makeId } from './state';
import type { RNG } from '../rng';

/**
 * تحليل نص البنك الملصوق: كل 4 أسطر غير فارغة = سؤال.
 * الأسطر الزائدة عن مضاعفات 4 تُتجاهل (مع تجاهل الأسطر الفارغة).
 */
export function parseQuestionBank(text: string, rng: RNG): Question[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const questions: Question[] = [];
  for (let i = 0; i + 4 <= lines.length; i += 4) {
    const [qt, correct, wrong1, wrong2] = [lines[i], lines[i + 1], lines[i + 2], lines[i + 3]];
    questions.push({ id: makeId('q', rng), text: qt, correct, wrong1, wrong2 });
  }
  return questions;
}

/**
 * اختيار السؤال التالي لمجموعة مع احترام العدالة:
 * لا يتكرر سؤال لنفس المجموعة قبل أن تمر عليها كل أسئلة البنك.
 * عند الاستنفاد يُصفّر سجلها ويبدأ دور جديد.
 * الترتيب: ثابت (أول غير مستخدم) أو عشوائي — من الإعدادات.
 */
export function pickQuestionForTeam(
  state: GameState,
  teamId: TeamId,
  rng: RNG,
): { question: Question | null; usedIds: string[] } {
  const bank = state.questionBank;
  if (bank.length === 0) return { question: null, usedIds: state.usedQuestionsPerTeam[teamId] ?? [] };
  let used = state.usedQuestionsPerTeam[teamId] ?? [];
  let candidates = bank.filter((q) => !used.includes(q.id));
  if (candidates.length === 0) {
    // استُنفد البنك لهذه المجموعة — إعادة الدورة
    used = [];
    candidates = bank;
  }
  const question =
    state.settings.round.questionOrder === 'random'
      ? candidates[rng.int(0, candidates.length - 1)]
      : candidates[0];
  return { question, usedIds: [...used, question.id] };
}

/**
 * بناء عرض السؤال للواجهة: الخيارات الثلاثة مخلوطة عشوائيًا عند كل عرض — §13.
 * يرجع الخيارات المخلوطة + مؤشر الإجابة الصحيحة فيها.
 */
export function buildQuestionView(question: Question, rng: RNG): { options: string[]; correctIndex: number } {
  const options = rng.shuffle([question.correct, question.wrong1, question.wrong2]);
  return { options, correctIndex: options.indexOf(question.correct) };
}
