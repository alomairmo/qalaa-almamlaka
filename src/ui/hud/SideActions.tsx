/**
 * الأزرار الجانبية العمودية — game-map.md §4.
 * 7 أزرار تفاعلية (تجنيد/بناء/إصلاح/سحب ذهب/إيداع ذهب/منجنيق/جيش) + زر
 * «جولة حرة بالكاميرا» المرجعي. تُعطَّل أثناء طور السؤال أو بعد انتهاء
 * جولة التصرف، ويُختم كل ضغطة بصوت نقرة.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera } from 'lucide-react';
import { useGameStore, engineApi } from '@/engine';
import { useSound } from '@/audio';
import { useUiStore } from '../ui-store';
import { openDispatchModalFromScene } from '../bridges';

import { assetUrl } from '@/asset-base';

interface ActionDef {
  key: string;
  label: string;
  icon: string;
  caption: string;
  run: () => void;
  enabled: boolean;
  disabledHint?: string;
}

export function SideActions() {
  const state = useGameStore((s) => s.state);
  const sound = useSound();
  const addToast = useUiStore((s) => s.addToast);
  const [open, setOpen] = useState(false);

  const phase = state.phase;
  const team = state.teams[state.turnIndex];
  const inAction = phase === 'action';
  if (!team || !(phase === 'idle' || inAction)) return null;

  const eco = state.settings.economy;
  const hasStones = team.stonesOutside > 0;
  const hasGold = team.goldOutside >= 1;
  const damagedFloor = team.castle.floors.some((f) => f.hp < f.maxHp);
  const damagedBase = team.castle.baseHp < team.castle.baseMaxHp;
  const canRepair = hasStones && (damagedFloor || damagedBase);
  const hasTargets =
    state.teams.length > 1 || state.convoys.some((c) => c.teamId !== team.id) || state.piles.length > 0;

  const actions: ActionDef[] = [
    {
      key: 'recruit',
      label: 'تجنيد جندي',
      icon: assetUrl('/icon-soldier.svg'),
      caption: `−${eco.recruitCostGold} ذهب (يُسحب من الخارج)`,
      enabled: hasGold,
      disabledHint: 'لا ذهب خارج القلعة كافيًا',
      run: () => engineApi.recruitSoldier(),
    },
    {
      key: 'build',
      label: 'بناء طابق',
      icon: assetUrl('/icon-build-floor.svg'),
      caption: `−${eco.floorBuildCostStones} حجارة`,
      enabled: team.stonesOutside >= eco.floorBuildCostStones,
      disabledHint: 'حجارة غير كافية',
      run: () => engineApi.buildFloor(),
    },
    {
      key: 'repair',
      label: 'إصلاح ضرر',
      icon: assetUrl('/icon-repair-hammer.svg'),
      caption: `−${eco.repairCostStones} حجارة`,
      enabled: canRepair,
      disabledHint: !hasStones ? 'لا حجارة' : 'لا ضرر لإصلاحه',
      run: () => {
        const r = engineApi.repairDamage();
        if (r === null) addToast('لا ضرر لإصلاحه (أو لا حجارة)', 'danger');
      },
    },
    {
      key: 'withdraw',
      label: 'سحب ذهب',
      icon: assetUrl('/icon-gold-withdraw.svg'),
      caption: 'من الداخل إلى الخارج (للإنفاق)',
      enabled: team.goldInside > 0,
      disabledHint: 'الخزنة الداخلية فارغة',
      run: () => engineApi.moveGold('out', 10),
    },
    {
      key: 'deposit',
      label: 'إيداع ذهب',
      icon: assetUrl('/icon-gold-deposit.svg'),
      caption: 'من الخارج إلى الداخل (للأمان)',
      enabled: team.goldOutside > 0,
      disabledHint: 'لا ذهب خارج القلعة',
      run: () => engineApi.moveGold('in', 10),
    },
    {
      key: 'catapult',
      label: 'إطلاق منجنيق',
      icon: assetUrl('/icon-catapult.svg'),
      caption: '−1 حجر',
      enabled: hasStones,
      disabledHint: 'لا حجارة للقذف',
      run: () => engineApi.enterCatapultMode(),
    },
    {
      key: 'army',
      label: 'إرسال جيش',
      icon: assetUrl('/icon-army-march.svg'),
      caption: 'اختيار هدف وتشكيل القوة',
      enabled: hasTargets && team.soldiers.length > 0,
      disabledHint: team.soldiers.length === 0 ? 'لا جنود لديكم' : 'لا أهداف متاحة',
      run: () => engineApi.enterArmyMode(),
    },
  ];

  return (
    <div className="fixed end-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-end gap-1.5">
      {/* زر الكاميرا الحرة المرجعي (غير مفعّل في طور التصرف — من الإعدادات) */}
      <SideButton
        label="جولة حرة بالكاميرا"
        icon={<Camera size={22} />}
        caption="من الإعدادات ← عام"
        disabled
        disabledHint="متاحة من الإعدادات أثناء الإعداد فقط"
        onClick={() => undefined}
      />
      {actions.map((a) => (
        <SideButton
          key={a.key}
          label={a.label}
          icon={<img src={a.icon} alt="" className="w-[26px] h-[26px]" />}
          caption={a.caption}
          disabled={!inAction || !a.enabled}
          disabledHint={!inAction ? 'متاح في جولة التصرف' : a.disabledHint}
          onClick={() => {
            sound.click();
            a.run();
          }}
        />
      ))}
      {/* لماذا معطّل؟ — زر مساعدة يفتح شريحة توضيحية */}
      <button
        type="button"
        className="font-body text-[13px] text-parchment/70 underline mt-1"
        onClick={() => setOpen((v) => !v)}
      >
        لماذا زر معطّل؟
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="parchment-panel rounded-panel border-2 border-wood-700 p-3 max-w-[240px] shadow-card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <ul className="font-body text-[14px] text-ink/80 flex flex-col gap-1">
              {actions
                .filter((a) => !a.enabled)
                .map((a) => (
                  <li key={a.key}>
                    • {a.label}: {a.disabledHint}
                  </li>
                ))}
              {actions.every((a) => a.enabled) && <li>كل الأزرار متاحة الآن ✓</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SideButton({
  label,
  icon,
  caption,
  disabled,
  disabledHint,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  caption: string;
  disabled?: boolean;
  disabledHint?: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : label}
      className={[
        'group flex items-center gap-2 rounded-btn border-2 ps-2.5 pe-3 py-1.5 transition-all',
        disabled
          ? 'hud-glass opacity-45 cursor-not-allowed'
          : 'btn-teal-gradient border-teal-900 hover:brightness-110 shadow-card',
      ].join(' ')}
      whileTap={disabled ? undefined : { scale: 0.95 }}
    >
      <span className={disabled ? 'grayscale' : ''}>{icon}</span>
      <span className="flex flex-col items-start leading-tight">
        <span className={`font-heading font-extrabold text-[16px] ${disabled ? 'text-parchment' : 'text-white'}`}>
          {label}
        </span>
        <span className={`font-body text-[12px] ${disabled ? 'text-parchment/70' : 'text-parchment/90'}`}>
          {disabled && disabledHint ? `🚫 ${disabledHint}` : caption}
        </span>
      </span>
    </motion.button>
  );
}
