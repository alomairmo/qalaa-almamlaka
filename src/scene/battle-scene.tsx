/**
 * مشهد المعركة الكامل لأحداث battle-resolved (غزو قلعة / اعتراض قافلة)
 * + مشهد النهب بلا قتال (LootScene) لأحداث convoy-departed غير المقترنة
 * بمعركة (قلعة فارغة / التقاط كومة ذهب):
 *
 * BattleScene:
 * 1) marching: جنود بلون المهاجم يخرجون من بوابة قلعتهم ويمشون نحو الهدف.
 *    في غزو القلعة: ينتهي المسير عند **بوابة** قلعة المدافع، والمدافعون
 *    يخرجون من الباب أثناء ذلك ويصطفون أمامه.
 * 2) fighting: لقطة القتال الأولية — سحابة تراب + نجوم سيوف + اهتزاز كاميرا.
 * 3) clash: **حلقة قتال مستمرة** بعد اللقطة الأولية — تدور طالما الواجهة
 *    لم تضبط stickyHold لبطاقة النتائج بعد (الواجهة تعرض التنبيهات العابرة
 *    أولًا). مهلة احتياطية STICKY_FALLBACK_MS إن لم تظهر بطاقة أصلًا.
 * 4) celebrate: عند ظهور stickyHold — احتفال/انكسار مستمر (الفائزون يقفزون
 *    رافعين أسلحتهم، مع أكياس الذهب للغزاة المنتصرين) **حتى
 *    confirmSticky(eventId)** (أو إغلاق البطاقة / مهلة احتياطية — انظر
 *    bridge.stickyGateReleased).
 * 5) leaving: بعد التأكيد فقط — الناجون يحملون الغنيمة ويبتعدون ثم يتلاشى
 *    الجميع وتُفرَج الكاميرا؛ عندها يُضبط battleFx = done.
 *
 * الكاميرا: من لحظة المسير (مطاردة الرتل) حتى تأكيد بطاقة النتائج تبقى
 * مؤطّرة على **موقع المعركة** (مركز بين الطرفين) بلقطة focus-entity تُجدَّد
 * دوريًا — لا تعود لقلعة المهاجم مهما طال انتظار البطاقة.
 *
 * LootScene: مسير ← دخول القلعة الفارغة والخروج بأكياس الذهب (أو التقاط
 * الكومة) ← احتفال مستمر حتى التأكيد ← تلاشٍ (القافلة الحقيقية يعرضها
 * مكوّن Convoys) — وكاميرا مثبتة على الموقع بالطريقة نفسها.
 *
 * التخطي (يُفرغ المؤثرات من مشغّل الأحداث) يضبط done فورًا من دالة التنظيف.
 * prefers-reduced-motion يقصّر المشهد بشدة ويلغي مهام الكاميرا.
 * اشتقاق الخطط (planBattle/planLoot) في ./battle-plan.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Vec3 } from '@/contracts/types';
import {
  celebrateTeam,
  createStickyGate,
  pushFloat,
  setBattleFx,
  setCameraJob,
  shakeScreen,
  stickyGateReleased,
  STICKY_FALLBACK_MS,
  useSceneBridge,
  type CameraJob,
  type StickyGate,
} from './bridge';
import { burstSmoke, burstSparkle } from './effects/particle-pool';
import { yawTowards } from './layout';
import { teamHex, usePrefersReducedMotion } from './palette';
import { SoldierModel, type SoldierAnim } from './entities/Soldier';
import { MAX_SHOWN_SOLDIERS, type BattlePlan, type LootPlan } from './battle-plan';

/** إزاحة تشكيل الرتل: 4 أعمدة، والصفوف التالية خلف المركز (عكس جهة السير) */
function formationOffset(i: number, yaw: number): { x: number; z: number } {
  const lat = ((i % 4) - 1.5) * 1.25;
  const back = Math.floor(i / 4) * -1.5;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: lat * c + back * s, z: -lat * s + back * c };
}

function lerpPoint(a: Vec3, b: Vec3, t: number): { x: number; z: number } {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** كيس ذهب ظاهر يحمله الناجي المنتصر/الناهب */
function LootSack() {
  return (
    <mesh position={[0, 0.62, 0.5]}>
      <sphereGeometry args={[0.2, 8, 8]} />
      <meshToonMaterial color="#E8B93B" />
    </mesh>
  );
}

type ScenePhase = 'marching' | 'fighting' | 'clash' | 'celebrate' | 'leaving' | 'done';

/** أدنى مدة لطور الاحتفال/الانكسار قبل السماح بالخاتمة (حتى تُقرأ بصريًا) */
const MIN_CELEBRATE_MS = 1600;
/** الفاصل بين تجديدات لقطة الكاميرا المثبَّتة على موقع المعركة */
const CAM_HOLD_REFRESH_MS = 900;
/** مدة كل تجديد للقطة التثبيت (أطول من فاصل التجديد حتى لا تنقضي بينها) */
const CAM_HOLD_MS = 2000;

/** مركز ونصف قطر تأطير موقع المعركة — يشمل الطرفين (مهاجمين ومدافعين) */
function battleFocus(plan: BattlePlan): { center: Vec3; radius: number } {
  if (plan.siteKind === 'castle-gate') {
    // غزو قلعة: المهاجمون عند البوابة والمدافعون يخرجون منها — المركز بين
    // البوابة ومركز القلعة يؤطّر الطرفين معًا
    const center: Vec3 = {
      x: (plan.site.x + plan.defCastle.x) / 2,
      y: 1.5,
      z: (plan.site.z + plan.defCastle.z) / 2,
    };
    const radius = Math.hypot(plan.site.x - plan.defCastle.x, plan.site.z - plan.defCastle.z) / 2 + 5;
    return { center, radius };
  }
  // ميدان مفتوح: الطرفان يلتقيان عند الموقع نفسه
  return { center: { x: plan.site.x, y: 1.5, z: plan.site.z }, radius: 7 };
}

/**
 * خطّاف تثبيت الكاميرا على موقع الحدث: من بدء الاشتباك/الالتقاط حتى تأكيد
 * البطاقة الثابتة تبقى الكاميرا مؤطّرة على الموقع (لقطة focus-entity تُجدَّد
 * دوريًا حتى لا تنقضي)، وبعد التأكيد تُفرَج فتعود الكاميرا لسلوكها الطبيعي.
 * لا ندهس مهمة كاميرا لغيرنا (مطاردة قذيفة متزامنة مثلًا).
 */
function useCameraHold(reduced: boolean, focus: { center: Vec3; radius: number }) {
  const holdJob = useRef<CameraJob | null>(null);
  const lastAt = useRef(0);
  const hold = (force = false) => {
    if (reduced) return;
    const now = performance.now();
    const cur = useSceneBridge.getState().cameraJob;
    // مهمة غيرنا **الجارية** لا ندهسها (مطاردة قذيفة متزامنة مثلًا) — لكن
    // مهمة منقضية (مطاردة المسير التي لا يمسحها أحد عند انتهائها) لا تمنع
    // التثبيت: نستبدلها بلقطة التركيز وإلا لم تُفعَّل لقطة الموقع أبدًا.
    if (cur && cur !== holdJob.current && now - cur.startedAt < cur.durationMs) return;
    if (!force && cur === holdJob.current && now - lastAt.current < CAM_HOLD_REFRESH_MS) return;
    const job: CameraJob = {
      kind: 'focus-entity',
      points: [{ ...focus.center }],
      radius: focus.radius,
      startedAt: now,
      durationMs: CAM_HOLD_MS,
    };
    holdJob.current = job;
    lastAt.current = now;
    setCameraJob(job);
  };
  const release = () => {
    if (holdJob.current && useSceneBridge.getState().cameraJob === holdJob.current) setCameraJob(null);
    holdJob.current = null;
  };
  return { hold, release };
}

/** مشهد معركة واحد — يُركَّب كمؤثر عابر من مشغّل الأحداث ويُزال بعد التأكيد */
export function BattleScene({ plan, startedAt }: { plan: BattlePlan; startedAt: number }) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<ScenePhase>('marching');
  const phaseRef = useRef<ScenePhase>('marching');
  const fxTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const attackersRef = useRef<(THREE.Group | null)[]>([]);
  const defendersRef = useRef<(THREE.Group | null)[]>([]);
  const haloRef = useRef<THREE.Mesh>(null!);
  const gateRef = useRef<StickyGate | null>(null);
  const leaveStart = useRef(0);
  const celebrateStart = useRef(0);

  const shown = Math.min(MAX_SHOWN_SOLDIERS, plan.attackerCount);
  const survivorsShown = Math.min(shown, plan.survivorCount);
  const yaw = yawTowards(plan.origin, plan.site);
  const defsShown = Math.max(1, plan.defenderDeadShown); // مُسقَّط مسبقًا في planBattle (≤3)
  // تأطير موقع المعركة (يشمل الطرفين) + تثبيت الكاميرا عليه حتى التأكيد
  const focus = useMemo(() => battleFocus(plan), [plan]);
  const cam = useCameraHold(reduced, focus);
  const deadSlots = useMemo(() => {
    // قتلى المهاجمين: آخر خانات التشكيلة حتى لا يتقدم الساقطون الصفَّ
    const set = new Set<number>();
    for (let i = 0; i < plan.attackerDeadShown; i++) set.add(shown - 1 - i);
    return set;
  }, [plan.attackerDeadShown, shown]);

  // إشارات الجسر + المؤثرات الجانبية عند كل طور (مرة واحدة، بحراسة phaseRef)
  const enterPhase = (p: ScenePhase) => {
    phaseRef.current = p;
    setPhase(p);
    if (p === 'fighting') {
      setBattleFx(plan.eventId, 'fighting');
      const at = { x: plan.site.x, y: 2, z: plan.site.z };
      burstSmoke(at, 22, 1.5);
      burstSparkle(at, 10, 0.9);
      // مؤثرات الاشتباك تستمر طوال fighting + clash حتى ظهور البطاقة
      fxTimer.current = setInterval(() => {
        burstSmoke(at, 8, 1.2);
        burstSparkle(at, 5, 0.7);
      }, 320);
      shakeScreen(0.2, 0.3);
      pushFloat({ x: plan.site.x, y: 5, z: plan.site.z }, `⚔️ ${plan.attackPower} : ${plan.defensePower}`, 'white');
      // من هنا حتى تأكيد البطاقة: الكاميرا مثبتة على موقع المعركة
      cam.hold(true);
    } else if (p === 'clash') {
      // حلقة القتال: تُنشأ بوّابة الانتظار هنا حتى تشمل مهلتها الاحتياطية
      // (15ث) انتظارَ البطاقة + الاحتفال معًا، وتبقى الكاميرا مثبتة.
      gateRef.current = createStickyGate(plan.eventId);
      cam.hold(true);
    } else if (p === 'celebrate') {
      if (fxTimer.current) clearInterval(fxTimer.current);
      // البوّابة أُنشئت عند دخول حلقة القتال (sawHold التقط ظهور البطاقة)
      if (!gateRef.current) gateRef.current = createStickyGate(plan.eventId);
      celebrateStart.current = performance.now();
      cam.hold(true);
      const winner = plan.attackerWon ? plan.attackerTeamId : plan.defenderTeamId;
      celebrateTeam(winner, 30);
      if (plan.attackerWon && plan.lootGold > 0) {
        pushFloat({ x: plan.site.x, y: 4, z: plan.site.z }, `غنيمة +${plan.lootGold} 🪙`, 'gold');
      }
      if (!plan.attackerWon) pushFloat({ x: plan.site.x, y: 3, z: plan.site.z }, 'سقط المهاجمون', 'red');
    } else if (p === 'leaving') {
      leaveStart.current = performance.now();
      // بعد تأكيد البطاقة فقط تغادر الكاميرا الموقع وتعود لسلوكها الطبيعي
      cam.release();
    }
  };

  // مطاردة الكاميرا للرتل أثناء المسير (تلغيها لقطة القتال لاحقًا)
  useEffect(() => {
    if (reduced) return;
    const job = { kind: 'chase' as const, points: [plan.origin, plan.site], startedAt, durationMs: plan.marchMs };
    setCameraJob(job);
    return () => {
      // لا تمسح مهمة غيرك: امسح فقط إن كانت ما تزال مهمة المسير هذه
      if (useSceneBridge.getState().cameraJob === job) setCameraJob(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تنظيف: التخطي/الإزالة قبل الاكتمال = قفزة إلى done فورًا + تحرير الكاميرا
  useEffect(() => {
    return () => {
      if (fxTimer.current) clearInterval(fxTimer.current);
      if (phaseRef.current !== 'done') setBattleFx(plan.eventId, 'done');
      cam.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    const e = performance.now() - startedAt;
    const marchEnd = plan.marchMs;
    const fightEnd = marchEnd + plan.fightMs;

    if (phaseRef.current === 'done') return;

    // الانتقالات الزمنية حتى حلقة القتال
    if (phaseRef.current === 'marching' && e >= marchEnd) enterPhase('fighting');
    if (phaseRef.current === 'fighting' && e >= fightEnd) enterPhase('clash');
    // حلقة القتال: تستمر حتى تضبط الواجهة stickyHold لبطاقة هذه المعركة
    // (بعد تنبيهاتها العابرة)، أو مهلة احتياطية إن لم تظهر بطاقة أصلًا
    if (phaseRef.current === 'clash') {
      const hold = useSceneBridge.getState().stickyHold;
      const cardShown = hold !== null && hold.eventId === plan.eventId;
      const timedOut = gateRef.current !== null && performance.now() - gateRef.current.startedAt > STICKY_FALLBACK_MS;
      if (cardShown || timedOut) enterPhase('celebrate');
    }
    // الاحتفال مستمر حتى تأكيد البطاقة الثابتة (أو المهلة الاحتياطية) —
    // وبحد أدنى قصير حتى تُقرأ لحظة الفوز/الانكسار بصريًا
    if (
      phaseRef.current === 'celebrate' &&
      gateRef.current &&
      stickyGateReleased(gateRef.current) &&
      performance.now() - celebrateStart.current >= MIN_CELEBRATE_MS
    ) {
      enterPhase('leaving');
    }
    const p = phaseRef.current;

    // الكاميرا مثبتة على موقع المعركة طوال الاشتباك والاحتفال (تُجدَّد دوريًا)
    if (p === 'fighting' || p === 'clash' || p === 'celebrate') cam.hold();

    // طور المغادرة: عودة قصيرة + تلاشٍ ثم done (وبعده battleFx = done)
    let fade = 1;
    if (p === 'leaving') {
      const le = performance.now() - leaveStart.current;
      const total = plan.returnMs + plan.fadeMs;
      fade = le <= plan.returnMs ? 1 : Math.max(0.01, 1 - (le - plan.returnMs) / plan.fadeMs);
      if (le >= total) {
        phaseRef.current = 'done';
        setBattleFx(plan.eventId, 'done');
        return;
      }
    }

    // مركز الرتل
    const mp = Math.min(1, e / plan.marchMs);
    const center = lerpPoint(plan.origin, plan.site, p === 'marching' ? mp : 1);

    for (let i = 0; i < shown; i++) {
      const g = attackersRef.current[i];
      if (!g) continue;
      const off = formationOffset(i, yaw);
      const isSurvivor = i < survivorsShown;
      const isDead = deadSlots.has(i);
      if (p === 'marching') {
        g.position.set(center.x + off.x, 0, center.z + off.z);
        g.rotation.set(0, yaw, 0);
      } else if (p === 'fighting' || p === 'clash') {
        // تقاذف/تمايل حول موقع المعركة (عند بوابة المدافع في الغزو) —
        // نفس الحركة في اللقطة الأولية وفي حلقة الاشتباك المستمرة
        const w = performance.now() / 90 + i * 1.7;
        g.position.set(
          plan.site.x + off.x * 0.55 + Math.sin(w) * 0.35,
          Math.abs(Math.sin(w * 1.3)) * 0.12,
          plan.site.z + off.z * 0.55 + Math.cos(w * 0.9) * 0.35,
        );
        g.rotation.set(0, yaw + Math.sin(w * 0.7) * 0.8, Math.sin(w) * 0.12);
      } else if (p === 'celebrate') {
        // الفائزون يحتفلون في أماكنهم (القفز في أنيميشن celebrate)، الساقطون يبقون
        if (plan.attackerWon && isSurvivor) {
          g.position.set(plan.site.x + off.x * 0.55, 0, plan.site.z + off.z * 0.55);
          g.rotation.set(0, yawTowards(plan.site, plan.origin), 0);
        }
      } else if (p === 'leaving') {
        const q = Math.min(1, (performance.now() - leaveStart.current) / plan.returnMs);
        if (plan.attackerWon && isSurvivor) {
          // عودة قصيرة نحو القلعة (18% من الطريق) ثم تلاشٍ — القافلة تكمل
          const back = lerpPoint(plan.site, plan.origin, q * 0.18);
          g.position.set(back.x + off.x * 0.6, 0, back.z + off.z * 0.6);
          g.rotation.set(0, yawTowards(plan.site, plan.origin), 0);
        } else if (!plan.attackerWon || isDead) {
          g.rotation.z = 0; // السقوط نفسه في أنيميشن dead داخل SoldierModel
        }
      }
      g.scale.setScalar(fade);
    }

    // المدافعون: في غزو القلعة يخرجون من الباب أثناء مسير المهاجمين ويصطفون
    // أمامه؛ في الميدان يظهرون عند القتال حول الموقع.
    for (let i = 0; i < defsShown; i++) {
      const g = defendersRef.current[i];
      if (!g) continue;
      const off = formationOffset(i, yaw + Math.PI);
      const w = performance.now() / 95 + i * 2.3;
      if (plan.siteKind === 'castle-gate') {
        // مسار الخروج: من مركز القلعة (داخل البوابة) إلى الصف أمامها
        const line = { x: plan.site.x - off.x * 0.5, z: plan.site.z - off.z * 0.5 };
        const exitP = Math.min(1, (e / plan.marchMs) * 1.4);
        if (p === 'marching') {
          const cur = lerpPoint(plan.defCastle, line as Vec3, exitP);
          g.position.set(cur.x, 0, cur.z);
          g.rotation.y = yawTowards(plan.defCastle, plan.site);
          g.visible = exitP > 0.08;
        } else {
          const jx = p === 'fighting' || p === 'clash' ? Math.sin(w) * 0.3 : 0;
          g.position.set(line.x + jx, 0, line.z);
          g.rotation.y = yaw + Math.PI + (p === 'fighting' || p === 'clash' ? Math.sin(w * 0.6) * 0.7 : 0);
          g.visible = true;
        }
      } else {
        const jx = p === 'fighting' || p === 'clash' ? Math.sin(w) * 0.3 : 0;
        g.position.set(plan.site.x - off.x * 0.5 + jx, 0, plan.site.z - off.z * 0.5);
        g.rotation.y = yaw + Math.PI + (p === 'fighting' || p === 'clash' ? Math.sin(w * 0.6) * 0.7 : 0);
        g.visible = p !== 'marching';
      }
      g.scale.setScalar(fade);
    }

    // هالة العدد الكبير فوق مركز الرتل/المعركة
    if (haloRef.current) {
      const active = plan.attackerCount > MAX_SHOWN_SOLDIERS && (p === 'marching' || p === 'fighting' || p === 'clash');
      haloRef.current.visible = active;
      if (active) {
        const hx = p === 'marching' ? center.x : plan.site.x;
        const hz = p === 'marching' ? center.z : plan.site.z;
        haloRef.current.position.set(hx, 3.1 + Math.sin(performance.now() / 300) * 0.15, hz);
        const m = haloRef.current.material as THREE.MeshBasicMaterial;
        m.opacity = 0.22 + Math.sin(performance.now() / 240) * 0.08;
      }
    }
  });

  // أنيميشن كل جندي حسب الطور ومصيره
  const attackerAnim = (i: number): SoldierAnim => {
    if (phase === 'marching' || phase === 'fighting' || phase === 'clash') return 'walk';
    if (plan.attackerWon) {
      if (i >= survivorsShown) return 'dead';
      if (phase === 'celebrate') return 'celebrate';
      return 'carry'; // leaving: يحمل الغنيمة مبتعدًا
    }
    if (phase === 'leaving') return 'dead';
    return 'dead'; // celebrate: مهزوم منكسر ساقط
  };
  const defenderAnim = (): SoldierAnim => {
    if (phase === 'marching') return 'walk'; // خروج من البوابة
    if (phase === 'fighting' || phase === 'clash') return 'walk'; // اشتباك مستمر
    if (phase === 'celebrate' || phase === 'leaving') return plan.attackerWon ? 'dead' : 'celebrate';
    return 'idle';
  };

  return (
    <group>
      {Array.from({ length: shown }, (_, i) => (
        <group key={`att-${i}`} ref={(g) => { attackersRef.current[i] = g; }} position={[plan.origin.x, 0, plan.origin.z]}>
          <SoldierModel rank={plan.attackerRanks[i] ?? 'soldier'} teamColor={plan.attackerColor} anim={attackerAnim(i)} phase={i * 0.9} />
          {/* كيس الذهب منذ الاحتفال للناجين المنتصرين */}
          {(phase === 'celebrate' || phase === 'leaving') && plan.attackerWon && i < survivorsShown && <LootSack />}
        </group>
      ))}
      {Array.from({ length: defsShown }, (_, i) => (
        <group key={`def-${i}`} ref={(g) => { defendersRef.current[i] = g; }} visible={false}>
          <SoldierModel rank={i === 0 ? 'soldier' : 'novice'} teamColor={plan.defenderColor} anim={defenderAnim()} phase={i * 1.3} />
        </group>
      ))}
      {/* هالة توحي بعدد أكبر من السقف المعروض */}
      <mesh ref={haloRef} visible={false}>
        <torusGeometry args={[2.4, 0.22, 8, 28]} />
        <meshBasicMaterial color={teamHex(plan.attackerColor)} transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ─── مشهد النهب بلا قتال (قلعة فارغة / كومة ذهب) ───

type LootPhase = 'marching' | 'pickup' | 'celebrate' | 'leaving' | 'done';

/**
 * إرسال نهب بلا معركة: المهاجمون يمشون لبوابة القلعة الفارغة، يدخلونها،
 * يخرجون حاملين أكياس الذهب ويحتفلون (حتى تأكيد البطاقة الثابتة)؛
 * أو يمشون لكومة الذهب فيلتقطونها ويحتفلون.
 */
export function LootScene({ plan, startedAt }: { plan: LootPlan; startedAt: number }) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<LootPhase>('marching');
  const phaseRef = useRef<LootPhase>('marching');
  const soldiersRef = useRef<(THREE.Group | null)[]>([]);
  const gateRef = useRef<StickyGate | null>(null);
  const leaveStart = useRef(0);
  const celebrateStart = useRef(0);

  const shown = Math.min(MAX_SHOWN_SOLDIERS, Math.max(1, plan.soldierRanks.length));
  const yaw = yawTowards(plan.origin, plan.site);
  // تأطير موقع النهب (يشمل القلعة المنهوبة عند الاقتحام) + تثبيت الكاميرا
  const focus = useMemo(() => {
    if (plan.siteKind === 'castle' && plan.lootCastle) {
      const center: Vec3 = {
        x: (plan.site.x + plan.lootCastle.x) / 2,
        y: 1.5,
        z: (plan.site.z + plan.lootCastle.z) / 2,
      };
      const radius = Math.hypot(plan.site.x - plan.lootCastle.x, plan.site.z - plan.lootCastle.z) / 2 + 5;
      return { center, radius };
    }
    return { center: { x: plan.site.x, y: 1.5, z: plan.site.z }, radius: 6 };
  }, [plan]);
  const cam = useCameraHold(reduced, focus);

  const enterPhase = (p: LootPhase) => {
    phaseRef.current = p;
    setPhase(p);
    if (p === 'pickup') {
      const at = { x: plan.site.x, y: 1.5, z: plan.site.z };
      burstSparkle(at, 12, 1);
      // من الالتقاط حتى تأكيد البطاقة: الكاميرا مثبتة على موقع النهب
      cam.hold(true);
    } else if (p === 'celebrate') {
      gateRef.current = createStickyGate(plan.eventId);
      celebrateStart.current = performance.now();
      cam.hold(true);
      celebrateTeam(plan.teamId, 30);
      if (plan.lootGold > 0) pushFloat({ x: plan.site.x, y: 3.5, z: plan.site.z }, `+${plan.lootGold} 🪙 بلا قتال`, 'gold');
      burstSparkle({ x: plan.site.x, y: 2, z: plan.site.z }, 16, 1.2);
    } else if (p === 'leaving') {
      leaveStart.current = performance.now();
      // بعد تأكيد البطاقة فقط تغادر الكاميرا الموقع
      cam.release();
    }
  };

  useEffect(() => {
    if (reduced) return;
    const job = { kind: 'chase' as const, points: [plan.origin, plan.site], startedAt, durationMs: plan.marchMs };
    setCameraJob(job);
    return () => {
      if (useSceneBridge.getState().cameraJob === job) setCameraJob(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تنظيف: تحرير لقطة التثبيت عند الإزالة (تخطٍّ أو اكتمال)
  useEffect(() => {
    return () => cam.release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    const e = performance.now() - startedAt;
    const marchEnd = plan.marchMs;
    const pickupEnd = marchEnd + plan.pickupMs;

    if (phaseRef.current === 'done') return;
    if (phaseRef.current === 'marching' && e >= marchEnd) enterPhase('pickup');
    if (phaseRef.current === 'pickup' && e >= pickupEnd) enterPhase('celebrate');
    // لا إفراج مبكرًا: بطاقة النهب تظهر فورًا عند convoy-departed وقد يأتي
    // تأكيدها قبل بلوغ الاحتفال — نبقي الكاميرا والاحتفال حدًّا أدنى قصيرًا
    // حتى تُقرأ اللقطة، ثم نغادر (والكاميرا لا تُفرَج قبل التأكيد أصلًا).
    if (
      phaseRef.current === 'celebrate' &&
      gateRef.current &&
      stickyGateReleased(gateRef.current) &&
      performance.now() - celebrateStart.current >= MIN_CELEBRATE_MS
    ) {
      enterPhase('leaving');
    }
    const p = phaseRef.current;

    // الكاميرا مثبتة على موقع النهب طوال الالتقاط والاحتفال (تُجدَّد دوريًا)
    if (p === 'pickup' || p === 'celebrate') cam.hold();

    let fade = 1;
    if (p === 'leaving') {
      const le = performance.now() - leaveStart.current;
      const total = plan.returnMs + plan.fadeMs;
      fade = le <= plan.returnMs ? 1 : Math.max(0.01, 1 - (le - plan.returnMs) / plan.fadeMs);
      if (le >= total) {
        phaseRef.current = 'done';
        return;
      }
    }

    const mp = Math.min(1, e / plan.marchMs);
    const center = lerpPoint(plan.origin, plan.site, p === 'marching' ? mp : 1);

    for (let i = 0; i < shown; i++) {
      const g = soldiersRef.current[i];
      if (!g) continue;
      const off = formationOffset(i, yaw);
      if (p === 'marching') {
        g.position.set(center.x + off.x, 0, center.z + off.z);
        g.rotation.set(0, yaw, 0);
      } else if (p === 'pickup' && plan.siteKind === 'castle' && plan.lootCastle) {
        // دخول القلعة من البوابة ثم الخروج بالأكياس: النصف الأول يتقدمون نحو
        // مركز القلعة ويتلاشون (دخول)، والنصف الثاني يخرجون من البوابة بأكياسهم
        const q = Math.min(1, (e - marchEnd) / plan.pickupMs);
        const inside = { x: plan.lootCastle.x, y: 0, z: plan.lootCastle.z };
        if (q < 0.5) {
          const cur = lerpPoint(plan.site, inside, q * 2);
          g.position.set(cur.x + off.x * 0.3 * (1 - q * 2), 0, cur.z + off.z * 0.3 * (1 - q * 2));
          g.rotation.set(0, yawTowards(plan.site, inside), 0);
          g.visible = q < 0.44;
        } else {
          const cur = lerpPoint(plan.site, inside, (1 - q) * 2);
          g.position.set(cur.x + off.x * 0.3 * ((1 - q) * 2), 0, cur.z + off.z * 0.3 * ((1 - q) * 2));
          g.rotation.set(0, yawTowards(inside, plan.site), 0);
          g.visible = q > 0.56;
        }
      } else {
        // كومة ذهب / وقوف الاحتفال عند الموقع
        g.position.set(plan.site.x + off.x * 0.55, 0, plan.site.z + off.z * 0.55);
        g.rotation.set(0, p === 'pickup' ? yaw : yawTowards(plan.site, plan.origin), 0);
        g.visible = true;
        if (p === 'leaving') {
          const q = Math.min(1, (performance.now() - leaveStart.current) / plan.returnMs);
          const back = lerpPoint(plan.site, plan.origin, q * 0.15);
          g.position.set(back.x + off.x * 0.6, 0, back.z + off.z * 0.6);
        }
      }
      if (p !== 'pickup') g.scale.setScalar(fade);
    }
  });

  const anim = (): SoldierAnim => {
    if (phase === 'marching') return 'walk';
    if (phase === 'pickup') return 'walk';
    if (phase === 'celebrate') return 'celebrate';
    if (phase === 'leaving') return 'carry';
    return 'idle';
  };
  // الأكياس تظهر بعد خروجهم من القلعة / بعد الالتقاط
  const sacksVisible = phase === 'celebrate' || phase === 'leaving' || (phase === 'pickup' && plan.siteKind === 'pile');

  return (
    <group>
      {Array.from({ length: shown }, (_, i) => (
        <group key={`loot-${i}`} ref={(g) => { soldiersRef.current[i] = g; }} position={[plan.origin.x, 0, plan.origin.z]}>
          <SoldierModel rank={plan.soldierRanks[i] ?? 'soldier'} teamColor={plan.color} anim={anim()} phase={i * 0.9} />
          {sacksVisible && plan.lootGold > 0 && <LootSack />}
        </group>
      ))}
    </group>
  );
}
