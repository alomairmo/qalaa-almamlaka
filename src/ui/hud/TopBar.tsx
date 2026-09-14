/**
 * الشريط العلوي: بطاقات المجموعات + لافتة الدور — game-map.md §2 (z-20).
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useGameStore } from '@/engine';
import type { Team } from '@/contracts/types';
import { TEAM_COLORS } from '@/contracts/defaults';
import { useSound } from '@/audio';
import { focusTeamCastle } from '../bridges';
import { TeamResources } from './TeamResources';

/** تأخير إخفاء مربع التحويم (ms) — يمنع الرفرفة عند عبور المؤشر بين البطاقة والمربع */
const HOVER_HIDE_DELAY_MS = 160;

/** رقم متدرّج العد مع وميض لوني عند التغيّر — §7 */
function TweenNumber({ value, flash = '#F5D76E' }: { value: number; flash?: string }) {
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [flashKey, setFlashKey] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      setFlashKey((k) => k + 1);
      prev.current = value;
    }
    const c = animate(mv, value, { duration: 0.5, ease: 'easeOut' });
    return c.stop;
  }, [value, mv]);
  return (
    <motion.span
      key={flashKey}
      className="inline-block tabular-nums"
      initial={flashKey > 0 ? { color: flash, scale: 1.25 } : false}
      animate={{ color: '#F6EED9', scale: 1 }}
      transition={{ duration: 0.6 }}
    >
      {rounded}
    </motion.span>
  );
}

/** بطاقة مجموعة واحدة — نجمة ملونة + ذهب + حجارة + طوابق + جنود، ومربع معلومات كامل عند التحويم */
function TeamCard({ team, active, index }: { team: Team; active: boolean; index: number }) {
  const color = TEAM_COLORS[team.color];
  const sound = useSound();
  const [hover, setHover] = useState(false);
  const hideTimer = useRef<number | null>(null);

  const showPopover = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setHover(true);
  };
  const scheduleHide = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHover(false), HOVER_HIDE_DELAY_MS);
  };
  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <div
      className="relative"
      onMouseEnter={showPopover}
      onMouseLeave={scheduleHide}
      data-highlight={`team-card-${index}`}
    >
    <motion.button
      type="button"
      onClick={() => {
        sound.click();
        focusTeamCastle(index);
      }}
      title="عرض القلعة"
      className="relative flex items-center gap-2.5 rounded-panel px-3 py-2 min-w-[236px] hud-glass"
      style={{
        boxShadow: active
          ? `0 0 0 2px var(--gold-500), 0 0 24px ${color}88, 0 8px 16px rgba(43,33,24,.4)`
          : '0 4px 12px rgba(43,33,24,.25)',
      }}
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: active ? -8 : 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22, delay: index * 0.08 }}
    >
      {/* راية صاحب الدور */}
      {active && (
        <motion.img
          src={`/banner-team-${Math.min(index + 1, 4)}.svg`}
          alt=""
          className="absolute -top-[26px] start-3 w-[20px] h-[30px]"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          style={{ transformOrigin: 'top' }}
        />
      )}
      {/* نجمة الرقم بلون الفريق */}
      <span
        className="relative grid place-items-center w-[44px] h-[44px] shrink-0 font-heading font-black text-[22px] text-white"
        style={{
          background: color,
          clipPath:
            'polygon(50% 0%, 61% 18%, 82% 11%, 82% 33%, 100% 44%, 85% 60%, 89% 82%, 67% 82%, 50% 100%, 33% 82%, 11% 82%, 15% 60%, 0% 44%, 18% 33%, 18% 11%, 39% 18%)',
        }}
      >
        {index + 1}
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="font-heading font-bold text-[15px] text-parchment/85">{team.name}</span>
        <span className="flex items-center gap-2.5 mt-0.5">
          <span className="flex items-center gap-1 font-heading font-black text-[24px]">
            <img src="/icon-coin-gold.svg" alt="" className="w-[21px] h-[21px]" />
            <TweenNumber value={team.goldInside + team.goldOutside} />
          </span>
          <span className="flex items-center gap-1 font-heading font-bold text-[17px] text-parchment/90 tabular-nums">
            <img src="/icon-stone.svg" alt="" className="w-[17px] h-[17px]" />
            <TweenNumber value={team.stonesOutside} flash="#B7A98A" />
          </span>
          <span className="flex items-center gap-1 font-heading font-bold text-[17px] text-parchment/90 tabular-nums">
            <img src="/icon-build-floor.svg" alt="" className="w-[17px] h-[17px]" />
            <TweenNumber value={team.castle.floors.length} flash="#8D99AE" />
          </span>
          <span className="flex items-center gap-1 font-heading font-bold text-[17px] text-parchment/90 tabular-nums">
            <img src="/icon-soldier.svg" alt="" className="w-[17px] h-[17px]" />
            <TweenNumber value={team.soldiers.length} flash="#8D99AE" />
          </span>
        </span>
      </span>
    </motion.button>

    {/* مربع المعلومات الكامل عند التحويم — تحت البطاقة مباشرة، نفس محتوى
        لوحة الموارد الجانبية (TeamResources) لكن لأي مجموعة */}
    <AnimatePresence>
      {hover && (
        <motion.div
          className="absolute top-full start-0 z-[45] mt-2 w-[260px] max-w-[86vw] max-h-[62vh] overflow-y-auto hud-glass rounded-panel p-3 text-parchment shadow-modal"
          initial={{ opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.16 }}
          onMouseEnter={showPopover}
          onMouseLeave={scheduleHide}
          data-highlight={`team-card-info-${index}`}
        >
          <TeamResources team={team} />
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}

/** لافتة «الدور: المجموعة الثانية» — تسقط عند تبدّل الدور وتختفي بعد 2.5ث */
export function TurnBanner() {
  const state = useGameStore((s) => s.state);
  const [visible, setVisible] = useState(false);
  const turnKey = `${state.turnIndex}-${state.roundNumber}`;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 2500);
    return () => window.clearTimeout(id);
  }, [turnKey]);

  const team = state.teams[state.turnIndex];
  if (!team) return null;
  // تبقى ظاهرة أثناء السؤال الشفهي
  const persist = state.phase === 'question' && state.settings.round.questionMode === 'oral';
  const show = visible || persist;
  const color = TEAM_COLORS[team.color];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none rounded-full px-8 py-2 font-heading font-black text-[26px] text-white shadow-modal border-[3px]"
          style={{ background: `linear-gradient(180deg, ${color}, ${color}CC)`, borderColor: 'var(--gold-500)' }}
          initial={{ y: -70, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          الدور: {team.name}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** الشريط العلوي الكامل */
export function TopBar() {
  const teams = useGameStore((s) => s.state.teams);
  const turnIndex = useGameStore((s) => s.state.turnIndex);
  return (
    <div className="fixed top-0 inset-x-0 z-20 pointer-events-none">
      <div
        className="relative flex items-center justify-center gap-3 px-6 pt-3 pb-4 flex-wrap"
        style={{ background: 'rgba(11,62,67,.82)', backdropFilter: 'blur(12px)' }}
      >
        <div className="absolute bottom-0 inset-x-0 h-[10px] zellige-strip opacity-80" aria-hidden />
        <div className="pointer-events-auto flex items-center gap-3 flex-wrap justify-center">
          {teams.map((t, i) => (
            <TeamCard key={t.id} team={t} active={i === turnIndex} index={i} />
          ))}
        </div>
        <div className="absolute top-[104px] inset-x-0 flex justify-center">
          <TurnBanner />
        </div>
      </div>
    </div>
  );
}
