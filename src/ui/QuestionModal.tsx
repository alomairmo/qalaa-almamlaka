/**
 * نافذة السؤال — questions.md / الوثيقة §13.
 * لوح خشبي كبير بوسط الشاشة: السؤال بخط 34px + ثلاث لافتات إجابات معلّقة
 * بحبال (تمايل خفيف عند الظهور)، شارة المجموعة وشعارها، عداد دائري اختياري،
 * صحيح: توهج أخضر + صوت fanfare · خطأ: اهتزاز أحمر + صوت wrong.
 * النمط الشفهي (oral): يعرض السؤال مع زرّي «أصاب/أخطأ» لحكم المعلم.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { engineApi, useGameStore } from '@/engine';
import { TEAM_COLORS } from '@/contracts/defaults';
import { useSound } from '@/audio';
import GameButton from '@/components/game/GameButton';
import { CircularTimer } from './primitives/widgets';

/** لافتة إجابة معلّقة بحبلين — تتمايل عند دخولها */
function AnswerBanner({
  text,
  index,
  state,
  disabled,
  onPick,
}: {
  text: string;
  index: number;
  state: 'idle' | 'correct' | 'wrong' | 'dim';
  disabled: boolean;
  onPick: () => void;
}) {
  const bg =
    state === 'correct'
      ? '#43A95C'
      : state === 'wrong'
        ? '#D64545'
        : state === 'dim'
          ? 'rgba(70,50,30,.55)'
          : undefined;
  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ y: -40, opacity: 0, rotate: index === 1 ? 0 : index === 0 ? -4 : 4 }}
      animate={{
        y: 0,
        opacity: state === 'dim' ? 0.45 : 1,
        rotate: 0,
        x: state === 'wrong' ? [0, -8, 8, -6, 6, 0] : 0,
      }}
      transition={
        state === 'wrong'
          ? { x: { duration: 0.4 }, opacity: { duration: 0.2 } }
          : { type: 'spring', stiffness: 300, damping: 16, delay: 0.15 + index * 0.12 }
      }
    >
      {/* الحبلان */}
      <div className="flex justify-between w-[70%]">
        <span className="w-[3px] h-[26px] bg-wood-900/80 rounded" />
        <span className="w-[3px] h-[26px] bg-wood-900/80 rounded" />
      </div>
      <motion.button
        type="button"
        disabled={disabled}
        onClick={onPick}
        className={[
          'min-w-[280px] max-w-[420px] px-8 py-4 rounded-panel border-[3px] border-wood-700 font-heading font-bold text-[24px] shadow-card',
          state === 'idle' ? 'parchment-panel text-ink hover:brightness-105' : 'text-white',
        ].join(' ')}
        style={bg ? { background: bg, boxShadow: state === 'idle' ? 'inset 0 0 0 2px var(--gold-500), 0 4px 12px rgba(43,33,24,.25)' : undefined } : { boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 4px 12px rgba(43,33,24,.25)' }}
        whileTap={state === 'idle' ? { scale: 0.96 } : undefined}
        animate={state === 'correct' ? { boxShadow: ['0 0 0 0 rgba(67,169,92,.9)', '0 0 0 18px rgba(67,169,92,0)'] } : undefined}
        transition={state === 'correct' ? { duration: 0.7 } : undefined}
        data-highlight={`answer-${index}`}
      >
        {text}
      </motion.button>
    </motion.div>
  );
}

export default function QuestionModal() {
  const state = useGameStore((s) => s.state);
  const view = useGameStore((s) => s.questionView);
  const sound = useSound();
  const [picked, setPicked] = useState<number | null>(null);
  const resolveTimer = useRef<number | null>(null);

  const open = state.phase === 'question';
  const team = state.teams[state.turnIndex];
  const question = state.currentQuestionId ? state.questionBank.find((q) => q.id === state.currentQuestionId) : undefined;
  const oral = state.settings.round.questionMode === 'oral';
  const timerEnabled = state.settings.round.questionTimerEnabled;

  // إعادة الضبط عند سؤال جديد
  useEffect(() => {
    setPicked(null);
    return () => {
      if (resolveTimer.current) window.clearTimeout(resolveTimer.current);
    };
  }, [state.currentQuestionId]);

  // اختصارات لوحة المفاتيح: 1/2/3 للإجابات، ✓/✗ للشفهي
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!oral && view && picked === null && ['1', '2', '3'].includes(e.key)) {
        pick(Number(e.key) - 1);
      } else if (oral && question) {
        if (e.key === 'ص' || e.key === '✓') judge(true);
        if (e.key === 'خ' || e.key === '✗') judge(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, oral, view !== null, picked, question?.id]);

  if (!team) return null;
  const teamColor = TEAM_COLORS[team.color];

  const pick = (index: number) => {
    if (picked !== null || !view) return;
    setPicked(index);
    const correct = index === view.correctIndex;
    if (correct) sound.fanfare();
    else sound.wrong();
    // اعرض نتيجة الاختيار لحظة ثم أرسل للمحرك
    resolveTimer.current = window.setTimeout(() => {
      engineApi.submitAnswer(index);
    }, 900);
  };

  const judge = (correct: boolean) => {
    if (picked !== null) return;
    setPicked(correct ? 1 : 0);
    if (correct) sound.fanfare();
    else sound.wrong();
    resolveTimer.current = window.setTimeout(() => {
      engineApi.judgeOralAnswer(correct);
    }, 700);
  };

  const bannerState = (i: number): 'idle' | 'correct' | 'wrong' | 'dim' => {
    if (picked === null || !view) return 'idle';
    if (i === view.correctIndex && picked === view.correctIndex) return 'correct';
    if (i === picked) return 'wrong';
    return 'dim';
  };

  return (
    <AnimatePresence>
      {open && question && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* خلفية معتمة خفيفة */}
          <div className="absolute inset-0 bg-teal-900/45 backdrop-blur-[3px]" />
          <motion.div
            className="relative parchment-panel rounded-panel border-[4px] border-wood-700 shadow-modal w-[720px] max-w-[92vw] px-10 pt-8 pb-9"
            style={{ boxShadow: 'inset 0 0 0 3px var(--gold-500), 0 18px 48px rgba(43,33,24,.5)' }}
            initial={{ scale: 0.85, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            data-highlight="question-modal"
          >
            {/* رأس: شعار وشارة المجموعة + العداد */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <span
                  className="w-[46px] h-[46px] rounded-full border-[3px] border-wood-700 shadow-card"
                  style={{ background: teamColor }}
                />
                <div>
                  <div className="font-heading font-extrabold text-[24px] text-ink">سؤال {team.name}</div>
                  <div className="font-body text-[16px] text-ink/60">
                    {oral ? 'أجيبوا شفهيًا — والمعلم يحكم' : 'اختاروا الإجابة الصحيحة'}
                  </div>
                </div>
              </div>
              {timerEnabled && <CircularTimer kind="question" size={84} />}
            </div>

            {/* نص السؤال */}
            <div className="rounded-panel border-[3px] border-wood-700/50 bg-parchment/70 px-8 py-6 mb-7">
              <p className="font-heading font-black text-[34px] leading-snug text-ink text-center">
                {question.text}
              </p>
            </div>

            {/* الإجابات أو حكم المعلم */}
            {!oral && view ? (
              <div className="flex justify-center gap-4 flex-wrap">
                {view.options.map((opt, i) => (
                  <AnswerBanner
                    key={`${view.questionId}-${i}`}
                    text={opt}
                    index={i}
                    state={bannerState(i)}
                    disabled={picked !== null}
                    onPick={() => pick(i)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <details className="w-full text-center">
                  <summary className="font-body text-[18px] text-teal-700 cursor-pointer">كشف الإجابة للمعلم</summary>
                  <p className="font-heading font-bold text-[24px] text-success-500 mt-2">{question.correct}</p>
                </details>
                <div className="flex gap-4">
                  <GameButton label="✓ أصابوا" variant="gold" size="lg" disabled={picked !== null} onClick={() => judge(true)} />
                  <GameButton label="✗ أخطؤوا" variant="danger" size="lg" disabled={picked !== null} onClick={() => judge(false)} />
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
