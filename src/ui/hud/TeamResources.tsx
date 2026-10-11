/**
 * TeamResources — لوحة الموارد التفصيلية لصاحب الدور (game-map.md §3).
 * بطاقة واحدة في العمود الأيسر تفصّل الذهب داخل/خارج مع أيقونات، الحجارة،
 * الجنود (عدد + وسامات الرتب)، الطوابق، وحالة القلعة (صحة القاعدة والطوابق).
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/engine';
import { TEAM_COLORS } from '@/contracts/defaults';
import { useUiStore } from '../ui-store';
import { RankBadge } from '../primitives/widgets';

import { assetUrl } from '@/asset-base';

/** سطر مورد بأيقونة وقيمة كبيرة واضحة */
function ResourceRow({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={icon} alt="" className="w-[30px] h-[30px] shrink-0" />
      <span className="font-body font-bold text-[16px] text-ink/80">{label}</span>
      <span className="ms-auto font-heading font-black text-[22px] tabular-nums text-ink flex items-center gap-2">
        {value}
      </span>
      {sub && <div className="basis-full text-[13px] text-ink/60 -mt-1">{sub}</div>}
    </div>
  );
}

export function TeamResources() {
  const state = useGameStore((s) => s.state);
  const stickyCard = useUiStore((s) => s.stickyCard);
  const phase = state.phase;
  const team = state.teams[state.turnIndex];
  // تُعرض فقط في أطوار اللعب الفعلية (idle/action)، وتختفي خلف البطاقات الثابتة
  if (!team || (phase !== 'idle' && phase !== 'action')) return null;
  if (stickyCard) return null;

  const color = TEAM_COLORS[team.color];
  const ranks = { novice: 0, soldier: 0, expert: 0 };
  for (const s of team.soldiers) ranks[s.rank] += 1;
  const castleHpPct = Math.round((team.castle.baseHp / team.castle.baseMaxHp) * 100);

  return (
    <AnimatePresence>
      <motion.aside
        className="fixed start-3 top-[104px] z-20 w-[300px] parchment-panel rounded-panel border-[3px] border-wood-700 p-4 shadow-card"
        style={{ boxShadow: `inset 0 0 0 2px ${color}, 0 4px 12px rgba(43,33,24,.25)` }}
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -40, opacity: 0 }}
      >
        <h3 className="font-heading font-extrabold text-[19px] mb-3" style={{ color }}>
          موارد {team.name}
        </h3>
        <div className="flex flex-col gap-2.5">
          <ResourceRow
            icon={assetUrl('/icon-coin-gold.svg')}
            label="الذهب"
            value={
              <>
                <span title="داخل القلعة (آمن)">🏰 {team.goldInside}</span>
                <span className="text-ink/40">|</span>
                <span title="خارج القلعة (للإنفاق)" className="text-gold-600">⛺ {team.goldOutside}</span>
              </>
            }
            sub="داخل آمن من السرقة · خارج قابل للإنفاق والسرقة"
          />
          <ResourceRow icon={assetUrl('/icon-stone.svg')} label="الحجارة" value={team.stonesOutside} />
          <ResourceRow
            icon={assetUrl('/icon-soldier.svg')}
            label="الجنود"
            value={
              <>
                {team.soldiers.length}
                <span className="flex gap-1">
                  {ranks.novice > 0 && <RankBadge rank="novice" size={22} />}
                  {ranks.soldier > 0 && <RankBadge rank="soldier" size={22} />}
                  {ranks.expert > 0 && <RankBadge rank="expert" size={22} />}
                </span>
              </>
            }
          />
          <ResourceRow icon={assetUrl('/icon-build-floor.svg')} label="الطوابق" value={team.castle.floors.length} />
          <ResourceRow
            icon={assetUrl('/icon-repair-hammer.svg')}
            label="صحة القاعدة"
            value={
              <span className={castleHpPct < 50 ? 'text-danger-500' : ''}>
                {team.castle.baseHp}/{team.castle.baseMaxHp}
              </span>
            }
            sub={
              team.castle.floors.some((f) => f.hp < f.maxHp)
                ? '⚠ يوجد طابق مصاب — استخدموا «إصلاح ضرر»'
                : undefined
            }
          />
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
