/**
 * نافذة إرسال الجيش (DispatchModal) — battles-convoys.md §3 / الوثيقة §11.
 * تعرض الهدف المختار (من جسر المشهد) + أقراص الجنود المتاحين حسب الرتبة
 * بأرقام قوتهم المعلنة، واختيار العدد من كل رتبة، ثم تأكيد الإرسال.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { engineApi, useGameStore } from '@/engine';
import type { ArmyComposition, Rank } from '@/contracts/types';
import { RANK_LABELS, RANK_ORDER, TEAM_COLORS } from '@/contracts/defaults';
import { useSound } from '@/audio';
import { selectArmyTarget, useSceneBridge } from '@/scene/bridge';
import GameButton from '@/components/game/GameButton';
import { useUiStore } from './ui-store';
import { GameModal, TargetChip } from './primitives/panels';
import { RankBadge } from './primitives/widgets';

const RANK_ART: Record<Rank, string> = {
  novice: '/soldier-novice.png',
  soldier: '/soldier-regular.png',
  expert: '/soldier-expert.png',
};

export default function DispatchModal() {
  const state = useGameStore((s) => s.state);
  const sound = useSound();
  const target = useSceneBridge((s) => s.armyTarget);
  const addToast = useUiStore((s) => s.addToast);
  const [counts, setCounts] = useState<ArmyComposition>({ novice: 0, soldier: 0, expert: 0 });

  const team = state.teams[state.turnIndex];
  const open = state.phase === 'army' && target !== null && !!team;

  // تفاصيل الهدف للعرض
  const targetInfo = useMemo(() => {
    if (!target) return null;
    switch (target.kind) {
      case 'castle': {
        const t = state.teams.find((x) => x.id === target.teamId);
        return t
          ? { title: `غزو قلعة ${t.name}`, desc: 'ستواجه الجنود داخل القلعة فقط', color: TEAM_COLORS[t.color] }
          : null;
      }
      case 'convoy': {
        const c = state.convoys.find((x) => x.id === target.convoyId);
        const owner = c && state.teams.find((x) => x.id === c.teamId);
        return c
          ? { title: `اعتراض قافلة ${owner?.name ?? ''}`, desc: `تحمل ${c.goldCarried} ذهب — جنودها يدافعون`, color: '#E8B93B' }
          : null;
      }
      case 'gold-pile': {
        const p = state.piles.find((x) => x.id === target.pileId);
        return p
          ? { title: 'التقاط ذهب مكشوف', desc: `${p.amount} ذهب — بلا قتال`, color: '#E8B93B' }
          : null;
      }
    }
  }, [target, state]);

  // المتاح من كل رتبة (ليسوا في قوافل) + القوة المعلنة للرتبة
  const available = useMemo(() => {
    const byRank: Record<Rank, number> = { novice: 0, soldier: 0, expert: 0 };
    if (!team) return byRank;
    for (const s of team.soldiers) if (s.state !== 'convoy') byRank[s.rank]++;
    return byRank;
  }, [team]);
  const combat = state.settings.combat;

  // تصفير الاختيار عند فتح هدف جديد
  useEffect(() => {
    if (open) setCounts({ novice: 0, soldier: 0, expert: 0 });
  }, [open, target]);

  if (!team) return null;
  const total = counts.novice + counts.soldier + counts.expert;

  const confirm = () => {
    if (!target || total === 0) return;
    const events = engineApi.dispatchArmy(target, counts);
    if (events.length === 0) {
      addToast('تعذّر الإرسال — تحقّق من الهدف والقوات', 'danger');
    } else {
      sound.swords();
    }
    selectArmyTarget(null);
  };

  return (
    <GameModal open={open} onClose={() => selectArmyTarget(null)} title="إرسال الجيش ⚔️" width={640}>
      <div className="flex flex-col gap-4">
        {/* الهدف */}
        {targetInfo && (
          <div className="flex justify-center">
            <TargetChip label={targetInfo.title} sub={targetInfo.desc} color={targetInfo.color} />
          </div>
        )}

        {/* أقراص الرتب */}
        <div className="grid grid-cols-3 gap-3">
          {RANK_ORDER.map((rank) => {
            const count = available[rank];
            const chosen = counts[rank];
            const [pMin, pMax] = combat.rankPowerRanges[rank];
            return (
              <div
                key={rank}
                className="parchment-panel rounded-panel border-[3px] border-wood-700 p-3 flex flex-col items-center gap-1.5"
                style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 4px 12px rgba(43,33,24,.25)' }}
              >
                <div className="relative">
                  <img src={RANK_ART[rank]} alt={RANK_LABELS[rank]} className="w-[72px] h-[72px] object-contain" />
                  <span className="absolute -top-1 -end-1">
                    <RankBadge rank={rank} size={26} />
                  </span>
                </div>
                <span className="font-heading font-bold text-[17px] text-ink">{RANK_LABELS[rank]}</span>
                <span className="font-body text-[14px] text-ink/70">
                  قوة {pMin}–{pMax} · متاح {count}
                </span>
                <div className="flex items-center gap-2" dir="ltr">
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg btn-teal-gradient text-white font-black disabled:opacity-40"
                    disabled={chosen <= 0}
                    onClick={() => setCounts((c) => ({ ...c, [rank]: c[rank] - 1 }))}
                  >
                    −
                  </button>
                  <span className="font-heading font-black text-[22px] tabular-nums text-ink w-[28px] text-center">
                    {chosen}
                  </span>
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg btn-teal-gradient text-white font-black disabled:opacity-40"
                    disabled={chosen >= count}
                    onClick={() => setCounts((c) => ({ ...c, [rank]: c[rank] + 1 }))}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* مهمات تذكيرية */}
        <ul className="font-body text-[15px] text-ink/70 list-disc ps-5 leading-relaxed">
          <li>المرسَلون يغيبون عن الدفاع حتى عودتهم في قافلة (ثلث الطريق كل جولة).</li>
          <li>كل ناجٍ منتصر يحمل ذهبًا بمقدار قوته، ويترقّى عند الوصول.</li>
          <li>التعادل = فشل الغزو، والمهاجمون الخاسرون يُفنَون جميعًا.</li>
        </ul>

        <div className="flex gap-3">
          <GameButton
            label={`إرسال (${total} جندي) 🚀`}
            variant="danger"
            size="lg"
            className="flex-1"
            disabled={total === 0}
            onClick={confirm}
          />
          <GameButton label="إلغاء" variant="teal" size="lg" onClick={() => selectArmyTarget(null)} />
        </div>
      </div>
      <AnimatePresence />
    </GameModal>
  );
}
