/**
 * QuestionModal — شاشة السؤال (question.md).
 * نمطان: اختياري (MCQ) بتصحيح فوري + شفهي بحكم المعلم (أزرار + لوحة مفاتيح ص/خ).
 * يعرض الاحتفال/الخيبة محليًا ثم يغلق (الأصوات والأنيميشنات المشتركة في EventLayer).
 * مكوّن بلا props — يعتمد كليًا على useGameStore.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Star } from 'lucide-react';
import { useGameStore, engineApi } from '@/engine';
import { TEAM_COLORS } from '@/contracts/defaults';
import GameButton from '@/components/game/GameButton';
import { useSound } from '@/audio';
import { ModalShell } from './primitives/panels';
import { CircularTimer } from './primitives/widgets';

const OPTION_LETTERS = ['أ', 'ب', 'ج'];
type Result = 'correct' | 'wrong' | 'timeout';

export default function QuestionModal() {
  const state = useGameStore((s) => s.state);
  const questionView = useGameStore((s) => s.questionView);
  const sound = useSound();
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const prevPhase = useRef(state.phase);
  const closeTimer = useRef<number | null>(null);

  const phase = state.phase;
  const question = state.questionBank.find((q) => q.id === state.currentQuestionId);
  const team = state.teams[state.turnIndex];
  const teamColor = team ? TEAM_COLORS[team.color] : '#17A2A0';
  const mcq = state.settings.round.questionMode === 'mcq';
  const open = phase === 'question' || result !== null;

  // إعادة التعيين عند سؤال جديد
  useEffect(() => {
    if (phase === 'question') {
      setSelected(null);
      setResult(null);
      sound.whoosh();
    }
    // انتهى طور السؤال دون نتيجة محلية = انتهى الوقت (يُعامل خطأً من المحرك)
    if (prevPhase.current === 'question' && phase !== 'question' && result === null) {
      setResult('timeout');
    }
    prevPhase.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // الإغلاق التلقائي بعد كشف النتيجة (2.2ث)
  useEffect(() => {
    if (result === null) return;
    closeTimer.current = window.setTimeout(() => {
      setResult(null);
      setSelected(null);
    }, 2200);
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, [result]);

  const confirmMcq = (idx: number) => {
    const correct = questionView ? idx === questionView.correctIndex : false;
    engineApi.submitAnswer(idx);
    setResult(correct ? 'correct' : 'wrong');
  };

  const judge = (correct: boolean) => {
    engineApi.judgeOralAnswer(correct);
    setResult(correct ? 'correct' : 'wrong');
  };

  // لوحة مفاتيح المعلم: 1/2/3 اختيار، Enter تأكيد، ص/خ حكم شفهي
  useEffect(() => {
    if (phase !== 'question') return;
    const onKey = (e: KeyboardEvent) => {
      if (mcq && questionView) {
        const n = ['1', '2', '3'].indexOf(e.key);
        if (n >= 0 && n < questionView.options.length) {
          setSelected(n);
          sound.click();
        } else if (e.key === 'Enter' && selected !== null) {
          confirmMcq(selected);
        }
      } else {
        if (e.key === 'ص' || e.key === '✓') judge(true);
        if (e.key === 'خ' || e.key === '✗') judge(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selected, questionView, mcq]);

  return (
    <ModalShell open={open} allowBackdropClose={false} maxWidth={1100}>
      <div className="relative flex flex-col min-h-0 max-h-[84vh]" data-highlight="question-card">
        {/* شريط الرأس المقوّس */}
        <div className="relative pt-7 pb-3 px-8 flex items-center justify-center gap-3 border-b-2 border-gold-500/60">
          <img src={`/banner-team-${Math.min(state.turnIndex + 1, 4)}.svg`} alt="" className="w-[28px] h-[42px]" />
          <h2 className="font-heading font-extrabold text-[28px]" style={{ color: teamColor }}>
            سؤال {team?.name ?? ''}
          </h2>
        </div>

        {/* عداد السؤال الاختياري */}
        {state.settings.round.questionTimerEnabled && result === null && (
          <div className="absolute top-20 start-6">
            <CircularTimer kind="question" size={96} />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-10 py-6">
          <AnimatePresence mode="wait">
            {result === null ? (
              <motion.div key="q" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {!question && mcq ? (
                  /* حالة بنك فارغ (النمط الاختياري فقط — الشفهي لا يشترط بنكًا §13.2) */
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <img src="/empty-models-illustration.svg" alt="" className="w-[260px] opacity-90" />
                    <p className="font-heading font-bold text-[24px] text-ink">بنك الأسئلة فارغ</p>
                    <p className="font-body text-[18px] text-ink/70 max-w-[520px]">
                      أضيفوا الأسئلة من الإعدادات ← تبويب الإعدادات ← تعديل بنك الأسئلة (كل 4 أسطر = سؤال)
                    </p>
                    <GameButton
                      label="فتح بنك الأسئلة"
                      variant="gold"
                      size="md"
                      onClick={() => engineApi.openSettings()}
                    />
                  </div>
                ) : (
                  <>
                    {/* نص السؤال */}
                    <motion.p
                      className="font-body font-medium text-[30px] leading-[1.6] text-ink text-center parchment-panel rounded-xl border-2 border-wood-700/30 px-6 py-5 mb-6"
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                    >
                      {question?.text ?? 'سؤال شفهي — المعلم يسأل المجموعة ثم يحكم'}
                    </motion.p>

                    {mcq && questionView ? (
                      <>
                        {/* الخيارات المخلوطة */}
                        <div className="flex flex-col gap-3 mb-6">
                          {questionView.options.map((opt, i) => {
                            const isSel = selected === i;
                            return (
                              <motion.button
                                key={i}
                                type="button"
                                onClick={() => {
                                  setSelected(i);
                                  sound.click();
                                }}
                                className={[
                                  'flex items-center gap-4 w-full min-h-[76px] rounded-btn border-2 px-5 text-start font-body font-bold text-[26px] transition-colors',
                                  isSel
                                    ? 'bg-teal-500/15 border-gold-500 text-ink shadow-card'
                                    : 'bg-parchment/60 border-wood-700/40 text-ink hover:bg-parchment',
                                ].join(' ')}
                                initial={{ x: 50, opacity: 0 }}
                                animate={{ x: 0, opacity: 1, y: isSel ? -2 : 0 }}
                                transition={{ delay: 0.1 + i * 0.1, type: 'spring', stiffness: 320, damping: 22 }}
                              >
                                <motion.span
                                  className="grid place-items-center w-[40px] h-[40px] shrink-0 text-white font-heading font-black text-[20px]"
                                  style={{
                                    background: isSel ? 'var(--gold-500)' : 'var(--teal-500)',
                                    clipPath:
                                      'polygon(50% 0%, 61% 18%, 82% 11%, 82% 33%, 100% 44%, 85% 60%, 89% 82%, 67% 82%, 50% 100%, 33% 82%, 11% 82%, 15% 60%, 0% 44%, 18% 33%, 18% 11%, 39% 18%)',
                                  }}
                                  animate={isSel ? { scale: [1.2, 1] } : undefined}
                                >
                                  {OPTION_LETTERS[i]}
                                </motion.span>
                                {opt}
                              </motion.button>
                            );
                          })}
                        </div>
                        <div className="flex justify-center">
                          <GameButton
                            label="تأكيد الإجابة"
                            variant="gold"
                            size="hero"
                            className="min-w-[300px]"
                            disabled={selected === null}
                            onClick={() => selected !== null && confirmMcq(selected)}
                          />
                        </div>
                      </>
                    ) : (
                      /* النمط الشفهي */
                      <div className="flex flex-col items-center gap-6 py-4">
                        <BookOpen size={72} className="text-teal-700" strokeWidth={1.5} />
                        <p className="font-body text-[19px] text-ink/70">
                          حكم المعلم: صحيح (ص) / خطأ (خ) — أو الأزرار أدناه
                        </p>
                        <motion.div
                          className="flex gap-5"
                          initial={{ y: 40, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                        >
                          <GameButton label="✓ إجابة صحيحة" variant="gold" size="hero" onClick={() => judge(true)} />
                          <GameButton label="✗ إجابة خاطئة" variant="danger" size="hero" onClick={() => judge(false)} />
                        </motion.div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            ) : result === 'correct' ? (
              /* احتفال الإجابة الصحيحة */
              <motion.div
                key="win"
                className="flex flex-col items-center gap-4 py-10 text-center"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: [0, 1.15, 1], opacity: 1 }}
                transition={{ duration: 0.5 }}
                onClick={() => setResult(null)}
              >
                <motion.div
                  className="grid place-items-center w-[120px] h-[120px] rounded-full"
                  style={{ background: 'radial-gradient(circle, #F5D76E 30%, rgba(245,215,110,0) 70%)' }}
                >
                  <Star size={72} className="text-success-500" fill="#43A95C" />
                </motion.div>
                <h2 className="font-display text-[56px] text-success-500 leading-tight">أحسنتم! إجابة صحيحة</h2>
                <div className="flex gap-4">
                  <motion.span
                    className="rounded-full bg-gold-500 text-wood-900 font-heading font-black text-[26px] px-6 py-1.5"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    +{state.settings.economy.answerGoldReward} 🪙
                  </motion.span>
                  <motion.span
                    className="rounded-full bg-teal-500 text-white font-heading font-black text-[26px] px-6 py-1.5"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.45 }}
                  >
                    +{state.settings.economy.answerStoneReward} 🪨
                  </motion.span>
                </div>
              </motion.div>
            ) : (
              /* الإجابة الخاطئة / انتهاء الوقت — لطيف غير مهين */
              <motion.div
                key="lose"
                className="flex flex-col items-center gap-4 py-10 text-center"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                onClick={() => setResult(null)}
              >
                {result === 'timeout' && (
                  <motion.span
                    className="rounded-lg border-[3px] border-danger-500 text-danger-500 font-heading font-black text-[34px] px-6 py-1 -rotate-[8deg]"
                    initial={{ scale: 1.3 }}
                    animate={{ scale: 1 }}
                  >
                    انتهى الوقت!
                  </motion.span>
                )}
                <h2 className="font-heading font-bold text-[36px] text-ink">إجابة غير صحيحة — الفرصة القادمة أقرب!</h2>
                {mcq && question && (
                  <p className="font-body font-bold text-[24px] text-success-500 rounded-xl border-2 border-success-500/60 px-6 py-2">
                    الإجابة الصحيحة: {question.correct}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ModalShell>
  );
}
