/**
 * TeamResources — جسم لوحة الموارد التفصيلية لأي مجموعة (مستخرج من TurnInfoPanel
 * ليُعاد استخدامه): الذهب (المجموع بدون الطريق + داخل/خارج/في الطريق)، الحجارة،
 * والجنود لكل رتبة (خبير/جندي/مبتدئ: المجموع + داخل/خارج/طريق).
 * القاعدة: كل رقم خارج القلعة (خارج/في الطريق) يُعرض بالأحمر.
 * يُستخدم في لوحة الدور الجانبية وفي مربع التحويم تحت بطاقات الشريط العلوي.
 */
import { useGameStore } from '@/engine';
import type { Rank, Soldier, Team } from '@/contracts/types';
import { RANK_LABELS } from '@/contracts/defaults';
import { RankBadge } from '../primitives/widgets';

/** ترتيب عرض الرتب: الأعلى أولًا */
const RANKS_SHOWN: Rank[] = ['expert', 'soldier', 'novice'];

function rankSplit(soldiers: Soldier[], rank: Rank) {
  const of = soldiers.filter((s) => s.rank === rank);
  return {
    total: of.length,
    inside: of.filter((s) => s.state === 'inside').length,
    outside: of.filter((s) => s.state === 'outside').length,
    convoy: of.filter((s) => s.state === 'convoy').length,
  };
}

function SectionTitle({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-parchment/20 pb-1">
      <span className="flex items-center gap-1.5 font-heading font-extrabold text-[15px] text-gold-300">
        <img src={icon} alt="" className="w-[18px] h-[18px]" />
        {label}
      </span>
      <span className="font-heading font-black text-[17px] text-parchment tabular-nums">{value}</span>
    </div>
  );
}

/** صف فرعي: التسمية + القيمة (حمراء عندما يكون الرقم خارج القلعة) */
function SubRow({ label, value, danger = false }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 ps-3">
      <span className="font-body text-[13px] text-parchment/70">{label}</span>
      <span
        className={`font-heading font-bold text-[14px] tabular-nums ${danger ? 'text-danger-500' : 'text-parchment'}`}
        style={danger ? { textShadow: '0 0 6px rgba(11,62,67,.9)' } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/** كل معلومات مجموعة: ذهب + حجارة + جنود بتقسيم الرتب — محتوى بلا قشرة تموضع */
export function TeamResources({ team }: { team: Team }) {
  const state = useGameStore((s) => s.state);
  // القوافل العائدة لهذه المجموعة (ذهب في الطريق + جنود في الطريق)
  const ownConvoys = state.convoys.filter((c) => c.teamId === team.id);
  const goldOnRoad = ownConvoys.reduce((a, c) => a + c.goldCarried, 0);
  const goldTotal = team.goldInside + team.goldOutside; // باستثناء الموجود في الطريق

  return (
    <div className="flex flex-col gap-2.5">
      <div className="font-heading font-extrabold text-[16px] text-gold-300 text-center border-b border-parchment/20 pb-1.5">
        {team.name}
      </div>

      {/* الذهب */}
      <div className="flex flex-col gap-1">
        <SectionTitle icon="/icon-coin-gold.svg" label="الذهب" value={goldTotal} />
        <SubRow label="داخل القلعة" value={team.goldInside} />
        <SubRow label="خارج القلعة" value={team.goldOutside} danger />
        <SubRow label="في الطريق (قوافل)" value={goldOnRoad} danger />
      </div>

      {/* الحجارة */}
      <div className="flex flex-col gap-1">
        <SectionTitle icon="/icon-stone.svg" label="الحجارة" value={team.stonesOutside} />
      </div>

      {/* الجنود: المجموع ثم كل رتبة بتقسيم داخل/خارج/طريق */}
      <div className="flex flex-col gap-1.5">
        <SectionTitle icon="/icon-soldier.svg" label="الجنود" value={team.soldiers.length} />
        {RANKS_SHOWN.map((r) => {
          const split = rankSplit(team.soldiers, r);
          if (split.total === 0) return null;
          return (
            <div key={r} className="flex flex-col gap-0.5 rounded-lg bg-wood-900/25 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-heading font-bold text-[14px] text-parchment">
                  <RankBadge rank={r} size={20} />
                  {RANK_LABELS[r]}
                </span>
                <span className="font-heading font-black text-[15px] text-parchment tabular-nums">
                  {split.total}
                </span>
              </div>
              <SubRow label="داخل" value={split.inside} />
              <SubRow label="خارج" value={split.outside} danger />
              <SubRow label="في الطريق" value={split.convoy} danger />
            </div>
          );
        })}
        {team.soldiers.length === 0 && (
          <div className="text-parchment/50 text-[13px] text-center">لا جنود بعد — جنّدوا!</div>
        )}
      </div>
    </div>
  );
}
