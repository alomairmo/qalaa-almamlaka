/**
 * شاشة العنوان — قلاع المملكة (home.md).
 * واجهة اللعبة الأمامية: خلفية الوادي الأندلسي + الشعار + القائمة الرئيسية
 * + شريط حالة الموسم + الشريط السفلي. تعمل محليًا بالكامل ولا تحجب على الشبكة.
 *
 * الدمج: كل الأزرار تنادي engineApi مباشرة (مدير الشاشات في App.tsx يقرأ
 * طور المحرك)، وزر الكتم يستخدم useSound (إعدادات اللعبة الموحّدة).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Play, Castle, GraduationCap, Undo2, Landmark } from 'lucide-react';
import GameButton from '@/components/game/GameButton';
import { engineApi, useGameStore } from '@/engine';
import { useSound } from '@/audio';
import { readSeasonSummary } from '@/lib/season-info';
import LinkedSeasonModal from './LinkedSeasonModal';

/** نقطة/نص مؤشر المزامنة الحي في الشريط السفلي */
const FOOTER_DOT: Record<string, string> = {
  unconfigured: '#F6EED9',
  'local-only': '#E8912D',
  syncing: '#E8912D',
  synced: '#43A95C',
  error: '#D64B3C',
};
const FOOTER_LABEL: Record<string, string> = {
  unconfigured: 'غير مُعدّ — يعمل محليًا',
  'local-only': 'محلي فقط',
  syncing: 'جارٍ الرفع إلى Supabase…',
  synced: 'متصل ومُزامَن',
  error: 'فشل الاتصال — ستُعاد المحاولة',
};

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ─────────────────────────────────────────────
// عدّاد متصاعد (لتصاعد ذهب المتصدر في شريط الحالة)
// ─────────────────────────────────────────────
function useTickUp(target: number, duration = 0.6) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  useEffect(() => {
    const controls = animate(mv, target, { duration, ease: 'easeOut', delay: 0.9 });
    return controls.stop;
  }, [target, duration, mv]);
  return rounded;
}

// ─────────────────────────────────────────────
// حوار تأكيد "موسم جديد" — ضغطة مطوّلة 1.5 ثانية
// ─────────────────────────────────────────────
function NewSeasonConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onConfirm();
    }, 1500);
  };
  const stopHold = () => {
    setHolding(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => () => stopHold(), []);

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-teal-900/55 backdrop-blur-[6px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        className="parchment-panel w-[520px] max-w-[90vw] rounded-panel border-[3px] border-wood-700 shadow-modal p-8 text-center"
        style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 12px 32px rgba(43,33,24,.35)' }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading font-extrabold text-[28px] text-danger-500 mb-3">
          بدء موسم جديد؟
        </h2>
        <p className="font-body text-[20px] text-ink leading-relaxed mb-6">
          بدء موسم جديد سيصفّر التقدم الحالي نهائيًا — القلاع والأرصدة والجنود والقوافل.
          <br />
          <span className="font-bold">اضغط مطوّلًا على زر التأكيد للمتابعة.</span>
        </p>
        <div className="flex gap-4 justify-center">
          <motion.button
            type="button"
            className="relative overflow-hidden h-[52px] px-8 rounded-btn bg-danger-500 text-white font-heading font-extrabold text-[20px] border-2 border-red-900 shadow-card"
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            whileTap={{ scale: 0.96 }}
          >
            {/* شريط تقدّم الضغطة المطوّلة */}
            <span
              className="absolute inset-y-0 start-0 bg-red-900/50 transition-none"
              style={{
                width: holding ? '100%' : '0%',
                transition: holding ? 'width 1.5s linear' : 'width 0.15s ease-out',
              }}
            />
            <span className="relative">تأكيد التصفير (اضغط مطوّلًا)</span>
          </motion.button>
          <GameButton label="تراجع" variant="teal" size="md" onClick={onCancel} />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// شاشة العنوان
// ─────────────────────────────────────────────
export default function TitleScreen() {
  const summary = useMemo(() => readSeasonSummary(), []);
  const hasSave = summary !== null;
  const sound = useSound();
  const [confirmNewSeason, setConfirmNewSeason] = useState(false);
  const [linkedOpen, setLinkedOpen] = useState(false);
  const syncStatus = useGameStore((s) => s.syncStatus);
  const [sparkleKey, setSparkleKey] = useState(0);
  const isEmbedded = typeof window !== 'undefined' && window.parent !== window;
  const leaderGold = useTickUp(summary?.leaderGold ?? 0);

  // مسحة اللمعان الذهبي على الشعار كل 7 ثوانٍ
  useEffect(() => {
    const id = setInterval(() => setSparkleKey((k) => k + 1), 7000);
    return () => clearInterval(id);
  }, []);

  // اختصار M لكتم الصوت
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') sound.toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sound]);

  const handleResume = () => {
    // يسترجع الحفظ المحلي ويضبط الطور — مدير الشاشات يلتقط التغيير
    if (engineApi.resumeSeason() === null) engineApi.newSeason();
  };
  const handleNewSeason = () => {
    if (hasSave) {
      setConfirmNewSeason(true);
    } else {
      engineApi.newSeason();
    }
  };
  const confirmNewSeasonAndStart = () => {
    // التصفير داخل المحرك يكتب الحالة الأولية الجديدة فوق الحفظ القديم
    engineApi.newSeason();
    setConfirmNewSeason(false);
  };
  const handleExitToSystem = () => {
    if (isEmbedded) {
      window.parent.postMessage({ type: 'exit-game' }, '*');
    }
  };

  const buttons = [
    ...(hasSave
      ? [
          {
            key: 'resume',
            label: 'استئناف الموسم',
            caption: 'الأسبوع الحالي — تُستكمل من حيث توقفتم',
            variant: 'gold' as const,
            icon: <Play size={30} strokeWidth={2.5} />,
            onClick: handleResume,
          },
        ]
      : []),
    {
      key: 'new',
      label: 'موسم جديد',
      variant: hasSave ? ('teal' as const) : ('gold' as const),
      icon: <Castle size={30} strokeWidth={2.2} />,
      onClick: handleNewSeason,
    },
    {
      key: 'linked',
      label: 'موسم مرتبط بالنظام التعليمي',
      caption: 'اختر الصف والأسبوع — الذهب يتزامن مع قاعدة البيانات',
      variant: 'teal' as const,
      icon: <Landmark size={30} strokeWidth={2.2} />,
      onClick: () => setLinkedOpen(true),
    },
    {
      key: 'tutorial',
      label: 'جولة تعريفية',
      caption: 'سيناريو تفاعلي يشرح كل شيء — لا يؤثر على النتائج',
      variant: 'teal' as const,
      icon: <GraduationCap size={30} strokeWidth={2.2} />,
      onClick: () => engineApi.startTutorial(),
    },
    {
      key: 'settings',
      label: 'الإعدادات',
      variant: 'teal' as const,
      icon: <img src="/icon-settings-gear.svg" alt="" className="w-[30px] h-[30px]" />,
      onClick: () => engineApi.openSettings(),
    },
  ];

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden" dir="rtl">
      {/* ── القسم 1: خلفية الوادي ── */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/title-vista-bg.png)' }}
      />
      {/* تدرّج الساعة الذهبية لوضوح الواجهة */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(245,215,110,.10), rgba(11,62,67,.35) 85%)',
        }}
      />
      {/* تظليل سفلي نحو الخشب الداكن حيث يجلس القائمة */}
      <div
        className="absolute inset-x-0 bottom-0 h-[38%]"
        style={{
          background: 'linear-gradient(180deg, transparent, rgba(46,27,14,.85) 90%)',
        }}
      />

      {/* ── القسم 2: الشعار ── */}
      <div className="absolute top-[4%] inset-x-0 flex flex-col items-center z-10 pointer-events-none">
        <motion.div
          className="relative w-[28vw] min-w-[320px] max-w-[560px]"
          initial={{ y: -80, scale: 0.98, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.3 }}
        >
          <div className="animate-logo-float relative">
            <img
              src="/logo-game.png"
              alt="قلاع المملكة"
              className="w-full drop-shadow-[0_12px_24px_rgba(11,62,67,.45)]"
            />
            {/* مسحة اللمعان الذهبي */}
            <div key={sparkleKey} className="absolute inset-0 overflow-hidden pointer-events-none">
              <div
                className="animate-sparkle-sweep absolute inset-y-0 w-1/4"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,243,196,.75), transparent)',
                }}
              />
            </div>
          </div>
          {/* العنوان العربي بخط الرقعة تحت الشعار */}
          <h1 className="font-display text-[#F5D76E] text-center text-[44px] leading-tight [text-shadow:0_3px_12px_rgba(46,27,14,.8)]">
            قلاع المملكة
          </h1>
        </motion.div>
        <motion.p
          className="font-body font-medium text-[22px] text-parchment [text-shadow:0_2px_8px_rgba(46,27,14,.4)] mt-1 max-[700px]:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        >
          لعبة صفّية تجمع بين التحصيل الدراسي والاستراتيجية والمهارة
        </motion.p>
      </div>

      {/* ── القسم 4: شريط حالة الموسم ── */}
      {summary && (
        <motion.div
          className="absolute top-[38%] inset-x-0 flex justify-center z-10"
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.4, ease: EASE }}
        >
          <div
            className="parchment-panel flex items-center gap-3 px-6 py-2.5 rounded-panel border-[3px] border-wood-700 shadow-card"
            style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 4px 12px rgba(43,33,24,.25)' }}
          >
            <img
              src={`/banner-team-${summary.leaderIndex + 1}.svg`}
              alt=""
              className="w-[32px] h-[48px]"
            />
            <span className="font-heading font-bold text-[20px] text-ink">
              الموسم الحالي · الجولة {summary.roundNumber} · المتصدر: {summary.leaderName}
              {' ('}
              <motion.span className="inline-block tabular-nums">{leaderGold}</motion.span>
              {' ذهب '}
              <img src="/icon-coin-gold.svg" alt="" className="inline w-[22px] h-[22px] -mt-1" />
              {')'}
            </span>
          </div>
        </motion.div>
      )}

      {/* ── القسم 3: القائمة الرئيسية ── */}
      <div className="absolute bottom-[64px] inset-x-0 flex flex-col items-center gap-4 z-10 max-[700px]:gap-3">
        {buttons.map((btn, i) => (
          <motion.div
            key={btn.key}
            className="w-[420px] max-w-[88vw]"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 1.2 + i * 0.09,
              type: 'spring',
              stiffness: 320,
              damping: 22,
            }}
          >
            <GameButton
              label={btn.label}
              caption={'caption' in btn ? btn.caption : undefined}
              icon={btn.icon}
              variant={btn.variant}
              size="hero"
              onClick={btn.onClick}
              className="w-full shadow-screen max-[700px]:!h-[60px] max-[700px]:!text-[22px]"
            />
          </motion.div>
        ))}
        {/* عودة إلى النظام — placeholder للدمج داخل النظام التعليمي */}
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.2 + buttons.length * 0.09, type: 'spring', stiffness: 320, damping: 22 }}
        >
          <GameButton
            label="عودة إلى النظام"
            icon={<Undo2 size={22} />}
            variant="ghost-parchment"
            size="md"
            disabled={!isEmbedded}
            title={isEmbedded ? undefined : 'متاحة عند دمج اللعبة داخل النظام التعليمي'}
            onClick={handleExitToSystem}
          />
        </motion.div>
      </div>

      {/* ── القسم 5: الشريط السفلي ── */}
      <motion.footer
        className="absolute bottom-0 inset-x-0 h-[44px] z-20 flex items-center justify-between px-6"
        style={{ background: 'rgba(11,62,67,.85)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 + 1, duration: 0.5 }}
      >
        {/* حد زليج علوي */}
        <div className="absolute -top-[24px] inset-x-0 h-[24px] zellige-strip" aria-hidden />
        {/* اليمين: الإصدار + مؤشر المزامنة */}
        <div className="flex items-center gap-4">
          <span className="font-body text-[16px] text-parchment/90">
            إصدار 1.0 — يعمل محليًا بالكامل
          </span>
          <span
            className="hud-glass flex items-center gap-2 rounded-full px-4 py-1 font-body text-[16px] text-parchment"
            title="حالة المزامنة السحابية مع قاعدة النظام التعليمي (Supabase)"
          >
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ background: FOOTER_DOT[syncStatus] ?? '#F6EED9' }}
            />
            {FOOTER_LABEL[syncStatus] ?? 'يعمل محليًا'}
          </span>
        </div>
        {/* اليسار: كتم الصوت + تلميح لوحة المفاتيح */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={sound.toggleMute}
            title="كتم الصوت (M)"
            aria-label={sound.muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            className="w-[36px] h-[36px] rounded-full hud-glass flex items-center justify-center hover:brightness-125 transition"
          >
            <img
              src={sound.muted ? '/icon-sound-off.svg' : '/icon-sound-on.svg'}
              alt=""
              className="w-[24px] h-[24px]"
            />
          </button>
          <span className="font-body text-[14px] text-parchment/70 border border-parchment/30 rounded-full px-3 py-1">
            Esc — الإعدادات أثناء اللعب
          </span>
        </div>
      </motion.footer>

      {/* حوار تأكيد الموسم الجديد */}
      <AnimatePresence>
        {confirmNewSeason && (
          <NewSeasonConfirmDialog
            onConfirm={confirmNewSeasonAndStart}
            onCancel={() => setConfirmNewSeason(false)}
          />
        )}
        {linkedOpen && <LinkedSeasonModal onClose={() => setLinkedOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
