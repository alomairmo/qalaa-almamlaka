/**
 * DispatchModal — نافذة الإرسال المدمجة (army.md §3 + وثيقة §11).
 * عمودان: معلومات الهدف الكاملة (يمين) + تشكيل الإرسال (يسار).
 * تُفتح عبر armyTarget في جسر المشهد (useSceneBridge) — يضبطه نقر المشهد
 * ثلاثي الأبعاد أو قائمة الأهداف الاحتياطية، وتصفّره النافذة بعد الإرسال/الإلغاء.
 * مكوّن بلا props — يعتمد على useGameStore وجسر المشهد.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TriangleAlert } from 'lucide-react';
import { useGameStore, engineApi } from '@/engine';
import type { ArmyComposition, Rank, Team } from '@/contracts/types';
import { RANK_LABELS, RANK_ORDER, TEAM_COLORS } from '@/contracts/defaults';
import GameButton from '@/components/game/GameButton';
import { useSound } from '@/audio';
import { selectArmyTarget, useSceneBridge } from '@/scene/bridge';
import { resolveGoldPileOwner } from './gold-pile-owner';
import { ModalShell } from './primitives/panels';
import { RankBadge } from './primitives/widgets';

const RANKS: Rank[] = RANK_ORDER;

function rankCounts(soldiers: Array<{ rank: Rank }>): Record<Rank, number> {
  const c: Record<Rank, number> = { novice: 0, soldier: 0, expert: 0 };
  for (const s of soldiers) c[s.rank] += 1;
  return c;
}

/** شريحة مدى «من–إلى» */
function RangeChip({ label, min, max, tone }: { label: string; min: number; max: number; tone: 'teal' | 'gold' | 'danger' }) {
  const cls =
    tone === 'gold'
      ? 'bg-gold-500/25 border-gold-600 text-wood-900'
      : tone === 'danger'
        ? 'bg-danger-500/15 border-danger-500 text-danger-500'
        : 'bg-teal-500/15 border-teal-700 text-teal-700';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-1 font-heading font-bold text-[18px] ${cls}`}>
      {label}: <b className="tabular-nums">{min}–{max}</b>
    </span>
  );
}

/** أسطر الرتب الكبيرة الواضحة: شارة + اسم الرتبة + العدد — سطر لكل رتبة */
function RankLines({ counts }: { counts: Record<Rank, number> }) {
  return (
    <div className="flex flex-col gap-2">
      {RANKS.map((r) => (
        <div key={r} className="flex items-center gap-3 font-heading font-extrabold text-[22px] text-ink">
          <RankBadge rank={r} size={36} />
          <span>{RANK_LABELS[r]}</span>
          <span className="tabular-nums text-[24px]">×{counts[r]}</span>
        </div>
      ))}
    </div>
  );
}

/** كمية الذهب برقم كبير واضح */
function GoldAmount({ amount }: { amount: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <img src="/icon-coin-gold.svg" alt="" className="w-[46px] h-[46px]" />
      <span className="font-heading font-black text-[36px] tabular-nums text-gold-600">{amount}</span>
      <span className="font-heading font-bold text-[20px] text-ink/70">ذهب</span>
    </div>
  );
}

function CastleIntel({ team }: { team: Team }) {
  const combat = useGameStore((s) => s.state.settings.combat);
  // المدافعون عن القلعة هم جنود الداخل — قوتهم هي «القوة المتوقعة» للمعركة
  const defenders = team.soldiers.filter((s) => s.state === 'inside');
  const defMin = defenders.reduce((a, s) => a + combat.rankPowerRanges[s.rank][0], 0);
  const defMax = defenders.reduce((a, s) => a + combat.rankPowerRanges[s.rank][1], 0);
  return (
    <div className="flex flex-col gap-4 font-body text-ink">
      <GoldAmount amount={team.goldInside + team.goldOutside} />
      <RankLines counts={rankCounts(defenders)} />
      <div className="mt-1 text-center">
        <RangeChip label="القوة المتوقعة" min={defMin} max={defMax} tone="danger" />
      </div>
    </div>
  );
}

export default function DispatchModal() {
  const state = useGameStore((s) => s.state);
  const eventQueue = useGameStore((s) => s.eventQueue);
  const target = useSceneBridge((s) => s.armyTarget);
  const closeDispatch = () => selectArmyTarget(null);
  const sound = useSound();
  const [send, setSend] = useState<Record<Rank, number>>({ novice: 0, soldier: 0, expert: 0 });

  // انتهاء العداد/إنهاء الجولة أثناء وضع الجيش: أغلق النافذة تلقائيًا مع الخروج من الوضع
  // (تصفير جسر المشهد نظام خارجي — مسموح داخل effect)
  useEffect(() => {
    if (target && state.phase !== 'army') selectArmyTarget(null);
  }, [state.phase, target]);

  // إعادة ضبط التشكيلة عند تغيّر الهدف (نمط «ضبط الحالة أثناء التصيير» الموصى به)
  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    setSend({ novice: 0, soldier: 0, expert: 0 });
  }

  const me = state.teams[state.turnIndex];
  const available = useMemo(() => (me ? me.soldiers.filter((s) => s.state !== 'convoy') : []), [me]);
  const owned = rankCounts(available);

  const combat = state.settings.combat;
  const sentTotal = send.novice + send.soldier + send.expert;
  const remaining = available.length - sentTotal;
  const powMin = RANKS.reduce((a, r) => a + send[r] * combat.rankPowerRanges[r][0], 0);
  const powMax = RANKS.reduce((a, r) => a + send[r] * combat.rankPowerRanges[r][1], 0);

  const execute = () => {
    if (!target || sentTotal === 0) return;
    const composition: ArmyComposition = { ...send };
    engineApi.dispatchArmy(target, composition);
    setSend({ novice: 0, soldier: 0, expert: 0 });
    closeDispatch();
  };

  const cancel = () => {
    sound.click();
    setSend({ novice: 0, soldier: 0, expert: 0 });
    closeDispatch();
  };

  // ── جانب معلومات الهدف ──
  let intelTitle = '';
  let intelColor = '#17A2A0';
  let intelBody: React.ReactNode = null;
  if (target?.kind === 'castle') {
    const t = state.teams.find((x) => x.id === target.teamId);
    if (t) {
      intelTitle = `قلعة ${t.name}`;
      intelColor = TEAM_COLORS[t.color];
      intelBody = <CastleIntel team={t} />;
    }
  } else if (target?.kind === 'convoy') {
    const c = state.convoys.find((x) => x.id === target.convoyId);
    if (c) {
      const owner = state.teams.find((x) => x.id === c.teamId);
      intelTitle = `قافلة ${owner?.name ?? ''} العائدة`;
      intelColor = owner ? TEAM_COLORS[owner.color] : '#17A2A0';
      const third = Math.min(2, Math.floor(c.progress * 3));
      const thirdLabel = ['الأول', 'الثاني', 'الثالث'][third];
      const convoyMin = c.soldiers.reduce((a, s) => a + state.settings.combat.rankPowerRanges[s.rank][0], 0);
      const convoyMax = c.soldiers.reduce((a, s) => a + state.settings.combat.rankPowerRanges[s.rank][1], 0);
      intelBody = (
        <div className="flex flex-col gap-4 font-body text-ink">
          <GoldAmount amount={c.goldCarried} />
          <RankLines counts={rankCounts(c.soldiers)} />
          <div className="text-center text-[16px] text-ink/70">📍 في الثلث {thirdLabel} من الطريق</div>
          <div className="text-center">
            <RangeChip label="القوة المتوقعة" min={convoyMin} max={convoyMax} tone="danger" />
          </div>
        </div>
      );
    }
  } else if (target?.kind === 'gold-pile') {
    const p = state.piles.find((x) => x.id === target.pileId);
    if (p) {
      // مالك/مصدر الكومة: خارجية → فريقها، ساقطة → قافلة المصدر إن عُرفت من الأحداث
      const ownerInfo = resolveGoldPileOwner(state, eventQueue, p);
      const ownerTeam = ownerInfo.team;
      intelTitle = p.kind === 'dropped' ? 'كومة ذهب ساقطة' : 'كومة ذهب مكشوفة';
      if (ownerTeam) intelColor = TEAM_COLORS[ownerTeam.color];
      intelBody = (
        <div className="flex flex-col gap-2.5 font-body text-[18px] text-ink items-center text-center">
          <img src="/icon-coin-gold.svg" alt="" className="w-[72px] h-[72px]" />
          <div className="font-heading font-black text-[34px] tabular-nums text-gold-600">{p.amount} ذهب</div>
          {ownerTeam && (
            <div className="inline-flex items-center gap-2 font-heading font-bold text-[19px]">
              <span
                aria-hidden
                className="inline-block w-4 h-4 rounded-full border border-wood-900/40 shrink-0"
                style={{ background: TEAM_COLORS[ownerTeam.color] }}
              />
              {p.kind === 'dropped' ? `كانت مع قافلة ${ownerTeam.name}` : `ذهب ${ownerTeam.name}`}
            </div>
          )}
          {p.kind === 'dropped' && !ownerTeam && (
            <div className="font-heading font-bold text-[19px] text-ink/80">ذهب ساقط على الطريق — لا مالك له</div>
          )}
          <div className="text-[17px] text-ink/70">سرقة بلا قتال — فقط أرسلوا من يحملها</div>
        </div>
      );
    }
  }

  return (
    <ModalShell open={target !== null} onClose={cancel} maxWidth={1100}>
      <div className="flex flex-col max-h-[80vh] min-h-0">
        {/* الرأس بلون الهدف */}
        <div
          className="pt-8 pb-3 px-8 text-center font-heading font-extrabold text-[26px] border-b-2 border-gold-500/60"
          style={{ color: intelColor }}
        >
          {intelTitle}
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-6 p-6 overflow-y-auto">
          {/* يمين (أولًا في RTL): معلومات الهدف */}
          <motion.section
            className="rounded-xl border-2 border-wood-700/40 bg-parchment/70 p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h3 className="font-heading font-extrabold text-[22px] text-wood-700 mb-4">معلومات الهدف</h3>
            {intelBody}
          </motion.section>

          {/* يسار: تشكيل الإرسال */}
          <motion.section
            className="rounded-xl border-2 border-wood-700/40 bg-parchment/70 p-5 flex flex-col gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
          >
            <h3 className="font-heading font-extrabold text-[22px] text-wood-700">تشكيل الإرسال</h3>
            {RANKS.map((r) => (
              <div key={r} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-heading font-bold text-[18px] text-ink">
                  <RankBadge rank={r} size={34} />
                  {RANK_LABELS[r]} <span className="text-ink/60 tabular-nums">(تملك {owned[r]})</span>
                </span>
                <span className="flex items-center gap-2" dir="ltr">
                  <button
                    type="button"
                    className="w-9 h-9 rounded-lg btn-teal-gradient text-white text-[20px] font-black border border-teal-900 disabled:opacity-40"
                    disabled={send[r] <= 0}
                    onClick={() => {
                      sound.click();
                      setSend((s) => ({ ...s, [r]: s[r] - 1 }));
                    }}
                  >
                    −
                  </button>
                  <motion.span
                    key={send[r]}
                    className="w-[44px] text-center font-heading font-black text-[24px] tabular-nums text-gold-600"
                    initial={{ scale: 1.25 }}
                    animate={{ scale: 1 }}
                  >
                    {send[r]}
                  </motion.span>
                  <button
                    type="button"
                    className="w-9 h-9 rounded-lg btn-teal-gradient text-white text-[20px] font-black border border-teal-900 disabled:opacity-40"
                    disabled={send[r] >= owned[r]}
                    onClick={() => {
                      sound.click();
                      setSend((s) => ({ ...s, [r]: s[r] + 1 }));
                    }}
                  >
                    +
                  </button>
                </span>
              </div>
            ))}

            <div className="flex justify-between font-heading font-black text-[22px] text-ink tabular-nums border-t-2 border-wood-700/20 pt-3">
              <span>مُرسَل: {sentTotal}</span>
              <span>متبقٍ: {remaining}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <RangeChip label="القوة المتوقعة" min={powMin} max={powMax} tone="teal" />
              <RangeChip label="سيحملون ذهبًا" min={powMin} max={powMax} tone="gold" />
            </div>

            {/* التحذير الأحمر عند ترك القلعة شبه خالية */}
            {sentTotal > 0 && remaining <= 1 && (
              <motion.div
                className="flex items-center gap-2 rounded-xl border-2 border-danger-500 bg-danger-500/10 px-4 py-2 font-heading font-bold text-[18px] text-danger-500"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <TriangleAlert size={22} />
                {remaining === 0 ? '⚠️ قلعتك ستبقى بلا أي دفاع!' : '⚠️ قلعتك ستدافع بجندي واحد فقط!'}
              </motion.div>
            )}

            <div className="flex gap-3 mt-auto pt-3">
              <GameButton
                label="⚔️ تنفيذ"
                variant="gold"
                size="md"
                className="flex-1"
                disabled={sentTotal === 0}
                onClick={execute}
              />
              <GameButton label="إلغاء" variant="ghost-parchment" size="md" className="!text-ink border-wood-700/50" onClick={cancel} />
            </div>
          </motion.section>
        </div>
      </div>
    </ModalShell>
  );
}
