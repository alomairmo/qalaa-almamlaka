/**
 * لوحة الأزرار الجانبية الخمسة — game-map.md §4 (z-25).
 * (لوحة الموارد التفصيلية انتقلت إلى العمود الأيسر — TurnInfoPanel تُركَّب في GameHud)
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, engineApi, canFireCatapultNow } from '@/engine';
import GameButton from '@/components/game/GameButton';
import { useSound } from '@/audio';

/** شريحة الكلفة المثبتة داخل الزر */
function CostChip({ icon, amount }: { icon: string; amount: number }) {
  return (
    <span className="hud-glass rounded-full px-2.5 py-0.5 flex items-center gap-1 font-heading font-bold text-[16px] text-parchment">
      −{amount}
      <img src={icon} alt="" className="w-[18px] h-[18px]" />
    </span>
  );
}

export function SideActions() {
  const state = useGameStore((s) => s.state);
  const sound = useSound();
  const phase = state.phase;
  const team = state.teams[state.turnIndex];

  const show = phase === 'action' && team;
  if (!team) return null;

  const { floorCost, soldierCost, repairHpPerStone } = state.settings.economy;
  const stones = team.stonesOutside;
  const gold = team.goldInside + team.goldOutside;
  const canBuild = stones >= floorCost;
  const canRecruit = gold >= soldierCost;
  const canCatapult = canFireCatapultNow();
  // الإصلاح: أكثر طابق تضررًا + الحجارة اللازمة لإكمال صحته (حجر = نقطتا صحة افتراضيًا)
  const damaged = team.castle.floors
    .filter((f) => f.hp < f.maxHp)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const repairStones = damaged
    ? Math.min(stones, Math.ceil((damaged.maxHp - damaged.hp) / repairHpPerStone))
    : 0;
  const canRepair = damaged !== undefined && repairStones > 0;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed top-1/2 -translate-y-1/2 start-4 z-[25] flex flex-col items-center gap-3 w-[170px]"
          initial={{ x: -220, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -220, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <div
            className="w-full rounded-panel border-[3px] border-wood-700 p-3 flex flex-col gap-3"
            style={{
              backgroundImage: 'url(/wood-planks-texture.png)',
              backgroundColor: '#2E1B0E',
              boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 12px 32px rgba(43,33,24,.35)',
            }}
          >
            <span data-highlight="btn-build" className="block">
              <GameButton
                label="بناء طابق"
                variant="teal"
                size="sm"
                className="w-full !h-[64px] !text-[19px]"
                icon={<img src="/icon-build-floor.svg" alt="" className="w-[26px] h-[26px]" />}
                costChip={<CostChip icon="/icon-stone.svg" amount={floorCost} />}
                disabled={!canBuild}
                title={canBuild ? 'ابنِ طابقًا جديدًا' : 'حجارة غير كافية'}
                onClick={() => {
                  sound.click();
                  engineApi.buildFloor();
                }}
              />
            </span>
            <span data-highlight="btn-repair" className="block">
              <GameButton
                label="إصلاح طابق"
                variant="teal"
                size="sm"
                className="w-full !h-[64px] !text-[19px]"
                icon={<img src="/icon-stone.svg" alt="" className="w-[26px] h-[26px]" />}
                costChip={<CostChip icon="/icon-stone.svg" amount={repairStones} />}
                disabled={!canRepair}
                title={
                  canRepair
                    ? `إصلاح الطابق الأكثر تضررًا (${damaged.hp}/${damaged.maxHp} صحة)`
                    : 'لا طوابق مصابة — الإصلاح يستهدف أكثر طابق تضررًا'
                }
                onClick={() => {
                  if (!damaged || repairStones <= 0) return;
                  sound.click();
                  engineApi.repairFloor(damaged.id, repairStones);
                }}
              />
            </span>
            <span data-highlight="btn-recruit" className="block">
              <GameButton
                label="شراء جندي"
                variant="teal"
                size="sm"
                className="w-full !h-[64px] !text-[19px]"
                icon={<img src="/icon-soldier.svg" alt="" className="w-[26px] h-[26px]" />}
                costChip={<CostChip icon="/icon-coin-gold.svg" amount={soldierCost} />}
                disabled={!canRecruit}
                title={canRecruit ? 'جنّد جنديًا جديدًا' : 'ذهب غير كافٍ'}
                onClick={() => {
                  sound.click();
                  engineApi.recruitSoldier();
                }}
              />
            </span>
            <span data-highlight="btn-catapult" className="block">
              <GameButton
                label="المنجنيق"
                variant="teal"
                size="sm"
                className="w-full !h-[64px] !text-[19px]"
                icon={<img src="/icon-catapult.svg" alt="" className="w-[26px] h-[26px]" />}
                costChip={<CostChip icon="/icon-stone.svg" amount={1} />}
                disabled={!canCatapult}
                title={canCatapult ? 'تصويب وإطلاق' : 'تحتاج حجرًا واحدًا على الأقل'}
                onClick={() => {
                  sound.click();
                  engineApi.enterCatapultMode();
                }}
              />
            </span>
            <span data-highlight="btn-army" className="block">
              <GameButton
                label="الجيش"
                variant="teal"
                size="sm"
                className="w-full !h-[64px] !text-[19px]"
                icon={<img src="/icon-soldier.svg" alt="" className="w-[26px] h-[26px]" />}
                title="الهجوم / الإرسال"
                onClick={() => {
                  sound.click();
                  engineApi.enterArmyMode();
                }}
              />
            </span>
            <span className="block">
              <GameButton
                label="إنهاء الجولة"
                variant="gold"
                size="sm"
                className="w-full !h-[64px] !text-[19px]"
                icon={<img src="/icon-end-turn.svg" alt="" className="w-[26px] h-[26px]" />}
                onClick={() => {
                  sound.click();
                  engineApi.endTurnEarly();
                }}
              />
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
