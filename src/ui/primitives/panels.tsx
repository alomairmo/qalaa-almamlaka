/**
 * لوحات وأطر مشتركة — design.md §9 (WoodPanel, ModalShell, ReportCard, ConfirmDialog).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const SPRING = { type: 'spring', stiffness: 320, damping: 22 } as const;

// ─────────────────────────────────────────────
// WoodPanel — الحاوية الأساسية (رق أو زجاج ليلي)
// ─────────────────────────────────────────────
export function WoodPanel({
  children,
  variant = 'parchment',
  arch = false,
  className = '',
  style,
}: {
  children: ReactNode;
  variant?: 'parchment' | 'glass';
  arch?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={[
        'relative rounded-panel border-[3px] border-wood-700 shadow-modal',
        variant === 'parchment' ? 'parchment-panel' : 'hud-glass',
        className,
      ].join(' ')}
      style={{
        boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 12px 32px rgba(43,33,24,.35)',
        ...(arch
          ? { borderRadius: '160px 160px 16px 16px / 96px 96px 16px 16px' }
          : undefined),
        ...style,
      }}
    >
      {arch && (
        <div className="absolute top-0 inset-x-8 h-[20px] zellige-strip rounded-b-lg opacity-90" aria-hidden />
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// ModalShell — نافذة مقوّسة فوق خلفية معتمة (z-40)
// ─────────────────────────────────────────────
export function ModalShell({
  open,
  onClose,
  children,
  maxWidth = 1100,
  allowBackdropClose = true,
  zIndex = 40,
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  maxWidth?: number;
  allowBackdropClose?: boolean;
  zIndex?: number;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center p-6"
          style={{ zIndex, background: 'rgba(11,62,67,.55)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => {
            if (allowBackdropClose) onClose?.();
          }}
        >
          <motion.div
            className="w-full max-h-[88vh] flex flex-col"
            style={{ maxWidth }}
            initial={{ scale: 0.85, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 30, opacity: 0 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
          >
            <WoodPanel arch className="flex flex-col min-h-0 overflow-hidden">
              {children}
            </WoodPanel>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────
// ReportCard — بطاقة تقرير مركزية (punch-in → hold → up-fade) §7
// ─────────────────────────────────────────────
export function ReportCard({
  show,
  big,
  label,
  icon,
  accent = 'gold',
}: {
  show: boolean;
  big: string;
  label: string;
  icon?: ReactNode;
  accent?: 'gold' | 'danger' | 'teal' | 'success';
}) {
  const accentColor =
    accent === 'danger'
      ? 'var(--danger-500)'
      : accent === 'teal'
        ? 'var(--teal-500)'
        : accent === 'success'
          ? 'var(--success-500)'
          : 'var(--gold-500)';
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[30] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -40 }}
        >
          <motion.div
            className="parchment-panel rounded-panel border-[3px] border-wood-700 px-12 py-8 text-center shadow-screen"
            style={{ boxShadow: `inset 0 0 0 3px ${accentColor}, 0 24px 64px rgba(11,62,67,.5)` }}
            initial={{ scale: 1.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {icon && <div className="flex justify-center mb-2">{icon}</div>}
            <div className="font-heading font-black text-[56px] leading-none tabular-nums" style={{ color: accentColor }}>
              {big}
            </div>
            <div className="font-heading font-extrabold text-[24px] text-ink mt-2">{label}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────
// ConfirmDialog — تأكيد خطير بضغطة مطوّلة 1.5ث (z-70)
// ─────────────────────────────────────────────
export function ConfirmDialog({
  open,
  title,
  warning,
  confirmLabel = 'تأكيد (اضغط مطوّلًا)',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  warning: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopHold = () => {
    setHolding(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const startHold = () => {
    setHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      onConfirm();
    }, 1500);
  };
  useEffect(() => stopHold, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center"
          style={{ background: 'rgba(11,62,67,.55)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            stopHold();
            onCancel();
          }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            className="parchment-panel w-[560px] max-w-[92vw] rounded-panel border-[3px] border-danger-500 p-8 text-center shadow-modal"
            style={{ boxShadow: 'inset 0 0 0 2px var(--danger-500), 0 12px 32px rgba(43,33,24,.35)' }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-heading font-extrabold text-[30px] text-danger-500 mb-3">{title}</h2>
            <p className="font-body text-[20px] text-ink leading-relaxed mb-6">{warning}</p>
            <div className="flex gap-4 justify-center">
              <motion.button
                type="button"
                className="relative overflow-hidden h-[56px] px-8 rounded-btn bg-danger-500 text-white font-heading font-extrabold text-[20px] border-2 border-red-900 shadow-card"
                onPointerDown={startHold}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                whileTap={{ scale: 0.96 }}
              >
                <span
                  className="absolute inset-y-0 start-0 bg-red-900/50"
                  style={{
                    width: holding ? '100%' : '0%',
                    transition: holding ? 'width 1.5s linear' : 'width 0.15s ease-out',
                  }}
                />
                <span className="relative">{confirmLabel}</span>
              </motion.button>
              <button
                type="button"
                onClick={onCancel}
                className="h-[56px] px-8 rounded-btn btn-teal-gradient text-white font-heading font-extrabold text-[20px] border-2 border-teal-900 shadow-card"
              >
                تراجع
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
