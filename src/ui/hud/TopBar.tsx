/**
 * الشريط العلوي — game-map.md §2.
 * يمين: اسم الموسم + أسبوع/جولة. وسط: رايات الفرق بذهبها الكلي (النشط يتوهج).
 * يسار: زر «الأسبوع المرتبط 📊». z-20 فوق المشهد دون حجب مركزه.
 */
import { motion } from 'framer-motion';
import { useGameStore } from '@/engine';
import { TEAM_COLORS } from '@/contracts/defaults';
import { teamTotalGold } from '@/engine';

import { assetUrl } from '@/asset-base';

export function TopBar() {
  const state = useGameStore((s) => s.state);
  const totals = state.teams.map((t) => teamTotalGold(state, t.id));
  const leaderTotal = Math.max(...totals, 0);

  return (
    <header className="fixed top-0 inset-x-0 z-20 flex items-start justify-between gap-3 px-4 pt-2 pointer-events-none">
      {/* يمين الشاشة (بداية في RTL): اسم الموسم + الجولة */}
      <div className="hud-glass rounded-panel px-4 py-2 pointer-events-auto">
        <div className="font-heading font-extrabold text-[18px] text-gold-300 leading-tight">
          {state.settings.season.name || 'قلاع المملكة'}
        </div>
        <div className="font-body text-[14px] text-parchment/80">
          الجولة {state.roundNumber} · دور {state.teams[state.turnIndex]?.name ?? ''}
        </div>
      </div>

      {/* الوسط: رايات الفرق وذهبها */}
      <div className="flex items-start gap-2">
        {state.teams.map((t, i) => {
          const active = i === state.turnIndex;
          const total = totals[i];
          const leader = total > 0 && total === leaderTotal;
          return (
            <motion.div
              key={t.id}
              className="hud-glass rounded-panel px-3 py-1.5 flex flex-col items-center min-w-[86px]"
              style={{
                boxShadow: active ? `0 0 0 2px ${TEAM_COLORS[t.color]}, 0 0 18px ${TEAM_COLORS[t.color]}88` : undefined,
              }}
              animate={active ? { y: [0, -3, 0] } : { y: 0 }}
              transition={active ? { duration: 1.6, repeat: Infinity } : { duration: 0.2 }}
            >
              <img
                src={assetUrl(`/banner-team-${Math.min(i + 1, 4)}.svg`)}
                alt=""
                className="w-[22px] h-[33px]"
                style={{ filter: active ? 'none' : 'saturate(.7)' }}
              />
              <span className="font-heading font-bold text-[13px]" style={{ color: TEAM_COLORS[t.color] }}>
                {t.name}
              </span>
              <span className="font-heading font-black text-[16px] tabular-nums text-parchment flex items-center gap-1">
                {leader && '👑'}
                {total}
                <img src={assetUrl('/icon-coin-gold.svg')} alt="" className="w-[15px] h-[15px]" />
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* يسار الشاشة: عنصر نائب «الأسبوع المرتبط» (يُفعَّل مع ربط Supabase) */}
      <button
        type="button"
        className="hud-glass rounded-full px-4 py-2 font-heading font-bold text-[15px] text-parchment/80 pointer-events-auto opacity-70"
        title="يعرض تقدّم الأسبوع الدراسي المرتبط بعد تفعيل المزامنة السحابية (الإعدادات ← عام)"
      >
        الأسبوع المرتبط 📊
      </button>
    </header>
  );
}
