/**
 * VictoryScreen — إعلان الفائز (victory.md).
 * منصة تتويج تُكشف من الأخير إلى الأول، تفصيل الذهب (داخل/خارج/طريق)،
 * موسيقى التتويج، أزرار: موسم جديد / جولة أخيرة بالكاميرا / العودة للعنوان.
 * مكوّن بلا props — يعتمد على useGameStore.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, engineApi, teamTotalGold } from '@/engine';
import { TEAM_COLORS } from '@/contracts/defaults';
import GameButton from '@/components/game/GameButton';
import { useSound } from '@/audio';
import { ConfirmDialog } from './primitives/panels';
import { goToTitle } from './bridges';

const PODIUM_HEIGHTS = [220, 160, 120, 92, 76, 64]; // ارتفاع درجات المنصة

export default function VictoryScreen() {
  const phase = useGameStore((s) => s.state.phase);
  const state = useGameStore((s) => s.state);
  const sound = useSound();
  const [revealed, setRevealed] = useState(0); // عدد المراكز المكشوفة (من الأخير)
  const [confirmNew, setConfirmNew] = useState(false);
  const open = phase === 'victory';

  // الترتيب تنازليًا بالذهب الكلي (داخل + خارج + طريق)
  const standings = useMemo(
    () =>
      state.teams
        .map((t, i) => {
          const onRoad = state.convoys.filter((c) => c.teamId === t.id).reduce((a, c) => a + c.goldCarried, 0);
          return {
            team: t,
            index: i,
            inside: t.goldInside,
            outside: t.goldOutside,
            onRoad,
            total: teamTotalGold(state, t.id),
          };
        })
        .sort((a, b) => b.total - a.total),
    [state],
  );

  // موسيقى التتويج أثناء الشاشة + كشف المراكز من الأخير للأول
  useEffect(() => {
    if (!open) {
      setRevealed(0);
      return;
    }
    const music = sound.victory();
    const ids: number[] = [];
    for (let i = 1; i <= standings.length; i++) {
      ids.push(
        window.setTimeout(() => {
          setRevealed(i);
          if (i === standings.length) sound.fanfare();
          else sound.ding();
        }, 900 + i * 700),
      );
    }
    return () => {
      music.stop();
      ids.forEach((id) => window.clearTimeout(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const winner = standings[0];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[40] flex flex-col items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(180deg, rgba(18,59,79,.75), rgba(11,62,67,.9))' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* أشعة ذهبية دوّارة */}
          <motion.div
            className="absolute inset-[-50%] pointer-events-none opacity-20"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0deg, rgba(245,215,110,.6) 12deg, transparent 24deg, transparent 60deg, rgba(245,215,110,.5) 72deg, transparent 84deg, transparent 130deg, rgba(245,215,110,.55) 142deg, transparent 154deg, transparent 210deg, rgba(245,215,110,.5) 222deg, transparent 234deg, transparent 290deg, rgba(245,215,110,.55) 302deg, transparent 314deg)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
          />

          <img src="/logo-game.png" alt="" className="h-[56px] w-auto mb-1 relative" />
          <h1 className="font-display text-[64px] text-gold-300 leading-tight relative" style={{ textShadow: '0 4px 18px rgba(46,27,14,.7)' }}>
            🏆 نهاية الموسم
          </h1>

          {/* الكأس */}
          <motion.img
            src="/trophy-week.png"
            alt="كأس الأسبوع"
            className="w-[150px] h-[150px] object-contain relative"
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: [0, -6, 0], opacity: 1 }}
            transition={{ y: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.6 } }}
          />

          {/* المنصة — تُكشف من الأخير إلى الأول، والأول في المنتصف */}
          <div className="relative flex items-end gap-4 mt-4" dir="ltr">
            {/* نعرض بترتيب بصري: 2 1 3 ثم البقية */}
            {(standings.length <= 2
              ? standings
              : [standings[1], standings[0], standings[2], ...standings.slice(3)]
            ).map((s) => {
              const rank = standings.indexOf(s);
              const isRevealed = revealed >= standings.length - rank;
              const color = TEAM_COLORS[s.team.color];
              return (
                <motion.div
                  key={s.team.id}
                  className="flex flex-col items-center w-[170px]"
                  initial={{ y: 80, opacity: 0 }}
                  animate={isRevealed ? { y: 0, opacity: 1 } : { y: 80, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                >
                  <img
                    src={`/banner-team-${Math.min(s.index + 1, 4)}.svg`}
                    alt=""
                    className="w-[44px] h-[66px]"
                    style={{ filter: isRevealed ? 'none' : 'grayscale(1)' }}
                  />
                  <div className="font-heading font-bold text-[17px] text-parchment mt-1">{s.team.name}</div>
                  <div className="font-heading font-black text-[34px] tabular-nums" style={{ color: rank === 0 ? '#F5D76E' : '#F6EED9' }}>
                    {isRevealed ? s.total : '؟'} 🪙
                  </div>
                  {isRevealed && (
                    <div className="font-body text-[13px] text-parchment/80">
                      داخل {s.inside} · خارج {s.outside} · طريق {s.onRoad}
                    </div>
                  )}
                  <div
                    className="w-full mt-2 rounded-t-xl border-[3px] border-b-0 border-wood-700 flex items-start justify-center pt-2"
                    style={{
                      height: PODIUM_HEIGHTS[rank] ?? 64,
                      background: `linear-gradient(180deg, ${color}55, #2E1B0E)`,
                      boxShadow: 'inset 0 0 0 2px rgba(245,215,110,.4)',
                    }}
                  >
                    <span className="font-heading font-black text-[26px] text-gold-300">{rank + 1}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {winner && revealed >= standings.length && (
            <motion.div
              className="relative mt-3 font-heading font-extrabold text-[24px] text-gold-300"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              👑 الفائز: {winner.team.name}
            </motion.div>
          )}

          {/* الأزرار */}
          <motion.div
            className="relative flex gap-4 mt-5"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <GameButton label="🔄 موسم جديد" variant="gold" size="hero" onClick={() => setConfirmNew(true)} />
            <GameButton label="📷 جولة أخيرة في الخريطة" variant="teal" size="md" onClick={() => engineApi.enterFreeCamera()} />
            <GameButton label="↩ العودة للعنوان" variant="ghost-parchment" size="md" onClick={goToTitle} />
          </motion.div>

          <ConfirmDialog
            open={confirmNew}
            title="بدء موسم جديد؟"
            warning="سيُصفَّر التقدم الحالي نهائيًا وتبدأ القلاع من جديد."
            confirmLabel="تأكيد الموسم الجديد (اضغط مطوّلًا)"
            onConfirm={() => {
              setConfirmNew(false);
              engineApi.newSeason();
              goToTitle();
            }}
            onCancel={() => setConfirmNew(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
