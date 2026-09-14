/**
 * عناصر واجهة صغيرة مشتركة — design.md §9:
 * CircularTimer, SyncIndicator, RankBadge, Toast, DamageFloat, SkipButton
 * وبدائيات الإعدادات: NumberStepper, Toggle, SliderRow, SegmentedControl, TextAreaPanel.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, X } from 'lucide-react';
import { useGameStore } from '@/engine';
import type { Rank } from '@/contracts/types';
import { RANK_LABELS } from '@/contracts/defaults';
import { useSound } from '@/audio';
import { useUiStore } from '../ui-store';

// ─────────────────────────────────────────────
// CircularTimer — قرص يتناقص + رقم كبير + احمرار آخر 10 ثوانٍ
// ─────────────────────────────────────────────
export function CircularTimer({ kind, size = 96 }: { kind: 'question' | 'action'; size?: number }) {
  const timer = useGameStore((s) => (s.timer && s.timer.kind === kind ? s.timer : null));
  const sound = useSound();
  const lastSec = useRef(-1);

  const remaining = timer?.remaining ?? 0;
  const total = timer?.total ?? 1;
  const urgent = remaining <= 10 && remaining > 0;

  // تكتكة كل ثانية — أعلى في آخر 10 ثوانٍ (§16-أ)
  useEffect(() => {
    const sec = Math.ceil(remaining);
    if (timer && sec !== lastSec.current && sec > 0) {
      lastSec.current = sec;
      sound.tick(urgent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, timer !== null]);

  const frac = total > 0 ? remaining / total : 0;
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const color = urgent ? '#D64545' : '#E8B93B';

  return (
    <motion.div
      className="relative grid place-items-center hud-glass rounded-full"
      style={{ width: size, height: size }}
      animate={urgent ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={urgent ? { duration: 0.5, repeat: Infinity } : { duration: 0.2 }}
      data-highlight={`timer-${kind}`}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(246,238,217,.2)" strokeWidth={8} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset .25s linear, stroke .3s' }}
        />
      </svg>
      <span
        className="font-heading font-black tabular-nums"
        style={{ fontSize: size >= 90 ? 56 : Math.round(size * 0.42), color }}
      >
        {Math.ceil(remaining)}
      </span>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// SyncIndicator — حبة حالة المزامنة + نبضة «تم الحفظ ✓»
// ─────────────────────────────────────────────
const SYNC_LABEL = {
  unconfigured: 'غير مُعدّ — يعمل محليًا',
  'local-only': 'محلي فقط',
  syncing: 'جارٍ الرفع…',
  synced: 'متصل ومُزامَن',
  error: 'فشل الاتصال — إعادة محاولة',
} as const;
const SYNC_DOT = {
  unconfigured: '#F6EED9',
  'local-only': '#E8912D',
  syncing: '#E8912D',
  synced: '#43A95C',
  error: '#D64B3C',
} as const;

export function SyncIndicator() {
  const syncStatus = useGameStore((s) => s.syncStatus);
  const lastSavedAt = useGameStore((s) => s.state.lastSavedAt);
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!lastSavedAt) return;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 900);
    return () => window.clearTimeout(id);
  }, [lastSavedAt]);

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hud-glass flex items-center gap-2 rounded-full px-4 py-1.5 font-body text-[16px] text-parchment"
        animate={pulse ? { boxShadow: ['0 0 0 0 rgba(67,169,92,.8)', '0 0 0 10px rgba(67,169,92,0)'] } : undefined}
        transition={{ duration: 0.6 }}
        title="حالة المزامنة"
      >
        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: SYNC_DOT[syncStatus] }} />
        {pulse ? 'تم الحفظ ✓' : SYNC_LABEL[syncStatus]}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute top-full mt-2 start-0 w-[320px] parchment-panel rounded-panel border-[3px] border-wood-700 p-4 shadow-modal z-[45]"
            style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 12px 32px rgba(43,33,24,.35)' }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <p className="font-body text-[16px] text-ink leading-relaxed">
              تُحفظ اللعبة محليًا على هذا الجهاز بعد كل حدث تلقائيًا — لا يضيع أي تقدم بلا إنترنت.
              اللعبة مهيأة للمزامنة السحابية مع <b>Supabase</b> (من الإعدادات ← عام ← المزامنة السحابية)
              وستُفعَّل فور إدخال بيانات الربط.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────
// RankBadge — ميدالية الرتبة النجمية + نقاط الصحة
// ─────────────────────────────────────────────
const RANK_ICON: Record<Rank, string> = {
  novice: '/rank-novice.svg',
  soldier: '/rank-soldier.svg',
  expert: '/rank-expert.svg',
};

export function RankBadge({
  rank,
  size = 40,
  hp,
  maxHp,
  showLabel = false,
}: {
  rank: Rank;
  size?: number;
  hp?: number;
  maxHp?: number;
  showLabel?: boolean;
}) {
  return (
    <span className="inline-flex flex-col items-center gap-0.5" title={RANK_LABELS[rank]}>
      <img src={RANK_ICON[rank]} alt={RANK_LABELS[rank]} style={{ width: size, height: size }} />
      {showLabel && <span className="font-heading font-bold text-[16px] text-ink">{RANK_LABELS[rank]}</span>}
      {hp !== undefined && maxHp !== undefined && (
        <span className="flex gap-[3px]">
          {Array.from({ length: maxHp }, (_, i) => (
            <span
              key={i}
              className="w-[7px] h-[7px] rounded-full"
              style={{ background: i < hp ? '#43A95C' : 'rgba(43,33,24,.25)' }}
            />
          ))}
        </span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────
// Toast — مضيف التوستات (أعلى المنتصف، z-80)
// ─────────────────────────────────────────────
const TOAST_STYLE = {
  info: 'hud-glass text-parchment',
  success: 'bg-success-500 text-white',
  danger: 'bg-danger-500 text-white',
} as const;

export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div className="fixed top-[110px] inset-x-0 z-[80] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`rounded-full px-6 py-2 font-heading font-bold text-[18px] shadow-card ${TOAST_STYLE[t.kind]}`}
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────
// DamageFloat — أرقام عائمة (تصاعد 60px مع خفوت)
// ─────────────────────────────────────────────
const FLOAT_COLOR = { red: '#D64545', gold: '#E8B93B', green: '#43A95C', gray: '#8D99AE' } as const;

export function DamageFloatHost() {
  const floats = useUiStore((s) => s.floats);
  return (
    <div className="fixed inset-0 z-[30] pointer-events-none flex items-center justify-center">
      <div className="relative w-0 h-0">
        <AnimatePresence>
          {floats.map((f, i) => (
            <motion.div
              key={f.id}
              className="absolute font-heading font-black text-[44px] tabular-nums whitespace-nowrap"
              style={{
                color: FLOAT_COLOR[f.color],
                WebkitTextStroke: '2px #FFFFFF',
                x: '-50%',
                top: -140 + i * 52,
              }}
              initial={{ y: 20, opacity: 0, scale: 0.8 }}
              animate={{ y: -60, opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            >
              {f.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SkipButton — «تخطي ⏭» أسفل اليسار أثناء الأنيميشنات
// ─────────────────────────────────────────────
export function SkipButton({ show, onSkip }: { show: boolean; onSkip: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          onClick={onSkip}
          className="fixed bottom-6 left-6 z-[35] hud-glass rounded-full px-6 py-2.5 font-heading font-bold text-[18px] text-parchment hover:brightness-125"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
        >
          تخطي ⏭
        </motion.button>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────
// بدائيات الإعدادات — design.md §9.12
// ─────────────────────────────────────────────

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <span className="inline-flex items-center gap-2" dir="ltr">
      <button
        type="button"
        className="w-9 h-9 rounded-lg btn-teal-gradient text-white grid place-items-center border border-teal-900 disabled:opacity-40"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label="إنقاص"
      >
        <Minus size={16} />
      </button>
      <span className="min-w-[64px] text-center font-heading font-black text-[22px] tabular-nums text-ink" dir="rtl">
        {value}
        {suffix && <span className="text-[15px] font-bold text-wood-700"> {suffix}</span>}
      </span>
      <button
        type="button"
        className="w-9 h-9 rounded-lg btn-teal-gradient text-white grid place-items-center border border-teal-900 disabled:opacity-40"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label="زيادة"
      >
        <Plus size={16} />
      </button>
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3"
    >
      <span
        className="relative w-16 h-9 rounded-full border-2 border-wood-700 transition-colors"
        style={{ background: checked ? 'var(--teal-500)' : 'rgba(43,33,24,.2)' }}
      >
        <motion.span
          className="absolute top-[3px] w-6 h-6 rounded-full btn-gold-gradient border border-gold-600"
          animate={{ x: checked ? -34 : -4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </span>
      {label && <span className="font-body font-medium text-[18px] text-ink">{label}</span>}
    </button>
  );
}

export function SliderRow({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <span className="inline-flex items-center gap-3 w-full max-w-[320px]" dir="ltr">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[#E8B93B] h-2"
      />
      <span className="min-w-[56px] text-center font-heading font-black text-[20px] tabular-nums text-ink">
        {format ? format(value) : value}
      </span>
    </span>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1 rounded-xl border-2 border-wood-700 bg-wood-900/10 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            'px-4 py-2 rounded-lg font-heading font-bold text-[17px] transition-colors',
            value === o.value ? 'btn-gold-gradient text-wood-900 shadow-card' : 'text-ink/70 hover:bg-parchment',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function SettingRow({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-wood-700/15 last:border-0">
      <div className="min-w-[200px]">
        <div className="font-body font-bold text-[18px] text-ink">{label}</div>
        {hint && <div className="font-body text-[15px] text-ink/60">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsCard({ title, children, danger = false }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <section
      className={`parchment-panel rounded-panel border-[3px] p-5 shadow-card ${danger ? 'border-danger-500' : 'border-wood-700'}`}
      style={{ boxShadow: `inset 0 0 0 2px ${danger ? 'var(--danger-500)' : 'var(--gold-500)'}, 0 4px 12px rgba(43,33,24,.25)` }}
    >
      <h3 className={`font-heading font-extrabold text-[22px] mb-3 ${danger ? 'text-danger-500' : 'text-wood-700'}`}>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function TextAreaPanel({
  value,
  onChange,
  placeholder,
  rows = 8,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-xl border-2 border-wood-700 bg-parchment/80 p-4 font-body text-[17px] text-ink leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-gold-500"
      dir="rtl"
    />
  );
}

/** زر إغلاق صغير للنوافذ */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="إغلاق"
      className="w-10 h-10 rounded-full hud-glass grid place-items-center text-parchment hover:brightness-125"
    >
      <X size={20} />
    </button>
  );
}
