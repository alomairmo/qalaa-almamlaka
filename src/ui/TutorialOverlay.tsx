/**
 * TutorialOverlay — الجولة التعريفية (tutorial.md).
 * يقرأ خطوات engine/tutorial-script عبر المتجر: فقاعات مرساة على العناصر
 * (data-highlight) مع تعتيم cutout + زر «التالي» (ينفّذ محاكاة الخطوة
 * عبر tutorialNext على النسخة المعزولة) + عداد خطوات.
 * مكوّن بلا props — يعتمد على useGameStore.
 */
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GraduationCap } from 'lucide-react';
import { useGameStore, engineApi, tutorialNext, TUTORIAL_STEPS } from '@/engine';
import { selectArmyTarget } from '@/scene/bridge';
import { useSound } from '@/audio';
import { useUiStore } from './ui-store';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function TutorialOverlay() {
  const active = useGameStore((s) => s.tutorialActive);
  const stepIndex = useGameStore((s) => s.tutorialStepIndex);
  const sound = useSound();
  const addToast = useUiStore((s) => s.addToast);
  const [anchor, setAnchor] = useState<Rect | null>(null);

  const step = TUTORIAL_STEPS[stepIndex] ?? null;
  const isLast = stepIndex >= TUTORIAL_STEPS.length - 1;

  // إيجاد العنصر المُضاء عبر سمة data-highlight (تضبطها مكونات الواجهة/المشهد)
  useEffect(() => {
    if (!active || !step?.highlight) {
      setAnchor(null);
      return;
    }
    const find = () => {
      const el = document.querySelector(`[data-highlight="${step.highlight}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setAnchor({ x: r.x, y: r.y, w: r.width, h: r.height });
      } else {
        setAnchor(null);
      }
    };
    find();
    const id = window.setInterval(find, 500);
    window.addEventListener('resize', find);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', find);
    };
  }, [active, step]);

  /**
   * قبل التقدّم/الخروج: أغلق كل البطاقات الثابتة المعروضة (يرفع إشارة
   * يستمع لها EventLayer فيؤكّد البطاقة ويتابع طابور الأحداث — كأن المستخدم
   * ضغط «تأكيد ✓») وأي نافذة غير لازمة للخطوة الجديدة (نافذة الإرسال).
   */
  const closeOverlays = useCallback(() => {
    useUiStore.getState().requestStickyClose();
    try {
      selectArmyTarget(null); // نافذة الإرسال إن كانت مفتوحة
    } catch {
      /* جسر المشهد غير جاهز */
    }
  }, []);

  const next = useCallback(() => {
    sound.click();
    closeOverlays();
    tutorialNext();
  }, [sound, closeOverlays]);

  const exit = useCallback(() => {
    closeOverlays();
    engineApi.endTutorial();
    addToast('عادت اللعبة لحالتها المحفوظة ✓', 'success');
  }, [addToast, closeOverlays]);

  // موضع الفقاعة: بجوار العنصر المُضاء أو منتصف أسفل الشاشة
  const bubbleStyle: React.CSSProperties = anchor
    ? {
        position: 'fixed',
        top: Math.min(window.innerHeight - 260, anchor.y + anchor.h + 24),
        left: Math.max(24, Math.min(window.innerWidth - 540, anchor.x + anchor.w / 2 - 260)),
      }
    : { position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)' };

  return (
    <AnimatePresence>
      {active && step && (
        <div className="fixed inset-0 z-[50]" key="tutorial">
          {/* إطار ذهبي متوهج حول العنصر المُضاء — بلا أي تعتيم لباقي الشاشة */}
          {anchor && (
            <motion.div
              className="absolute pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute',
                borderRadius: 20,
                top: anchor.y - 10,
                left: anchor.x - 10,
                width: anchor.w + 20,
                height: anchor.h + 20,
                border: '3px solid var(--gold-500)',
                boxShadow: '0 0 24px rgba(245,215,110,.85), inset 0 0 18px rgba(245,215,110,.35)',
              }}
            />
          )}

          {/* شريطا letterbox + شارة التوتوريال */}
          <motion.div
            className="absolute top-0 inset-x-0 h-[36px] zellige-strip"
            initial={{ y: -40 }}
            animate={{ y: 0 }}
            exit={{ y: -40 }}
          />
          <motion.div
            className="absolute bottom-0 inset-x-0 h-[36px] zellige-strip"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
          />
          <motion.div
            className="absolute top-[44px] inset-x-0 flex justify-center pointer-events-none"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span className="hud-glass rounded-full px-5 py-1.5 font-heading font-bold text-[17px] text-turquoise-glaze flex items-center gap-2">
              <GraduationCap size={18} /> جولة تعريفية — تجريبي، لا يؤثر على النتائج
            </span>
          </motion.div>
          <button
            type="button"
            className="absolute top-[44px] end-4 hud-glass rounded-full px-5 py-1.5 font-heading font-bold text-[16px] text-parchment hover:brightness-125"
            onClick={exit}
          >
            خروج من الجولة
          </button>

          {/* الفقاعة الإرشادية */}
          <motion.div
            key={step.id}
            className="w-[520px] max-w-[90vw] parchment-panel rounded-panel border-[3px] border-wood-700 p-5 shadow-screen"
            style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 24px 64px rgba(11,62,67,.5)', ...bubbleStyle }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="grid place-items-center min-w-[56px] h-[32px] px-2 text-wood-900 font-heading font-black text-[15px]"
                style={{
                  background: 'var(--gold-500)',
                  clipPath:
                    'polygon(50% 0%, 61% 18%, 82% 11%, 82% 33%, 100% 44%, 85% 60%, 89% 82%, 67% 82%, 50% 100%, 33% 82%, 11% 82%, 15% 60%, 0% 44%, 18% 33%, 18% 11%, 39% 18%)',
                }}
              >
                {stepIndex + 1}/{TUTORIAL_STEPS.length}
              </span>
              <button type="button" className="font-body text-[15px] text-ink/60 underline" onClick={exit}>
                تخطي الجولة
              </button>
            </div>
            <p className="font-body font-medium text-[19px] text-ink leading-relaxed">{step.bubble}</p>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                className="h-[48px] px-8 rounded-btn btn-gold-gradient text-wood-900 font-heading font-extrabold text-[20px] border-2 border-gold-600 shadow-card"
                onClick={isLast ? exit : next}
              >
                {isLast ? 'ابدأ اللعب 🏰' : 'التالي'}
              </button>
            </div>
          </motion.div>

          {/* علامة «محاكاة» */}
          <span className="absolute bottom-[44px] end-4 font-body text-[14px] text-parchment/60 hud-glass rounded-full px-3 py-1">
            محاكاة
          </span>
        </div>
      )}
    </AnimatePresence>
  );
}
