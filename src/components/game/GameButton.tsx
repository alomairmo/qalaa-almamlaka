/**
 * GameButton — زر اللعبة الموحّد (design.md §9.2).
 * أحجام: hero (72px) / side (96px) / md (52px) / sm (40px).
 * أنماط: gold / teal / danger / ghost-parchment / disabled.
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export type GameButtonVariant = 'gold' | 'teal' | 'danger' | 'ghost-parchment';
export type GameButtonSize = 'hero' | 'side' | 'md' | 'sm';

interface GameButtonProps {
  label: string;
  icon?: ReactNode;
  /** سطر توضيحي صغير داخل الزر (hero فقط عادةً) */
  caption?: string;
  variant?: GameButtonVariant;
  size?: GameButtonSize;
  disabled?: boolean;
  /** تلميح يظهر عند التحويم (للأزرار المعطلة مثلًا) */
  title?: string;
  /** شريحة الكلفة المثبتة على الحافة الداخلية (مثل: −5 حجارة) */
  costChip?: ReactNode;
  onClick?: () => void;
  className?: string;
}

const sizeClasses: Record<GameButtonSize, string> = {
  hero: 'h-[72px] px-6 text-[28px] rounded-btn',
  side: 'h-[96px] px-5 text-[24px] rounded-btn',
  md: 'h-[52px] px-5 text-[20px] rounded-btn',
  sm: 'h-[40px] px-4 text-[18px] rounded-btn',
};

const variantClasses: Record<GameButtonVariant, string> = {
  gold: 'btn-gold-gradient text-wood-900 border-2 border-gold-600',
  teal: 'btn-teal-gradient text-white border-2 border-teal-900',
  danger: 'bg-danger-500 text-white border-2 border-red-900',
  'ghost-parchment':
    'bg-parchment/15 text-parchment border-2 border-parchment/50 hover:bg-parchment/25',
};

export default function GameButton({
  label,
  icon,
  caption,
  variant = 'gold',
  size = 'md',
  disabled = false,
  title,
  costChip,
  onClick,
  className = '',
}: GameButtonProps) {
  return (
    <motion.button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { y: -4 }}
      whileTap={disabled ? { x: [0, -4, 4, -2, 0] } : { scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className={[
        'relative font-heading font-extrabold flex items-center justify-center gap-3',
        'shadow-card select-none',
        sizeClasses[size],
        variantClasses[variant],
        disabled ? 'grayscale opacity-60 !cursor-not-allowed saturate-[0.45]' : '',
        className,
      ].join(' ')}
    >
      {/* شريحة الكلفة على الحافة الداخلية */}
      {costChip && (
        <span className="absolute start-2 top-1/2 -translate-y-1/2">{costChip}</span>
      )}
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      <span className="flex flex-col items-center leading-tight">
        <span>{label}</span>
        {caption && (
          <span className="font-body font-normal text-[16px] opacity-70">{caption}</span>
        )}
      </span>
    </motion.button>
  );
}
