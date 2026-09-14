/**
 * TurnInfoPanel — لوحة الموارد التفصيلية الدائمة للمجموعة صاحبة الدور.
 * تُثبَّت في العمود الأيسر (الجهة المقابلة للأزرار) طوال أطوار التصرف/
 * المنجنيق/الجيش، وتختفي مؤقتًا عند عرض بطاقة ثابتة في العمود نفسه
 * (تقرأ ui-store.stickyCard الذي يضبطه EventLayer). تُحدَّث حيًا من المتجر.
 *
 * جسم اللوحة (ذهب/حجارة/جنود) في TeamResources — يُعاد استخدامه أيضًا في
 * مربع التحويم تحت بطاقات الشريط العلوي. القاعدة: أرقام خارج القلعة بالأحمر.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/engine';
import { useUiStore } from '../ui-store';
import { TeamResources } from './TeamResources';

/** الأطوار التي تظهر فيها اللوحة */
const PANEL_PHASES = ['action', 'catapult', 'army'];

export function TurnInfoPanel() {
  const phase = useGameStore((s) => s.state.phase);
  const team = useGameStore((s) => s.state.teams[s.state.turnIndex]);
  // تختفي اللوحة بينما بطاقة ثابتة تشغل العمود الأيسر (يضبطها EventLayer)
  const stickyCard = useUiStore((s) => s.stickyCard);

  const show = PANEL_PHASES.includes(phase) && !!team && !stickyCard;

  return (
    <AnimatePresence>
      {show && team && (
        <motion.div
          className="fixed left-4 top-1/2 -translate-y-1/2 z-[20] w-[280px] max-w-[92vw] max-h-[86vh] overflow-y-auto hud-glass rounded-panel p-3 text-parchment"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          data-highlight="turn-info-panel"
        >
          <TeamResources team={team} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
