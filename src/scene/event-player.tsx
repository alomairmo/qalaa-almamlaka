/**
 * مشغّل أحداث الأنيميشن ثلاثي الأبعاد — battles-convoys.md.
 *
 * يستهلك طابور GameEvent من المتجر **قراءةً فقط**: لا يستدعي ackEvents ولا
 * clearEvents إطلاقًا — تأكيد الأحداث (ack) مسؤولية طبقة الواجهة (HUD)
 * التي تقرأ الطابور نفسه لعرض ReportCards. كل ما يفعله هذا المشغّل هو رصد
 * الأحداث الجديدة (بمقارنة المعرّفات) وتشغيل مؤثرات المشهد الموافقة لها.
 *
 * القواعد: مؤثر ثقيل واحد في كل لحظة (طابور تسلسلي داخلي)، زر «تخطي»
 * (skipSignal من المتجر) يُنهي المؤثر الجاري فورًا.
 *
 * أحداث «البطاقة الثابتة» (تجنيد/معركة/نهب) تدخل **بوّابة انتظار**: يستمر
 * كشف المجند/احتفال الفوز/الهزيمة حتى تنادي الواجهة confirmSticky(eventId)
 * — أو تُغلق البطاقة (stickyHold تصبح null) / تمضي مهلة احتياطية 15ث بلا
 * بطاقة (bridge.stickyGateReleased). الطابور يستأنف بعدها.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import type { BattleResolvedEvent, CatapultHit, GameEvent, GameState, Vec3 } from '@/contracts/types';
import { useGameStore, battleDeathSide } from '@/engine';
import { computeTrajectory, catapultOrigin } from '@/engine';
import {
  celebrateTeam,
  createStickyGate,
  focusEntity,
  pushFloat,
  setBattleFx,
  setCameraJob,
  setCatapultFx,
  shakeScreen,
  stickyGateReleased,
  STICKY_FALLBACK_MS,
  useSceneBridge,
  type StickyGate,
  type StickyKind,
} from './bridge';
import { BattleScene, LootScene } from './battle-scene';
import { planBattle, planLoot } from './battle-plan';
import { BASE_FACE_RADIUS, TOWER_FACE_RADIUS, towerSurfaceHit } from './aim';
import { bounceArcPoints, coveringFocus, truncatePathAt } from './projectile-path';
import { RecruitReveal } from './recruit-scene';
import { burstBlood, burstDebris, burstFire, burstPillar, burstSmoke, burstSparkle } from './effects/particle-pool';
import {
  CAMERA_AZIMUTH,
  castleGatePos,
  convoySoldierOffset,
  floorCenterY,
  outsideSoldierPosition,
  pileScenePosition,
  resolveTargetPosition,
  roofHeight,
  stonesPosition,
  teamCastlePos,
} from './layout';
import { RANK_LABELS } from '@/contracts/defaults';

// ─── مؤثرات عابرة (React nodes مؤقتة) ───

interface FxItem {
  id: number;
  node: React.ReactNode;
}
let fxSeq = 0;

/**
 * آخر ارتطام سطحي ببرج من رمية catapult-fired — يربط حدثَي projectile-impact
 * وcatapult-bounce اللاحقين بنقطة الاصطدام **الفعلية على ارتفاع البرج**.
 * الربط بقرب الختم الزمني at (الأحداث الثلاثة تُختم في نداء المحرك نفسه —
 * نافذة ≤100ms) لأن الأحداث لا تحمل معرّفًا مشتركًا للرمية.
 */
let lastTowerShot: { at: number; teamId: string; point: Vec3 } | null = null;

/**
 * تثبيت كاميرا إصابة المنجنيق: من projectile-impact حتى confirmSticky لحدث
 * الإصابة (أو مهلة احتياطية 15ث / تخطٍّ). **غير حاجب للطابور** خلافًا
 * لبوّابة gateRef — حتى تُعرض أحداث الأثر الجانبية (هدم/موت) وقوس الارتداد
 * أثناء انتظار البطاقة لا بعدها.
 */
let impactHold: {
  gate: StickyGate;
  eventId: string;
  /** ختم حدث projectile-impact (لربط الارتداد بنفس الرمية) */
  firedAt: number;
  focus: Vec3;
  radius: number;
  lastFocus: number;
} | null = null;

/** قذائف المعارك التي غطّاها مشهد battle-resolved (convoy-departed لها لا يُعاد تمثيله) */
const battledConvoys = new Set<string>();
function markBattledConvoy(id: string): void {
  battledConvoys.add(id);
  if (battledConvoys.size > 60) {
    const first = battledConvoys.values().next().value;
    if (first) battledConvoys.delete(first);
  }
}

/** قذيفة تطير على مسار (تزامنًا مع مهمة الكاميرا chase) */
function ProjectileFx({ points, startedAt, durationMs }: { points: Vec3[]; startedAt: number; durationMs: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    if (!ref.current || points.length < 2) return;
    const p = Math.min(1, (performance.now() - startedAt) / durationMs);
    const fi = p * (points.length - 1);
    const i = Math.min(points.length - 2, Math.floor(fi));
    const f = fi - i;
    const a = points[i];
    const b = points[i + 1];
    ref.current.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
    ref.current.rotation.x += 0.2;
  });
  return (
    <mesh ref={ref} castShadow>
      <icosahedronGeometry args={[0.5, 0]} />
      <meshToonMaterial color="#6E7683" />
    </mesh>
  );
}

/** عمود نور ذهبي (ترقية/منحة) */
function LightPillarFx({ position }: { position: Vec3 }) {
  const ref = useRef<THREE.Mesh>(null!);
  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(ref.current.scale, { x: 0.4, z: 0.4 }, { x: 1, z: 1, duration: 0.4, ease: 'back.out(2)' });
    gsap.to(ref.current.material as THREE.Material, { opacity: 0, duration: 1.6, ease: 'power2.in' });
  }, []);
  return (
    <mesh ref={ref} position={[position.x, 4, position.z]}>
      <cylinderGeometry args={[0.9, 1.3, 9, 12, 1, true]} />
      <meshBasicMaterial color="#F5D76E" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

/** صاعقة جزاء المعلم: ومضة ذهبية من السماء (كرتونية غير مخيفة) */
function SkyStrikeFx({ position }: { position: Vec3 }) {
  const ref = useRef<THREE.Mesh>(null!);
  useEffect(() => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    gsap.fromTo(m, { opacity: 0 }, { opacity: 0.95, duration: 0.12, repeat: 3, yoyo: true });
    gsap.to(m, { opacity: 0, duration: 0.5, delay: 0.6 });
  }, []);
  return (
    <mesh ref={ref} position={[position.x, 12, position.z]}>
      <coneGeometry args={[0.8, 24, 6]} />
      <meshBasicMaterial color="#F5D76E" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// ─── جدولة الأحداث ───

interface GateSpec {
  kind: StickyKind;
  eventId: string;
  /** إعادة تركيز الكاميرا دوريًا أثناء الانتظار (كشف التجنيد) */
  refocus?: () => void;
}

interface Played {
  fx: FxItem[];
  durationMs: number;
  gate?: GateSpec;
}

/** موقع إصابة جماعية واحدة في المشهد (لأرقام الضرر والمؤثرات) */
function hitPosition(state: GameState, hit: CatapultHit, fallback: Vec3): Vec3 {
  switch (hit.kind) {
    case 'floor': {
      const team = state.teams.find((t) => t.id === hit.teamId);
      const idx = team ? Math.max(0, team.castle.floors.findIndex((f) => f.id === hit.floorId)) : 0;
      const c = teamCastlePos(state, hit.teamId);
      return { x: c.x, y: floorCenterY(idx), z: c.z };
    }
    case 'base': {
      const c = teamCastlePos(state, hit.teamId);
      return { x: c.x, y: 2, z: c.z };
    }
    case 'gold-pile': {
      const pile = state.piles.find((p) => p.id === hit.pileId);
      return pile ? pileScenePosition(state, pile) : fallback;
    }
    case 'stones':
      return stonesPosition(state, hit.teamId);
    case 'soldier': {
      const team = state.teams.find((t) => t.id === hit.teamId);
      if (!team) return fallback;
      const outside = team.soldiers.filter((s) => s.state === 'outside');
      const idx = outside.findIndex((s) => s.id === hit.soldierId);
      if (idx < 0) return fallback; // قُتل وأزيل من الحالة
      const p = outsideSoldierPosition(state, hit.teamId, idx, Math.max(1, outside.length));
      return { x: p.x, y: 1, z: p.z };
    }
    case 'convoy-soldier': {
      const convoy = state.convoys.find((c) => c.id === hit.convoyId);
      if (!convoy) return fallback;
      const idx = Math.max(0, convoy.soldiers.findIndex((s) => s.id === hit.soldierId));
      const off = convoySoldierOffset(idx);
      return { x: convoy.position.x + off.x, y: 1, z: convoy.position.z + off.z };
    }
  }
}

/** مؤثرات إصابة واحدة حسب نوعها (أرقام ضرر + انبعاثات) */
function playHitFx(state: GameState, hit: CatapultHit, at: Vec3): void {
  const pos = hitPosition(state, hit, at);
  switch (hit.kind) {
    case 'floor':
      if (hit.destroyed) {
        burstDebris(pos, 22, 1.6); // انهيار: حطام + غبار (تفصيله مع حدث floor-destroyed)
        pushFloat(pos, 'دُمّر الطابق!', 'red');
      } else {
        burstFire(pos, 12, 1.2); // اشتعال — والاحتراق يستمر فوق الطابق حتى يُصلَح (Castle.tsx)
        pushFloat(pos, `−${hit.damage} 💥`, 'red');
      }
      break;
    case 'base':
      burstDebris(pos, 14, 1.1);
      pushFloat(pos, `−${hit.damage} للقاعدة`, 'red');
      break;
    case 'gold-pile':
      burstFire(pos, 14, 1.1);
      pushFloat({ x: pos.x, y: 1.6, z: pos.z }, `احترق −${hit.amount} 🪙`, 'red');
      break;
    case 'stones':
      burstDebris(pos, 12, 0.9);
      burstFire(pos, 8, 0.8);
      pushFloat({ x: pos.x, y: 1.6, z: pos.z }, `−${hit.count} 🪨`, 'gray');
      break;
    case 'soldier':
    case 'convoy-soldier':
      // القتلى يغطيهم حدث soldier-died («سقط جندٍ») — هنا الجرحى فقط لتفادي التكرار
      if (!hit.died) {
        burstBlood(pos);
        pushFloat({ x: pos.x, y: 2, z: pos.z }, `−${hit.damage}`, 'red');
      }
      break;
  }
}

export default function EventPlayer() {
  const [fx, setFx] = useState<FxItem[]>([]);
  const pending = useRef<GameEvent[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const busyUntil = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSkip = useRef(0);
  /** بوّابة الحدث المنتظِر تأكيدَ بطاقته الثابتة */
  const gateRef = useRef<{ gate: StickyGate; spec: GateSpec; fxIds: number[]; lastFocus: number } | null>(null);

  // رصد الأحداث الجديدة في الطابور (بدون استهلاكها)
  useEffect(() => {
    const scan = () => {
      const q = useGameStore.getState().eventQueue;
      for (const ev of q) {
        if (!seen.current.has(ev.id)) {
          seen.current.add(ev.id);
          pending.current.push(ev);
        }
      }
      // تنظيف الذاكرة: احتفظ بآخر 200 معرّف
      if (seen.current.size > 400) {
        const arr = [...seen.current];
        seen.current = new Set(arr.slice(-200));
      }
    };
    scan();
    const unsub = useGameStore.subscribe(scan);
    return unsub;
  }, []);

  // التخطي: إنهاء المؤثر الجاري فورًا (يحرّر البوّابة أيضًا)
  const skipSignal = useGameStore((s) => s.skipSignal);
  useEffect(() => {
    if (skipSignal === lastSkip.current) return;
    lastSkip.current = skipSignal;
    busyUntil.current = 0;
    if (timer.current) clearTimeout(timer.current);
    setCameraJob(null);
    // التخطي يقفز بمشهد المعركة الجاري إلى النهاية فورًا (تقرأه الواجهة)
    const bf = useSceneBridge.getState().battleFx;
    if (bf.eventId && bf.phase !== 'done') setBattleFx(bf.eventId, 'done');
    // التخطي يحرّر تثبيت كاميرا إصابة المنجنيق أيضًا (يُنهي انتظار تأكيد البطاقة)
    impactHold = null;
    const cf = useSceneBridge.getState().catapultFx;
    if (cf.eventId && cf.phase !== 'done') setCatapultFx(cf.eventId, 'done');
    if (gateRef.current) gateRef.current = null;
    gsap.globalTimeline.getChildren().forEach((t) => t.progress(1));
    // مسح المؤثرات في الدفعة التالية (تفادي setState المتزامن داخل التأثير)
    const id = setTimeout(() => setFx([]), 0);
    return () => clearTimeout(id);
  }, [skipSignal]);

  // حلقة المعالجة التسلسلية
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const now = performance.now();

      // تثبيت كاميرا إصابة المنجنيق (غير حاجب): جدّد لقطة التركيز كل ~900ms
      // حتى تأكيد بطاقة النتيجة، ثم أفرج الكاميرا واضبط catapultFx = done
      const ih = impactHold;
      if (ih) {
        if (stickyGateReleased(ih.gate)) {
          impactHold = null;
          const cur = useSceneBridge.getState().cameraJob;
          if (cur && cur.kind === 'focus-entity') setCameraJob(null);
          const cf = useSceneBridge.getState().catapultFx;
          if (cf.eventId === ih.eventId && cf.phase !== 'done') setCatapultFx(ih.eventId, 'done');
        } else if (now - ih.lastFocus > 900) {
          ih.lastFocus = now;
          focusEntity(ih.focus, ih.radius, 2000);
        }
      }

      // بوّابة البطاقة الثابتة: لا حدث تاليًا حتى التأكيد/الإغلاق/المهلة
      const g = gateRef.current;
      if (g) {
        // مشهد المعركة يدير بوابته كاملة داخليًا (حلقة قتال حتى ظهور البطاقة
        // ← احتفال حتى التأكيد ← خاتمة): ننتظر إشارة done منه حتى لا تقتطع
        // مهلتنا المتوازية (تُحسب من بدء الحدث شاملة المسير) انتظارَه المشروع.
        // حد أقصى موسّع (ضعف المهلة) يبقى ضمانًا ضد التعليق، والتخطي يضبط
        // done فورًا فيحرّر البوابة.
        if (g.spec.kind === 'battle') {
          const bf = useSceneBridge.getState().battleFx;
          const sceneDone = bf.eventId === g.gate.eventId && bf.phase === 'done';
          if (!sceneDone && !stickyGateReleased(g.gate, STICKY_FALLBACK_MS * 2)) {
            timer.current = setTimeout(tick, 150);
            return;
          }
        } else if (!stickyGateReleased(g.gate)) {
          // جدّد تركيز الكاميرا أثناء الانتظار (كشف التجنيد)
          if (g.spec.refocus && now - g.lastFocus > 900) {
            g.lastFocus = now;
            g.spec.refocus();
          }
          timer.current = setTimeout(tick, 150);
          return;
        }
        // انتهى الانتظار: مهلة قصيرة لخاتمة المشهد (عودة/تلاشٍ) ثم أزل المؤثرات
        gateRef.current = null;
        busyUntil.current = now + 1200;
        timer.current = setTimeout(() => {
          setFx((list) => list.filter((f) => !g.fxIds.includes(f.id)));
          tick();
        }, 1200);
        return;
      }

      if (now < busyUntil.current || pending.current.length === 0) {
        timer.current = setTimeout(tick, 120);
        return;
      }
      const ev = pending.current.shift()!;
      // امسح إشارة المعركة السابقة (done) عند بدء الحدث التالي
      const bf = useSceneBridge.getState().battleFx;
      if (bf.eventId && bf.eventId !== ev.id) setBattleFx(null, null);
      // استثناء في تشغيل حدث واحد (كيان أُزيل من الحالة لحظة الأنيميشن)
      // كان يقتل حلقة tick داخل setTimeout فيتوقف الطابور كله بصمت —
      // نتخطى الحدث المعطوب ونواصل.
      let played: Played;
      try {
        played = play(ev);
      } catch (err) {
        console.error('[scene] تعذّر تشغيل مؤثر الحدث — تخطٍّ آمن', ev.type, err);
        timer.current = setTimeout(tick, 120);
        return;
      }
      if (played.fx.length) setFx((list) => [...list.slice(-6), ...played.fx]);
      if (played.gate) {
        gateRef.current = {
          gate: createStickyGate(played.gate.eventId),
          spec: played.gate,
          fxIds: played.fx.map((f) => f.id),
          lastFocus: 0,
        };
        timer.current = setTimeout(tick, 150);
        return;
      }
      busyUntil.current = now + played.durationMs;
      timer.current = setTimeout(() => {
        // أزل مؤثرات هذا الحدث عند انتهائه
        setFx((list) => list.filter((f) => !played.fx.some((p) => p.id === f.id)));
        tick();
      }, played.durationMs);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return <group>{fx.map((f) => <group key={f.id}>{f.node}</group>)}</group>;
}

// ─── توزيع الأحداث على المؤثرات ───

function play(ev: GameEvent): Played {
  const state = useGameStore.getState().state;
  const teamPos = (teamId: string): Vec3 => teamCastlePos(state, teamId);
  const castleTop = (teamId: string): Vec3 => {
    const team = state.teams.find((t) => t.id === teamId);
    const c = teamPos(teamId);
    return { x: c.x, y: team ? roofHeight(team) : 4, z: c.z };
  };
  const noFx: Played = { fx: [], durationMs: 250 };

  switch (ev.type) {
    case 'resources-gained': {
      const top = castleTop(ev.teamId);
      burstSparkle(top, 18, 1.4);
      if (ev.gold > 0) pushFloat({ x: top.x, y: top.y, z: top.z }, `+${ev.gold} 🪙`, 'gold');
      if (ev.stones > 0) pushFloat({ x: top.x, y: top.y, z: top.z }, `+${ev.stones} 🪨`, 'gray');
      return { fx: [], durationMs: 900 };
    }

    case 'floor-built': {
      const team = state.teams.find((t) => t.id === ev.teamId);
      const c = teamPos(ev.teamId);
      const top = castleTop(ev.teamId);
      burstSmoke(top, 22, 1.6);
      pushFloat(top, '+سعة: 10 ذهب + جنديان', 'white');
      shakeScreen(0.12, 0.2);
      // لقطة مركزة على الطابق الجديد أثناء أنيميشن «الصعود» (Castle.tsx: ‏0.9ث)،
      // ثم يفرجها CameraRig فتعود الكاميرا للتأطير الديناميكي للقلعة كاملة
      const newFloorIdx = Math.max(0, (team?.castle.floors.length ?? 1) - 1);
      focusEntity({ x: c.x, y: floorCenterY(newFloorIdx), z: c.z }, 3.4, 1150);
      return { fx: [], durationMs: 1200 };
    }

    case 'floor-repaired': {
      const top = castleTop(ev.teamId);
      burstSparkle(top, 10, 1);
      pushFloat(top, `إصلاح +${ev.hpRestored}`, 'green');
      return { fx: [], durationMs: 800 };
    }

    case 'soldier-recruited': {
      const team = state.teams.find((t) => t.id === ev.teamId);
      const c = teamPos(ev.teamId);
      const gatePos = castleGatePos(c);
      // موضع الكشف: أمام البوابة مباشرة (جهة النوافذ/الكاميرا)
      const reveal: Vec3 = {
        x: c.x + Math.cos(CAMERA_AZIMUTH) * 7.6,
        y: 0,
        z: c.z + Math.sin(CAMERA_AZIMUTH) * 7.6,
      };
      burstSmoke({ x: reveal.x, y: 1, z: reveal.z }, 20, 1.3);
      burstSparkle({ x: reveal.x, y: 2, z: reveal.z }, ev.soldier.rank === 'expert' ? 22 : 10, 1);
      pushFloat({ x: reveal.x, y: 3, z: reveal.z }, RANK_LABELS[ev.soldier.rank], ev.soldier.rank === 'expert' ? 'gold' : 'white');
      celebrateTeam(ev.teamId, 2);
      // الكاميرا تقترب وتركّز على المجند (تُجدَّد دوريًا أثناء انتظار التأكيد)
      focusEntity({ x: reveal.x, y: 1.4, z: reveal.z }, 2.6, 1250);
      const fx: FxItem[] = [
        {
          id: ++fxSeq,
          node: (
            <RecruitReveal
              eventId={ev.id}
              rank={ev.soldier.rank}
              teamColor={team?.color ?? 'emerald'}
              reveal={reveal}
              gate={gatePos}
              inside={ev.soldier.state === 'inside'}
              soldierId={ev.soldier.id}
              teamId={ev.teamId}
              state={state}
            />
          ),
        },
      ];
      return {
        fx,
        durationMs: 1000,
        gate: {
          kind: 'recruit',
          eventId: ev.id,
          refocus: () => focusEntity({ x: reveal.x, y: 1.4, z: reveal.z }, 2.6, 1400),
        },
      };
    }

    case 'catapult-fired': {
      setCatapultFx(ev.id, 'flying');
      // ملاحقة القذيفة: استخدم مسار الرمية المسجل عند التصويب، وإلا احسبه من الهدف
      const shot = useSceneBridge.getState().lastShot;
      let points: Vec3[];
      if (shot && Date.now() - shot.at < 60_000 && shot.points.length > 1) {
        points = shot.points;
      } else {
        const team = state.teams.find((t) => t.id === ev.teamId);
        const idx = state.teams.findIndex((t) => t.id === ev.teamId);
        const origin = team ? catapultOrigin(team, Math.max(0, idx), state.teams.length) : { x: 0, y: 4, z: 0 };
        const landing = resolveTargetPosition(state, ev.target);
        const yaw = Math.atan2(landing.z - origin.z, landing.x - origin.x);
        points = computeTrajectory(origin, yaw, 0.6, ev.power * 100).points;
      }
      // هدف طابق/قاعدة: القذيفة المرئية ترتطم بوجه البرج وتتوقف عنده —
      // لا تخترقه شبحًا نحو نقطة السقوط الأرضية (المحرك يحسب الارتداد لاحقًا
      // عبر catapult-bounce). نفس منطق حلّ التصويب (towerSurfaceHit في aim.ts).
      if (ev.target.kind === 'floor' || ev.target.kind === 'base') {
        const target = ev.target; // تثبيت التضييق النوعي عبر الردود
        const surf = towerSurfaceHit(state, points);
        if (surf && surf.teamId === target.teamId) {
          points = truncatePathAt(points, surf.pathIndex, surf.point);
          lastTowerShot = { at: ev.at, teamId: surf.teamId, point: surf.point };
        } else {
          // المسار المرئي لم يبلغ اسطوانة البرج (تباين عن حلّ المحرك) —
          // اقتطاع عند أقرب نقطة من محور القلعة مع إلحاق نقطة الوجه
          // المشتقة من الهدف الرسمي نفسه (اتجاه الإطلاق ← مركز القلعة).
          const c = teamCastlePos(state, target.teamId);
          const team = state.teams.find((t) => t.id === target.teamId);
          let floorIdx = 0;
          if (target.kind === 'floor' && team) {
            floorIdx = Math.max(0, team.castle.floors.findIndex((f) => f.id === target.floorId));
          }
          const hitY = target.kind === 'base' ? 2 : floorCenterY(floorIdx);
          const faceR = target.kind === 'base' ? BASE_FACE_RADIUS : TOWER_FACE_RADIUS;
          const dl = Math.hypot(c.x - points[0].x, c.z - points[0].z) || 1;
          const face: Vec3 = {
            x: c.x - ((c.x - points[0].x) / dl) * faceR,
            y: hitY,
            z: c.z - ((c.z - points[0].z) / dl) * faceR,
          };
          let ci = 0;
          let cd = Infinity;
          for (let i = 0; i < points.length; i++) {
            const d = Math.hypot(points[i].x - c.x, points[i].z - c.z);
            if (d < cd) { cd = d; ci = i; }
          }
          points = truncatePathAt(points, ci, face);
          lastTowerShot = { at: ev.at, teamId: target.teamId, point: face };
        }
      }
      const dist = Math.hypot(points[points.length - 1].x - points[0].x, points[points.length - 1].z - points[0].z);
      const durationMs = Math.min(2000, Math.max(1200, dist * 22));
      const startedAt = performance.now();
      setCameraJob({ kind: 'chase', points, startedAt, durationMs });
      const fx: FxItem[] = [{ id: ++fxSeq, node: <ProjectileFx points={points} startedAt={startedAt} durationMs={durationMs} /> }];
      return { fx, durationMs };
    }

    case 'projectile-impact': {
      // إن كان الهدف طابقًا/قاعدة وربطنا الرمية (نافذة at ≤ 100ms): الانفجار
      // والكاميرا عند نقطة الاصطدام الفعلية على **وجه البرج** لا مركزه/الأرض
      const linked =
        lastTowerShot && Math.abs(ev.at - lastTowerShot.at) <= 100 && (ev.target.kind === 'floor' || ev.target.kind === 'base')
          ? lastTowerShot
          : null;
      const at = linked ? linked.point : resolveTargetPosition(state, ev.target);
      setCameraJob(null);
      setCatapultFx(ev.id, 'impact');
      const focus: Vec3 = { x: at.x, y: Math.max(1.5, at.y), z: at.z };
      // الكاميرا تُؤطّر موقع الإصابة وتبقى عليه حتى تأكيد بطاقة النتيجة —
      // التجديد الدوري والإفراج في حلقة tick (impactHold أعلى الملف)
      focusEntity(focus, 6, 2000);
      impactHold = { gate: createStickyGate(ev.id), eventId: ev.id, firedAt: ev.at, focus, radius: 6, lastFocus: performance.now() };
      const scale = 0.6 + Math.min(1.4, ev.damage / 5);
      burstDebris(at, 16, scale);
      shakeScreen(0.15 + Math.min(0.5, ev.damage * 0.08), 0.25);
      if (ev.hits.length === 0) {
        // إخطاء كامل (لا إصابات)
        if (ev.damage > 0) pushFloat(at, `−${ev.damage} 💥`, 'red');
      } else {
        // ضرر جماعي مرئي: كل الإصابات معًا (أرقام ضرر/احتراق/تحطم)
        for (const hit of ev.hits) playHitFx(state, hit, at);
      }
      // catapultFx يبقى 'impact' حتى تأكيد البطاقة — 'done' يضبطه impactHold
      // عند الإفراج (أو التخطي/المهلة الاحتياطية)، لا مؤقت ثابت هنا.
      return { fx: [], durationMs: 1500 };
    }

    case 'catapult-bounce': {
      // قوس الارتداد يبدأ من نقطة الاصطدام الفعلية على ارتفاع البرج إن رُبط
      // بنفس الرمية (at ≤ 100ms)، وإلا من origin كما ورد (البرج عند الأرض)
      const linked = lastTowerShot && Math.abs(ev.at - lastTowerShot.at) <= 100 ? lastTowerShot : null;
      const start: Vec3 = linked
        ? linked.point
        : { x: ev.origin.x, y: Math.max(0.6, ev.origin.y), z: ev.origin.z };
      const l = ev.landing;
      const points = bounceArcPoints(start, l);
      const hopMs = 650;
      const startedAt = performance.now();
      const fx: FxItem[] = [{ id: ++fxSeq, node: <ProjectileFx points={points} startedAt={startedAt} durationMs={hopMs} /> }];
      // وسّع تثبيت كاميرا الإصابة ليشمل سقوط الارتداد — البطاقة واحدة لكل
      // إطلاق (eventId حدث projectile-impact)، فلا بوّابة جديدة هنا
      if (impactHold && Math.abs(ev.at - impactHold.firedAt) <= 400) {
        const cov = coveringFocus(impactHold.focus, { x: l.x, y: Math.max(1.5, l.y), z: l.z }, 4);
        impactHold.focus = cov.center;
        impactHold.radius = cov.radius;
      }
      setTimeout(() => {
        burstDebris(l, 10, 0.8);
        shakeScreen(0.12, 0.2);
        for (const hit of ev.hits) playHitFx(useGameStore.getState().state, hit, l);
      }, hopMs);
      // لا نلمس catapultFx: طور الإصابة وخاتمته ('done') ملك حدث
      // projectile-impact وتثبيتِه حتى تأكيد البطاقة
      return { fx, durationMs: hopMs + 600 };
    }

    case 'floor-destroyed': {
      const c = teamPos(ev.teamId);
      burstDebris({ x: c.x, y: 4, z: c.z }, 26, 1.8);
      shakeScreen(0.5, 0.35);
      if (ev.spilledGold > 0) pushFloat(c, `فاض +${ev.spilledGold} 🪙`, 'gold');
      return { fx: [], durationMs: 1200 };
    }

    case 'battle-resolved': {
      // مشهد معركة كامل: مسير نحو بوابة المدافع ← خروج المدافعين ← قتال ←
      // احتفال/انكسار **مستمر حتى تأكيد البطاقة الثابتة** ثم خاتمة.
      // إشارة التزامن battleFx: marching ← fighting ← done (بعد التأكيد).
      if (ev.convoyId) markBattledConvoy(ev.convoyId);
      const plan = planBattle(ev, state);
      setBattleFx(ev.id, 'marching');
      const fx: FxItem[] = [{ id: ++fxSeq, node: <BattleScene plan={plan} startedAt={performance.now()} /> }];
      return { fx, durationMs: plan.totalMs, gate: { kind: 'battle', eventId: ev.id } };
    }

    case 'soldier-died': {
      const at = ev.dropPosition ?? teamPos(ev.teamId);
      burstSmoke({ x: at.x, y: 1, z: at.z }, 10, 0.9);
      // أثناء معركة: الرقم العائم يُلوَّن من منظور المهاجم — سقوط جندي للمهاجم
      // أحمر (خسارة)، وسقوط جندي للمدافع أخضر (مكسب). خارج المعارك (قصف
      // منجنيق) يبقى أحمر. نجد معركة العنقود من الطابور (ختم زمني قريب).
      const battle = useGameStore
        .getState()
        .eventQueue.find(
          (e): e is BattleResolvedEvent => e.type === 'battle-resolved' && Math.abs(e.at - ev.at) <= 400,
        );
      const side = battle ? battleDeathSide(battle, ev.teamId) : null;
      pushFloat({ x: at.x, y: 1.5, z: at.z }, 'سقط جندٍ', side === 'defender' ? 'green' : 'red');
      if (ev.droppedGold) pushFloat(at, `سقط ${ev.droppedGold} 🪙`, 'gold');
      return { fx: [], durationMs: 900 };
    }

    case 'gold-dropped': {
      burstSparkle(ev.position, 10, 1);
      pushFloat(ev.position, `${ev.amount} 🪙`, 'gold');
      return { fx: [], durationMs: 700 };
    }

    case 'gold-burned': {
      const pile = state.piles.find((p) => p.id === ev.pileId);
      // موضع العرض المكشوف (layout) لا الموضع المنطقي — يطابق مجسم الكومة المرئي
      const at = pile ? pileScenePosition(state, pile) : { x: 0, y: 0, z: 0 };
      burstFire({ x: at.x, y: 1, z: at.z }, 14, 1.1);
      pushFloat({ x: at.x, y: 1.5, z: at.z }, `احترق −${ev.amount} 🪙`, 'red');
      return { fx: [], durationMs: 900 };
    }

    case 'convoy-departed': {
      // قافلة ثمرة معركة غطّاها مشهد battle-resolved — ومضة انطلاق فقط
      if (battledConvoys.has(ev.convoy.id)) {
        burstSmoke({ x: ev.convoy.position.x, y: 1, z: ev.convoy.position.z }, 8, 0.8);
        return { fx: [], durationMs: 500 };
      }
      // إرسال نهب بلا قتال: قلعة فارغة / كومة ذهب — مشهد كامل حتى التأكيد
      const plan = planLoot(ev.convoy, ev.id, state);
      const fx: FxItem[] = [{ id: ++fxSeq, node: <LootScene plan={plan} startedAt={performance.now()} /> }];
      return { fx, durationMs: plan.totalMs, gate: { kind: 'loot', eventId: ev.id } };
    }

    case 'convoy-arrived': {
      const c = teamPos(ev.teamId);
      burstSparkle({ x: c.x, y: 2, z: c.z }, 20, 1.3);
      pushFloat({ x: c.x, y: 4, z: c.z }, `وصلت القافلة +${ev.goldDelivered} 🪙`, 'gold');
      celebrateTeam(ev.teamId, 2);
      return { fx: [], durationMs: 1300 };
    }

    case 'soldier-promoted': {
      const c = teamPos(ev.teamId);
      burstPillar({ x: c.x, y: 0.5, z: c.z }, 24);
      pushFloat({ x: c.x, y: 4, z: c.z }, `ترقية: ${RANK_LABELS[ev.toRank]} ⭐`, 'gold');
      const fx: FxItem[] = [{ id: ++fxSeq, node: <LightPillarFx position={{ x: c.x, y: 0, z: c.z }} /> }];
      return { fx, durationMs: 1500 };
    }

    case 'soldier-healed': {
      const c = teamPos(ev.teamId);
      pushFloat(c, `+${ev.hpAfter - ev.hpBefore} صحة`, 'green');
      return { fx: [], durationMs: 600 };
    }

    case 'teacher-grant': {
      const top = castleTop(ev.teamId);
      burstSparkle(top, 26, 1.6);
      burstPillar({ x: top.x, y: 0.5, z: top.z }, 18);
      const d = ev.delta;
      const parts: string[] = [];
      if (d.gold) parts.push(`+${d.gold} 🪙`);
      if (d.stones) parts.push(`+${d.stones} 🪨`);
      if (d.soldiers) parts.push(`+${d.soldiers} ⚔️`);
      if (d.floors) parts.push(`+${d.floors} 🏰`);
      pushFloat(top, `منحة المعلم ${parts.join(' ')}`, 'gold');
      celebrateTeam(ev.teamId, 2.4);
      const fx: FxItem[] = [{ id: ++fxSeq, node: <LightPillarFx position={teamPos(ev.teamId)} /> }];
      return { fx, durationMs: 1600 };
    }

    case 'teacher-penalty': {
      const c = teamPos(ev.teamId);
      const fx: FxItem[] = [{ id: ++fxSeq, node: <SkyStrikeFx position={c} /> }];
      burstDebris({ x: c.x, y: 3, z: c.z }, 18, 1.3);
      shakeScreen(0.45, 0.35);
      const d = ev.delta;
      const parts: string[] = [];
      if (d.gold) parts.push(`${d.gold} 🪙`);
      if (d.stones) parts.push(`${d.stones} 🪨`);
      if (d.soldiers) parts.push(`${d.soldiers} ⚔️`);
      if (d.floors) parts.push(`${d.floors} 🏰`);
      pushFloat({ x: c.x, y: 5, z: c.z }, `جزاء المعلم ${parts.join(' ')}`, 'red');
      return { fx, durationMs: 1500 };
    }

    case 'victory-declared': {
      const c = teamPos(ev.winnerTeamId);
      burstSparkle({ x: c.x, y: 3, z: c.z }, 30, 2);
      burstPillar(c, 30);
      celebrateTeam(ev.winnerTeamId, 4);
      const fx: FxItem[] = [{ id: ++fxSeq, node: <LightPillarFx position={c} /> }];
      return { fx, durationMs: 2000 };
    }

    case 'correct-answer': {
      celebrateTeam(ev.teamId, 1.6);
      return noFx;
    }

    default:
      // turn-changed / question-shown / wrong-answer / convoy-moved / settings-changed / game-saved / game-reset
      return noFx;
  }
}
