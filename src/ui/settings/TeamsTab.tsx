/**
 * تبويب ② بيانات المجموعات — منحة المعلم وجزاؤه (settings.md §3 + وثيقة §15).
 * بطاقة لكل مجموعة: زيادة/خصم أي بند + «تأكيد» يستدعي engineApi.applyTeacherAdjustment.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore, engineApi } from '@/engine';
import type { TeamAdjustment, TeamId } from '@/contracts/types';
import { TEAM_COLORS } from '@/contracts/defaults';
import GameButton from '@/components/game/GameButton';
import { useSound } from '@/audio';

type Field = keyof TeamAdjustment;
const FIELDS: Array<{ key: Field; label: string; icon: string }> = [
  { key: 'gold', label: 'ذهب', icon: '/icon-coin-gold.svg' },
  { key: 'stones', label: 'حجارة', icon: '/icon-stone.svg' },
  { key: 'soldiers', label: 'جنود', icon: '/icon-soldier.svg' },
  { key: 'floors', label: 'طوابق', icon: '/icon-build-floor.svg' },
];

function TeamAdjustCard({ index }: { index: number }) {
  const team = useGameStore((s) => s.state.teams[index]);
  const sound = useSound();
  const [delta, setDelta] = useState<TeamAdjustment>({});
  if (!team) return null;
  const color = TEAM_COLORS[team.color];

  const currentValue = (f: Field): number => {
    switch (f) {
      case 'gold':
        return team.goldInside + team.goldOutside;
      case 'stones':
        return team.stonesOutside;
      case 'soldiers':
        return team.soldiers.length;
      case 'floors':
        return team.castle.floors.length;
    }
  };

  const bump = (f: Field, by: number) => {
    sound.click();
    setDelta((d) => {
      const next = (d[f] ?? 0) + by;
      const cur = currentValue(f);
      const clamped = Math.max(-cur, next); // لا خصم أكثر من الموجود
      const nd = { ...d, [f]: clamped };
      if (clamped === 0) delete nd[f];
      return nd;
    });
  };

  /** كتابة الرقم مباشرة: القيمة المطلقة الجديدة تُحوَّل إلى فرق (delta) */
  const setAbsolute = (f: Field, raw: string) => {
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const cur = currentValue(f);
    setDelta((d) => {
      const diff = parsed - cur;
      const nd = { ...d, [f]: diff };
      if (diff === 0) delete nd[f];
      return nd;
    });
  };

  const hasDelta = Object.keys(delta).length > 0;
  const summary = FIELDS.filter((f) => delta[f.key])
    .map((f) => `${delta[f.key]! > 0 ? '+' : ''}${delta[f.key]} ${f.label}`)
    .join('، ');

  const confirm = () => {
    engineApi.applyTeacherAdjustment(team.id as TeamId, delta);
    setDelta({});
  };

  return (
    <motion.div
      className="parchment-panel rounded-panel border-[3px] border-wood-700 p-5 shadow-card"
      style={{ boxShadow: `inset 0 0 0 2px ${color}, 0 4px 12px rgba(43,33,24,.25)` }}
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: index * 0.07 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <img src={`/banner-team-${Math.min(index + 1, 4)}.svg`} alt="" className="w-[30px] h-[45px]" />
        <h3 className="font-heading font-extrabold text-[22px]" style={{ color }}>
          {team.name}
        </h3>
      </div>
      <div className="flex flex-col gap-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-body font-bold text-[17px] text-ink">
              <img src={f.icon} alt="" className="w-[22px] h-[22px]" />
              {f.label}
              <input
                type="number"
                min={0}
                dir="ltr"
                value={currentValue(f.key) + (delta[f.key] ?? 0)}
                onChange={(e) => setAbsolute(f.key, e.target.value)}
                className="w-[72px] rounded-lg border-2 border-wood-700/40 bg-parchment px-2 py-0.5 text-center font-heading font-bold tabular-nums text-[20px] text-ink focus:border-teal-700 focus:outline-none"
                aria-label={`قيمة ${f.label}`}
              />
              {delta[f.key] !== undefined && (
                <b className={`font-heading tabular-nums text-[18px] ${delta[f.key]! > 0 ? 'text-success-500' : 'text-danger-500'}`}>
                  ({delta[f.key]! > 0 ? '+' : ''}{delta[f.key]})
                </b>
              )}
            </span>
            <span className="flex items-center gap-1.5" dir="ltr">
              <button
                type="button"
                className="w-9 h-9 rounded-lg bg-danger-500 text-white text-[19px] font-black border border-red-900"
                onClick={() => bump(f.key, f.key === 'gold' ? -5 : -1)}
              >
                −
              </button>
              <button
                type="button"
                className="w-9 h-9 rounded-lg btn-teal-gradient text-white text-[19px] font-black border border-teal-900"
                onClick={() => bump(f.key, f.key === 'gold' ? 5 : 1)}
              >
                +
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4 pt-3 border-t-2 border-wood-700/15">
        <motion.div whileTap={{ scale: 0.94 }} animate={hasDelta ? { scale: [1, 1.04, 1] } : undefined} transition={hasDelta ? { duration: 1, repeat: Infinity } : undefined}>
          <GameButton label="تأكيد" variant="gold" size="md" disabled={!hasDelta} onClick={confirm} />
        </motion.div>
        <GameButton label="تراجع" variant="teal" size="sm" disabled={!hasDelta} onClick={() => setDelta({})} />
        {hasDelta && <span className="font-body text-[15px] text-ink/70">التغييرات: {summary}</span>}
      </div>
    </motion.div>
  );
}

export default function TeamsTab() {
  const teamCount = useGameStore((s) => s.state.teams.length);
  return (
    <div className="grid grid-cols-2 gap-5">
      {Array.from({ length: teamCount }, (_, i) => (
        <TeamAdjustCard key={i} index={i} />
      ))}
    </div>
  );
}
