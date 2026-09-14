/**
 * GameHud — كل ما يظهر فوق الخريطة أثناء اللعب (game-map.md).
 * الشريط العلوي + عنقود أعلى اليسار (شعار/مزامنة/كتم) + الأزرار الجانبية
 * + رصيف طور الجولة السفلي + HUD المنجنيق + شريط وضع الجيش + تلميح الكاميرا الحرة.
 * مكوّن بلا props: يعتمد كليًا على useGameStore وengineApi.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera } from 'lucide-react';
import { useGameStore, engineApi } from '@/engine';
import type { ArmyTarget } from '@/contracts/types';
import { TEAM_COLORS } from '@/contracts/defaults';
import { resolveGoldPileOwner } from '../gold-pile-owner';
import GameButton from '@/components/game/GameButton';
import { useSound } from '@/audio';
import { useUiStore } from '../ui-store';
import { openDispatchModalFromScene } from '../bridges';
import { fireFromBridge, selectArmyTarget, setPower, useSceneBridge } from '@/scene/bridge';
import { setCatapultYawSafe, useBridgeCatapultYaw } from '../scene-bridge-safe';
import { CircularTimer, SyncIndicator } from '../primitives/widgets';
import { TopBar } from './TopBar';
import { SideActions } from './SideActions';
import { TurnInfoPanel } from './TurnInfoPanel';

const GAME_PHASES = ['idle', 'question', 'action', 'catapult', 'army', 'event', 'tutorial'];

// ─────────────────────────────────────────────
// عنقود أعلى اليسار: شعار مصغّر + مزامنة + كتم + تلميح Esc
// ─────────────────────────────────────────────
function TopLeftCluster() {
  const sound = useSound();
  return (
    <div className="fixed top-[104px] end-4 z-20 flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <SyncIndicator />
        <motion.button
          type="button"
          onClick={sound.toggleMute}
          title="كتم/تشغيل الصوت (M)"
          aria-label={sound.muted ? 'تشغيل الصوت' : 'كتم الصوت'}
          className="w-[40px] h-[40px] rounded-full hud-glass flex items-center justify-center"
          whileTap={{ scale: 0.85, rotate: 15 }}
        >
          <img src={sound.muted ? '/icon-sound-off.svg' : '/icon-sound-on.svg'} alt="" className="w-[24px] h-[24px]" />
        </motion.button>
        <button
          type="button"
          onClick={() => engineApi.openSettings()}
          className="hud-glass rounded-full px-3 py-1.5 font-body text-[15px] text-parchment/80 hover:brightness-125"
          title="الإعدادات (Esc)"
        >
          Esc ⚙ الإعدادات
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// رصيف طور الجولة (أسفل المنتصف) — game-map.md §5
// ─────────────────────────────────────────────
function PhaseDock() {
  const state = useGameStore((s) => s.state);
  const sound = useSound();
  const phase = state.phase;
  const team = state.teams[state.turnIndex];
  const pos = state.settings.round.startButtonPosition;
  const bankEmpty = state.questionBank.length === 0;

  return (
    <AnimatePresence mode="wait">
      {phase === 'idle' && team && (
        <motion.div
          key="idle"
          className="fixed bottom-6 inset-x-0 z-[25] flex flex-col items-center gap-2 pointer-events-none"
          initial={{ y: 70, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 70, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        >
          <div className="pointer-events-auto parchment-panel rounded-panel border-[3px] border-wood-700 px-8 py-4 flex flex-col items-center gap-2 shadow-modal"
            style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 12px 32px rgba(43,33,24,.35)' }}
          >
            {pos !== 'none' ? (
              <GameButton
                label="بدء الجولة"
                variant="gold"
                size="hero"
                className="min-w-[280px]"
                onClick={() => {
                  sound.click();
                  engineApi.startTurn();
                }}
              />
            ) : (
              <div className="font-body text-[17px] text-ink/70">وضع بلا زر — المعلم يبدأ الجولة بمفتاح Enter</div>
            )}
            {bankEmpty && (
              <button
                type="button"
                className="font-body text-[16px] text-teal-700 underline"
                onClick={() => engineApi.openSettings()}
              >
                بنك الأسئلة فارغ — أضيفوا الأسئلة من الإعدادات
              </button>
            )}
          </div>
        </motion.div>
      )}
      {phase === 'action' && (
        <motion.div
          key="action"
          className="fixed bottom-6 inset-x-0 z-[25] flex justify-center pointer-events-none"
          initial={{ y: 70, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 70, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        >
          <div
            className="pointer-events-auto flex items-center gap-5 parchment-panel rounded-full border-[3px] border-wood-700 ps-4 pe-8 py-2.5 shadow-modal"
            style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 12px 32px rgba(43,33,24,.35)' }}
          >
            <CircularTimer kind="action" size={96} />
            <div className="flex flex-col items-start gap-1.5">
              <span className="font-heading font-extrabold text-[20px] text-ink">جولة التصرف — نفّذوا ما تشاؤون</span>
              <GameButton
                label="⏭ إنهاء الجولة"
                variant="teal"
                size="md"
                onClick={() => {
                  sound.click();
                  engineApi.endTurnEarly();
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────
// HUD المنجنيق — catapult.md (عداد القوة + تلميح الليزر + أزرار)
// الجسر الموحّد useSceneBridge: المشهد يحدّث power/aimTarget كل إطار.
// أنماط التحكم:
// - hold:    ضغط مطوّل على المشهد (المشهد يشحن ويطلق — هنا قراءة حية فقط).
// - slider:  قرص دوّار سفلي يلفّ المنجنيق دورة كاملة 360° (يُرسل
//            setCatapultYaw دفاعيًا) + مقبض عمودي جانبي لقوة الإطلاق
//            (يُرسل setPower) — تحريك الفارة لا يؤثر في هذا النمط.
// - gesture: نفس القرص والمقبض يظهران **للعرض فقط** (يتبعان catapultYaw/power
//            الحيّين من الجسر، بلا تفاعل مؤشر مباشر) — التحكم الفعلي بحركة
//            الفارة: يمين/يسار للّف، فوق/أسفل للقوة (ينفّذه المشهد).
// ذاكرة القوة لكل مجموعة: عند فتح الوضع يُضبط المقبض على آخر قوة محفوظة
// (engineApi.getCatapultPower) والمحرك يحفظها تلقائيًا عند كل إطلاق.
// ─────────────────────────────────────────────

/**
 * قرص الالتفاف الدوّار 360°: سحب دائري حول المركز يضبط catapultYaw (0..2π).
 * الشاشة مرآة للميدان من الأعلى (x→يمين، z→أسفل)، لذا زاوية المؤشر على الشاشة
 * (atan2(dy,dx) مع y للأسفل) تطابق اتفاقية computeTrajectory مباشرة
 * (0 = +X وتزداد بعكس عقارب الساعة الرياضية = مع عقارب الشاشة).
 * مع disabled يصبح مؤشرًا للعرض فقط (نمط gesture) — يتبع الزاوية الحية من الجسر.
 */
function YawDial({
  yaw,
  onChange,
  disabled = false,
  size = 132,
}: {
  yaw: number;
  onChange?: (yaw: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const TAU = Math.PI * 2;
  const yawNorm = ((yaw % TAU) + TAU) % TAU;
  const yawDeg = Math.round((yawNorm * 180) / Math.PI);

  const updateFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !onChange) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < 10) return; // قرب المركز الزاوية غير مستقرة
    const a = Math.atan2(dy, dx);
    onChange(a < 0 ? a + TAU : a);
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={ref}
        role={disabled ? 'img' : 'slider'}
        aria-label="اتجاه المنجنيق — دورة كاملة 360°"
        aria-valuenow={disabled ? undefined : yawDeg}
        aria-valuemin={disabled ? undefined : 0}
        aria-valuemax={disabled ? undefined : 360}
        className={`relative rounded-full border-[3px] border-wood-700/70 bg-wood-900/60 shadow-card ${
          disabled ? 'pointer-events-none opacity-90' : 'cursor-grab active:cursor-grabbing touch-none'
        }`}
        style={{ width: size, height: size }}
        onPointerDown={
          disabled
            ? undefined
            : (e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                updateFromPointer(e);
              }
        }
        onPointerMove={disabled ? undefined : (e) => {
          if (e.buttons & 1) updateFromPointer(e);
        }}
      >
        {/* تدريجات حلقية كل 15° (أكبر كل 90°) */}
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i * 15 * Math.PI) / 180;
          const r = size / 2 - 7;
          const major = i % 6 === 0;
          return (
            <span
              key={i}
              aria-hidden
              className="absolute rounded-full"
              style={{
                left: size / 2 + Math.cos(a) * r,
                top: size / 2 + Math.sin(a) * r,
                width: major ? 5 : 3,
                height: major ? 5 : 3,
                transform: 'translate(-50%,-50%)',
                background: major ? '#E8B93B' : 'rgba(246,238,217,.35)',
              }}
            />
          );
        })}
        {/* مؤشر الاتجاه: ذراع + سهم يدوران مع الزاوية (0° = يمين الشاشة) */}
        <div className="absolute inset-0" style={{ transform: `rotate(${yawDeg}deg)` }}>
          <div
            aria-hidden
            className="absolute top-1/2 h-[4px] rounded-full bg-gold-400/90"
            style={{ left: size / 2, width: size / 2 - 22, transform: 'translateY(-50%)' }}
          />
          <div
            aria-hidden
            className="absolute"
            style={{
              left: size - 24,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 0,
              height: 0,
              borderTop: '8px solid transparent',
              borderBottom: '8px solid transparent',
              borderLeft: '13px solid #E8B93B',
            }}
          />
        </div>
        {/* محور مركزي + قراءة الزاوية */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-wood-900/95 border-2 border-gold-500/80 px-2 py-0.5 font-heading font-black text-[15px] text-parchment tabular-nums" dir="ltr">
            {yawDeg}°
          </div>
        </div>
      </div>
      <span className="font-body text-[13px] text-parchment/70">
        {disabled ? 'يتبع حركة الفارة' : 'اسحب حول القرص — دورة كاملة 360°'}
      </span>
    </div>
  );
}

function CatapultHud() {
  const state = useGameStore((s) => s.state);
  const sound = useSound();
  const power = useSceneBridge((s) => s.power);
  const charging = useSceneBridge((s) => s.charging);
  const bridgeYaw = useBridgeCatapultYaw();
  const team = state.teams[state.turnIndex];
  const powerMode = state.settings.catapult.powerMode;
  const laser = state.settings.catapult.laserEnabled;

  // زاوية قرص الالتفاف في نمط slider (راديان 0..2π — دورة كاملة)
  const [yaw, setYaw] = useState(0);

  // عند فتح وضع المنجنيق: الزاوية الابتدائية للقرص = الاتجاه نحو الهدف الحالي
  // (aimYaw من الجسر)، واضبط مقبض/إيماء القوة على آخر قوة محفوظة لهذه المجموعة
  useEffect(() => {
    // قراءة لحظية من الجسر عند الفتح — تهيئة لمرة واحدة لا اشتراك تفاعلي
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYaw(((useSceneBridge.getState().aimYaw ?? 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
    const t = useGameStore.getState().state;
    const active = t.teams[t.turnIndex];
    if (active && t.settings.catapult.powerMode !== 'hold') {
      try {
        setPower(engineApi.getCatapultPower(active.id) / 100);
      } catch {
        /* نسخة محرك أقدم بلا ذاكرة قوة */
      }
    }
     
  }, []);

  // تحكم لوحة المفاتيح بالأسهم في نمط المقابض (slider): ↑/↓ تغيّران القوة،
  // →/← يلفّان المنجنيق — والمقابض تنعكس فورًا لأنها تقرأ من نفس المصادر
  useEffect(() => {
    if (powerMode !== 'slider') return;
    const twoPi = Math.PI * 2;
    const yawStep = (Math.PI * 3) / 180; // 3° لكل ضغطة
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const p = useSceneBridge.getState().power;
        setPower(Math.min(1, Math.max(0, p + (e.key === 'ArrowUp' ? 0.02 : -0.02))));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setYaw((prev) => {
          const next = (((e.key === 'ArrowRight' ? prev + yawStep : prev - yawStep) % twoPi) + twoPi) % twoPi;
          setCatapultYawSafe(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [powerMode]);

  if (!team) return null;
  const gaugeColor = power < 0.5 ? '#E8B93B' : power < 0.8 ? '#E8912D' : '#D64545';
  const gesture = powerMode === 'gesture';

  /** قرص الالتفاف (نمط slider): يدور دورة كاملة ويُرسل الزاوية المطلقة للجسر */
  const onYawDial = (rad: number) => {
    setYaw(rad);
    setCatapultYawSafe(rad);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[25] pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* الشريط العلوي المصغّر */}
      <div className="absolute top-[104px] inset-x-0 flex justify-center gap-3">
        <span className="hud-glass rounded-full px-5 py-1.5 font-heading font-bold text-[18px] text-parchment">
          الحجارة: {team.stonesOutside} 🪨
        </span>
        <span className="hud-glass rounded-full px-5 py-1.5 font-body text-[16px] text-parchment/85">
          الإلغاء لا يستهلك الحجر
        </span>
        {laser && (
          <span className="hud-glass rounded-full px-5 py-1.5 font-body text-[16px] text-turquoise-glaze">
            مؤشر الليزر مفعّل — نقطة السقوط ظاهرة على الخريطة
          </span>
        )}
      </div>
      {/* مؤقت الجولة المصغّر أعلى المنتصف — يستمر بالعد أثناء وضع المنجنيق */}
      <div className="absolute top-[160px] inset-x-0 flex justify-center">
        <CircularTimer kind="action" size={64} />
      </div>
      {/* إنهاء الجولة متاح أثناء وضع المنجنيق (إلغاء بلا خصم ثم إنهاء) */}
      <div className="absolute top-[160px] end-4 pointer-events-auto">
        <GameButton
          label="⏭ إنهاء الجولة"
          variant="gold"
          size="sm"
          onClick={() => {
            sound.click();
            engineApi.endTurnEarly();
          }}
        />
      </div>
      {/* الشعيرات */}
      <img
        src="/reticle-catapult.svg"
        alt=""
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[96px] h-[96px] opacity-90"
      />
      {/* حلقة شحن القوة حول الشعيرات (نمط الضغط المطوّل) */}
      {powerMode === 'hold' && charging && (
        <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90" width={132} height={132}>
          <circle cx={66} cy={66} r={58} fill="none" stroke="rgba(246,238,217,.25)" strokeWidth={8} />
          <circle
            cx={66}
            cy={66}
            r={58}
            fill="none"
            stroke={gaugeColor}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 58}
            strokeDashoffset={2 * Math.PI * 58 * (1 - power)}
          />
        </svg>
      )}

      {/* عمود مقابض المنجنيق الجانبي — جهة اليمين، مرتّب عموديًا:
          [مقبض القوة العمودي] ثم [القرص الدوّار] ثم [زر الإطلاق 🎯] ثم [إلغاء].
          وسط الشاشة يبقى فارغًا تمامًا لرؤية الأهداف.
          نمط slider: تفاعلي (يُرسل setPower/setCatapultYaw). نمط gesture:
          القرص والمقبض للعرض فقط — يتبعان الحيّ من الجسر والتحكم بحركة الفارة. */}
      {(powerMode === 'slider' || gesture) && (
        <div
          className={`absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 ${
            gesture ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          {/* مقبض القوة العمودي */}
          <div className="flex flex-col items-center gap-1.5 hud-glass rounded-panel px-3 py-3">
            <span className="font-heading font-bold text-[14px] text-parchment">القوة</span>
            <span className="font-heading font-black text-[20px] tabular-nums" style={{ color: gaugeColor }}>
              {Math.round(power * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(power * 100)}
              onChange={(e) => setPower(Number(e.target.value) / 100)}
              disabled={gesture}
              className={`accent-[#E8B93B] ${gesture ? 'cursor-default' : 'cursor-pointer'}`}
              style={{ writingMode: 'vertical-lr', width: 40, height: 190 }}
              aria-label="قوة الإطلاق"
            />
            <span className="font-body text-[12px] text-parchment/70">أضعف</span>
            {gesture && <span className="font-body text-[12px] text-parchment/60">بالإيماء 🖱</span>}
          </div>

          {/* القرص الدوّار + زر الإطلاق تحت المقبض مباشرة */}
          <div className="flex flex-col items-center gap-2.5 hud-glass rounded-panel px-3 py-3">
            <YawDial
              yaw={gesture ? bridgeYaw : yaw}
              onChange={gesture ? undefined : onYawDial}
              disabled={gesture}
              size={128}
            />
            {!gesture && (
              <GameButton
                label="🎯 إطلاق"
                variant="gold"
                size="md"
                className="min-w-[150px]"
                onClick={() => fireFromBridge()}
              />
            )}
            {gesture && (
              <span className="font-heading font-bold text-[14px] text-parchment">
                الزاوية:{' '}
                <b className="tabular-nums" dir="ltr">
                  {Math.round(((((bridgeYaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 180) / Math.PI)}°
                </b>
              </span>
            )}
          </div>

          {/* الإلغاء تفاعلي دائمًا حتى في نمط الإيماء */}
          <div className="pointer-events-auto">
            <GameButton label="↩ إلغاء" variant="ghost-parchment" size="sm" onClick={() => engineApi.cancelCatapult()} />
          </div>
          {gesture && (
            <span className="font-body text-[12px] text-parchment/60 text-center max-w-[180px]">
              حرّك الفارة: يمين/يسار للّف · فوق/أسفل للقوة · نقرة يسرى للإطلاق
            </span>
          )}
          {!gesture && (
            <span className="font-body text-[12px] text-parchment/60 text-center max-w-[180px]" dir="rtl">
              أو بالأسهم: ↑↓ للقوة · →← للاتجاه
            </span>
          )}
        </div>
      )}

      {/* نمط الضغط المطوّل فقط: تلميح وقراءة حية أسفل المنتصف (المشهد يشحن ويطلق بنفسه) */}
      {powerMode === 'hold' && (
        <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-3 pointer-events-auto">
          <div className="hud-glass rounded-full px-8 py-3 font-heading font-extrabold text-[20px] text-parchment flex items-center gap-3">
            {charging ? (
              <>
                <span className="tabular-nums" style={{ color: gaugeColor }}>
                  {Math.round(power * 100)}%
                </span>
                <span>أفلت للإطلاق!</span>
              </>
            ) : (
              <span>🎯 اضغط مطوّلًا على المشهد لشحن القوة ثم أفلت للإطلاق</span>
            )}
          </div>
          <GameButton label="↩ إلغاء" variant="ghost-parchment" size="md" onClick={() => engineApi.cancelCatapult()} />
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// شريط وضع الجيش + قائمة أهداف احتياطية (حتى يربط المشهد النقر ثلاثي الأبعاد)
// ─────────────────────────────────────────────
function ArmyModeBar() {
  const state = useGameStore((s) => s.state);
  const eventQueue = useGameStore((s) => s.eventQueue);
  const sound = useSound();
  const team = state.teams[state.turnIndex];
  const addToast = useUiStore((s) => s.addToast);
  const [listOpen, setListOpen] = useState(false);
  if (!team) return null;

  const available = team.soldiers.filter((s) => s.state !== 'convoy');
  const targets: Array<{ key: string; label: string; chipColor?: string; target: ArmyTarget }> = [];
  for (const t of state.teams) {
    if (t.id === team.id) continue;
    targets.push({
      key: `castle-${t.id}`,
      label: `قلعة ${t.name}`,
      chipColor: TEAM_COLORS[t.color],
      target: { kind: 'castle', teamId: t.id },
    });
  }
  for (const c of state.convoys) {
    if (c.teamId === team.id) continue;
    const owner = state.teams.find((t) => t.id === c.teamId);
    targets.push({
      key: `convoy-${c.id}`,
      label: `قافلة ${owner?.name ?? ''} (${c.goldCarried} ذهب)`,
      chipColor: owner ? TEAM_COLORS[owner.color] : undefined,
      target: { kind: 'convoy', convoyId: c.id },
    });
  }
  for (const p of state.piles) {
    const own = p.kind === 'outside' && p.ownerTeamId === team.id;
    if (own) continue;
    // اعرض مالك/مصدر الكومة لا قيمتها فقط — خارجية: فريقها، ساقطة: قافلة المصدر إن عُرفت
    const ownerInfo = resolveGoldPileOwner(state, eventQueue, p);
    const label =
      p.kind === 'outside'
        ? ownerInfo.team
          ? `ذهب ${ownerInfo.team.name} — ${p.amount}`
          : `ذهب مكشوف — ${p.amount}`
        : ownerInfo.team
          ? `ذهب ساقط — ${p.amount} (كانت مع قافلة ${ownerInfo.team.name})`
          : `ذهب ساقط على الطريق — ${p.amount}`;
    targets.push({
      key: `pile-${p.id}`,
      label,
      chipColor: ownerInfo.team ? TEAM_COLORS[ownerInfo.team.color] : undefined,
      target: { kind: 'gold-pile', pileId: p.id },
    });
  }

  return (
    <motion.div
      className="fixed top-[104px] inset-x-0 z-[25] flex flex-col items-center gap-2 pointer-events-none"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -40, opacity: 0 }}
    >
      <div className="pointer-events-auto hud-glass rounded-full px-6 py-2 flex items-center gap-4">
        {/* مؤقت الجولة يستمر بالعد أثناء وضع الجيش */}
        <CircularTimer kind="action" size={48} />
        <span className="font-heading font-extrabold text-[20px] text-parchment">
          الجيش — اختر الهدف ⚔️ قواتك المتاحة: {available.length}
        </span>
        <button
          type="button"
          className="btn-teal-gradient rounded-full px-4 py-1 font-heading font-bold text-[16px] text-white border border-teal-900"
          onClick={() => {
            if (available.length === 0) {
              addToast('لا جنود لديكم — جنّدوا أولًا (−5 ذهب)', 'danger');
              return;
            }
            sound.click();
            setListOpen((v) => !v);
          }}
        >
          قائمة الأهداف
        </button>
        <button
          type="button"
          className="rounded-full px-4 py-1 font-heading font-bold text-[16px] text-parchment border border-parchment/50"
          onClick={() => engineApi.cancelArmy()}
        >
          ↩ إلغاء
        </button>
        <button
          type="button"
          className="btn-gold-gradient rounded-full px-4 py-1 font-heading font-bold text-[16px] text-wood-900 border border-gold-600"
          title="إنهاء الجولة الآن (يُلغي وضع الجيش بلا خصم)"
          onClick={() => {
            sound.click();
            engineApi.endTurnEarly();
          }}
        >
          ⏭ إنهاء الجولة
        </button>
      </div>
      <AnimatePresence>
        {listOpen && (
          <motion.div
            className="pointer-events-auto parchment-panel rounded-panel border-[3px] border-wood-700 p-3 max-h-[40vh] overflow-y-auto flex flex-col gap-1.5 shadow-modal"
            style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 12px 32px rgba(43,33,24,.35)' }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {targets.length === 0 && <div className="font-body text-[17px] text-ink/70 px-3">لا أهداف متاحة حاليًا</div>}
            {targets.map((t) => (
              <button
                key={t.key}
                type="button"
                className="text-start rounded-lg px-4 py-2 font-heading font-bold text-[17px] text-ink hover:bg-gold-300/50 transition-colors"
                onClick={() => {
                  setListOpen(false);
                  openDispatchModalFromScene(t.target);
                }}
              >
                <span className="inline-flex items-center gap-2">
                  🎯
                  {t.chipColor && (
                    <span
                      aria-hidden
                      className="inline-block w-3.5 h-3.5 rounded-full border border-wood-900/40 shrink-0"
                      style={{ background: t.chipColor }}
                    />
                  )}
                  {t.label}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// تلميح الكاميرا الحرة — settings.md §5
// ─────────────────────────────────────────────
function FreeCameraHint() {
  const [dismissed, setDismissed] = useState(false);
  return (
    <motion.div
      className="fixed bottom-6 inset-x-0 z-[60] flex justify-center pointer-events-none"
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
    >
      {!dismissed && (
        <div className="pointer-events-auto hud-glass rounded-full px-6 py-2.5 flex items-center gap-4 font-body text-[17px] text-parchment">
          <span>عجلة الفارة: تقريب · WASD: تحريك · زر أيمن: تدوير · Esc أو 📷: عودة</span>
          <button
            type="button"
            className="btn-gold-gradient rounded-full px-4 py-1 font-heading font-bold text-[16px] text-wood-900"
            onClick={() => engineApi.exitFreeCamera()}
          >
            <Camera size={16} className="inline -mt-0.5" /> عودة للإعدادات
          </button>
          <button type="button" className="text-parchment/70 text-[15px]" onClick={() => setDismissed(true)}>
            إخفاء
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// HUD الرئيسي + لوحة المفاتيح العامة
// ─────────────────────────────────────────────
export default function GameHud() {
  const phase = useGameStore((s) => s.state.phase);
  const sound = useSound();
  const dispatchOpen = useSceneBridge((s) => s.armyTarget !== null);

  // اختصارات المعلم العامة: Esc (إعدادات/رجوع)، M (كتم)، Enter (بدء الجولة)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useGameStore.getState().state;
      if (e.key === 'Escape') {
        if (st.phase === 'settings') engineApi.closeSettings();
        else if (st.phase === 'freeCamera') engineApi.exitFreeCamera();
        else if (st.phase === 'victory' || st.phase === 'title') return;
        else if (st.phase === 'army' && useSceneBridge.getState().armyTarget) selectArmyTarget(null);
        else if (st.phase === 'army') engineApi.cancelArmy();
        else if (st.phase === 'catapult') engineApi.cancelCatapult();
        else engineApi.openSettings();
      } else if (e.key === 'm' || e.key === 'M') {
        sound.toggleMute();
      } else if (e.key === 'Enter' && st.phase === 'idle') {
        engineApi.startTurn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sound]);

  const inGame = GAME_PHASES.includes(phase);
  return (
    <>
      {inGame && (
        <>
          <TopBar />
          <TopLeftCluster />
          <SideActions />
          <PhaseDock />
          {/* لوحة الموارد التفصيلية — العمود الأيسر، تختفي خلف البطاقات الثابتة */}
          <TurnInfoPanel />
        </>
      )}
      <AnimatePresence>{phase === 'catapult' && <CatapultHud key="catapult" />}</AnimatePresence>
      <AnimatePresence>{phase === 'army' && !dispatchOpen && <ArmyModeBar key="army" />}</AnimatePresence>
      <AnimatePresence>{phase === 'freeCamera' && <FreeCameraHint key="freecam" />}</AnimatePresence>
    </>
  );
}
