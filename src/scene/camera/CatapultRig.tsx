/**
 * وضع المنجنيق — منظور شخص أول من سطح قلعة صاحب الدور (catapult.md):
 * - الكاميرا على السطح (يرتفع المنظور مع الطوابق)، تدوير بالفارة (yaw ±150°/pitch)
 *   مع تنعيم تباطؤ 8%. وترتفع/تبتعد العين وتنحدر نقطة النظر كلما طال البرج
 *   (camera/catapult-camera.ts) فيبقى الأفق والميدان الأرضي في الكادر، مع
 *   قاطع أمان يمنع اختراق القبة/الطوابق.
 * - عداد قوة ثلاثي الأبعاد بجانب المنجنيق (شريط يمتلئ ذهبي→برتقالي→أحمر).
 * - ليزر نقطة سقوط اختياري (الإعدادات): مسار متقطع متحرك + علامة هبوط نابضة
 *   عبر computeTrajectory من المحرك.
 * - نمط «الضغط المطوّل»: ضغطة يسرى مطوّلة تشحن 1.2ث والإفلات يطلق عبر
 *   engineApi.fireCatapult. نمط «المقبض»: الواجهة تقود القوة وتستدعي fireFromBridge.
 * - الزر الأيمن / Esc يلغي عبر engineApi.cancelCatapult (الواجهة تعالج Esc أيضًا).
 *
 * ملاحظة: تحديث BufferGeometry لليزر داخل useFrame نمط R3F قياسي —
 * لذا قاعدة immutability معطّلة في هذا الملف فقط.
 */
/* eslint-disable react-hooks/immutability */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { engineApi, useGameStore, computeTrajectory, catapultOrigin } from '@/engine';
import { getCatapultPowerForTeam } from '@/engine/store';
import type { CatapultTarget, Vec3 } from '@/contracts/types';
import { fireFromBridge, recordLastShot, setAim, setCatapultBaseYaw, setCatapultYaw, setCharging, setPower, useSceneBridge } from '../bridge';
import { teamCastlePos, catapultPlatformWorld, roofHeight } from '../layout';
import { resolveAimTarget } from '../aim';
import { applyGestureAim, nearestEquivalentAngle, normalizeAngle } from './gesture';
import { catapultCameraProfile, catapultLookPoint, clampAboveDome } from './catapult-camera';

/** موضع منصة المنجنيق العالمي (يطابق إزاحة CatapultModel داخل Castle — أمام القبة جهة المركز) */
function catapultPlatformPos(castlePos: Vec3, topY: number): THREE.Vector3 {
  const p = catapultPlatformWorld(castlePos, topY);
  return new THREE.Vector3(p.x, p.y, p.z);
}

const YAW_RANGE = THREE.MathUtils.degToRad(150); // نمط hold فقط (موضع المؤشر) — نمطا slider/gesture بدوران كامل 360°
const CHARGE_TIME = 1.2; // ثانية

/** عداد القوة ثلاثي الأبعاد بجانب المنجنيق */
function PowerGauge({ position, yaw }: { position: [number, number, number]; yaw: number }) {
  const fill = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshBasicMaterial>(null!);
  const gold = useMemo(() => new THREE.Color('#F5D76E'), []);
  const red = useMemo(() => new THREE.Color('#D64545'), []);
  useFrame(() => {
    const p = useSceneBridge.getState().power;
    if (fill.current) {
      fill.current.scale.y = Math.max(0.02, p);
      fill.current.position.y = (p * 2.2) / 2;
    }
    if (matRef.current) matRef.current.color.copy(gold).lerp(red, p);
  });
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {/* إطار */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.22, 2.3, 0.22]} />
        <meshBasicMaterial color="#2E1B0E" transparent opacity={0.55} />
      </mesh>
      <mesh ref={fill} position={[0, 0.05, 0]}>
        <boxGeometry args={[0.16, 2.2, 0.16]} />
        <meshBasicMaterial ref={matRef} color="#F5D76E" />
      </mesh>
    </group>
  );
}

export default function CatapultRig() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const phase = useGameStore((s) => s.state.phase);
  const active = phase === 'catapult';
  const laserEnabled = useGameStore((s) => s.state.settings.catapult.laserEnabled);
  const powerMode = useGameStore((s) => s.state.settings.catapult.powerMode);

  const aim = useRef({
    yaw: 0, pitch: 0.55,
    targetYaw: 0, targetPitch: 0.55,
    baseYaw: 0,
    power: 0,
    charging: false,
    origin: new THREE.Vector3(),
    roofPos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    lastTargetJson: '',
    lastTarget: null as CatapultTarget | null,
  });

  // تهيئة عند الدخول
  useEffect(() => {
    if (!active) return;
    const s = useGameStore.getState().state;
    const team = s.teams[s.turnIndex];
    if (!team) return;
    const idx = s.teams.indexOf(team);
    const origin = catapultOrigin(team, idx, s.teams.length);
    aim.current.origin.set(origin.x, origin.y, origin.z);
    // الكاميرا فوق منصة المنجنيق (أمام القبة جهة ساحة المعركة، وفوق مستوى
    // قمتها ~topY+2.8 دائمًا حتى لا تدخل القبة مجال الرؤية السفلي لأي قلعة)
    const castle = teamCastlePos(s, team.id);
    const top = roofHeight(team); // castleTopHeight — نفس حساب بناء القلعة
    const platform = catapultPlatformPos(castle, top);
    aim.current.roofPos.set(platform.x, platform.y + 2.7, platform.z);
    aim.current.look.copy(aim.current.roofPos);
    // التصويب الابتدائي نحو مركز الخريطة (باتفاقية computeTrajectory: 0 = +X عكس عقارب الساعة)
    aim.current.baseYaw = Math.atan2(-origin.z, -origin.x);
    aim.current.yaw = aim.current.targetYaw = aim.current.baseYaw;
    aim.current.pitch = aim.current.targetPitch = 0.55;
    aim.current.power = 0;
    aim.current.charging = false; // إصلاح دمج: إلغاء الوضع أثناء الشحن كان يترك العلم مرفوعًا
    setAim(0, aim.current.yaw, aim.current.pitch, null, null);
    // مرجع دوران مجسم المنجنيق (CatapultModel) — يدور بمقدار (baseYaw − aimYaw)
    setCatapultBaseYaw(aim.current.baseYaw);
    // نمطا slider/gesture: القوة الابتدائية = آخر قوة محفوظة للمجموعة
    // (ذاكرة المقبض)، ومقبض الالتفاف السفلي يبدأ من اتجاه المركز
    if (powerMode !== 'hold') {
      setPower(getCatapultPowerForTeam(team.id) / 100);
      setCatapultYaw(aim.current.baseYaw);
    }
  }, [active, powerMode]);

  // إدخال الفارة
  useEffect(() => {
    if (!active) return;
    const el = gl.domElement;
    const a = aim.current;

    const onMove = (e: PointerEvent) => {
      if (powerMode === 'slider') {
        // مقبض الواجهة السفلي يقود الالتفاف عبر الجسر (catapultYaw) —
        // تحريك الفارة لا يؤثر على التصويب إطلاقًا في هذا النمط
        return;
      }
      if (powerMode === 'gesture') {
        // «المقابض بالإيماء»: يمين/يسار يلف المنجنيق، فوق/أسفل يغيّر القوة
        const br = useSceneBridge.getState();
        // الإصلاح: قُلبت إشارة movementX — تحريك الفارة يمينًا يلف المنجنيق
        // يمينًا (من منظور اللاعب) بدل العكس. ولا تثبيت زاوي هنا: دورة كاملة
        // 360° (تُدفع للواجهة مطبَّعة modulo 2π للعرض فقط).
        const next = applyGestureAim(a.targetYaw, br.power, e.movementX, e.movementY);
        a.targetYaw = next.yaw;
        setCatapultYaw(normalizeAngle(next.yaw));
        setPower(next.power);
        return;
      }
      const nx = (e.clientX / window.innerWidth) * 2 - 1; // -1..1
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      a.targetYaw = a.baseYaw + nx * YAW_RANGE;
      a.targetPitch = THREE.MathUtils.clamp(0.62 - ny * 0.5, 0.12, 1.15);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0 && powerMode === 'hold') {
        a.charging = true;
        a.power = 0;
        setCharging(true);
      } else if (e.button === 0) {
        // نمطا «المقبض المتحرك» و«الإيماء»: نقرة يسرى = إطلاق فوري بقوة المقبض
        fireFromBridge();
      } else if (e.button === 2) {
        engineApi.cancelCatapult();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.button === 0 && a.charging) {
        a.charging = false;
        setCharging(false);
        // الإفلات = إطلاق
        fireFromBridge(a.power);
        a.power = 0;
      }
    };
    const onCtx = (e: Event) => e.preventDefault();

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('contextmenu', onCtx);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('contextmenu', onCtx);
      setCharging(false);
    };
  }, [active, gl, powerMode]);

  // المسار الحالي لليزر
  const laserRef = useRef<{ points: THREE.Vector3[]; landing: THREE.Vector3 | null }>({ points: [], landing: null });
  const landingMarker = useRef<THREE.Group>(null!);
  // في نمطي slider/gesture يُعرض قوس التصويب دائمًا (يقودان عبر المقابض
  // لا مؤشر الفارة)، وفي hold يتبع مقبض الإعدادات laserEnabled
  const showAimGuide = laserEnabled || powerMode === 'slider' || powerMode === 'gesture';

  useFrame((_, dt) => {
    if (!active) return;
    const a = aim.current;
    // تنعيم مبني على الزمن (ثابت مهما كان معدل الإطارات) — بأقرب مكافئ زاوي
    // حتى لا يلفّ التصويب لفة طويلة عند عبور حد ±π مع الدوران الكامل 360°
    const kAim = 1 - Math.exp(-dt * 5);
    a.yaw = THREE.MathUtils.lerp(a.yaw, nearestEquivalentAngle(a.targetYaw, a.yaw), kAim);
    a.pitch = THREE.MathUtils.lerp(a.pitch, a.targetPitch, kAim);
    if (a.charging) a.power = Math.min(1, a.power + dt / CHARGE_TIME);

    // في نمطي المقبض/الإيماء: القوة تأتي من الجسر (الواجهة/الإيماء تقودها)
    const bridge = useSceneBridge.getState();
    const power = powerMode === 'hold' ? a.power : bridge.power;
    // في نمط المقبض: الالتفاف من مقبض الواجهة السفلي عبر الجسر فقط
    if (powerMode === 'slider') a.targetYaw = bridge.catapultYaw;

    // الكاميرا: من سطح القلعة باتجاه التصويب (دخول سينمائي ناعم + تثبيت)
    // ملاحظة: عين الكاميرا شبه مستوية (~40% سماء/أفق، 60% ميدان — catapult.md)
    // بينما المسار والليزر يستخدمان زاوية الرمي الكاملة.
    const yawThree = Math.PI / 2 - a.yaw; // من اتفاقية computeTrajectory لاتجاه three
    const camPitch = a.pitch * 0.2;
    const dir = new THREE.Vector3(Math.sin(yawThree) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(yawThree) * Math.cos(camPitch));
    // عند التصويب بزاوية عالية نرفع العين ونرجعها قليلًا للخلف-الأعلى حتى لا يحجب
    // مجسم المنجنيق خط النظر (مع خفوت المجسم نفسه — انظر CatapultModel).
    const highAim = Math.max(0, a.pitch - 0.45);
    // تكيّف مع طول البرج: كل طابق إضافي يرجع العين ويرفعها ويُنحدر النظر
    // نحو الميدان (catapultCameraProfile) فيبقى الأفق والأهداف الأرضية ظاهرة
    const st = useGameStore.getState().state;
    const me = st.teams[st.turnIndex];
    const prof = catapultCameraProfile(me?.castle.floors.length ?? 0);
    const rawPos = a.roofPos.clone().addScaledVector(dir, -(prof.back + highAim * 1.6)).add(new THREE.Vector3(0, prof.lift + highAim * 1.7, 0));
    // قاطع أمان: لا تخترق العين القبة/الطوابق مهما كان اتجاه التصويب
    const castleCenter = me ? teamCastlePos(st, me.id) : { x: a.roofPos.x, y: 0, z: a.roofPos.z };
    const safe = clampAboveDome({ x: rawPos.x, y: rawPos.y, z: rawPos.z }, castleCenter, me ? roofHeight(me) : 4);
    const camPos = new THREE.Vector3(safe.x, safe.y, safe.z);
    const dist = camera.position.distanceTo(camPos);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * (dist > 3 ? 2.6 : 10)));
    // نقطة النظر: أمام العين ومنحدرٌة نحو الميدان بمقدار طول البرج
    const look = catapultLookPoint(safe, { x: dir.x, y: 0, z: dir.z }, prof);
    a.look.lerp(new THREE.Vector3(look.x, look.y, look.z), 1 - Math.exp(-dt * 6));
    camera.lookAt(a.look);

    // حساب المسار والهدف
    const originV: Vec3 = { x: a.origin.x, y: a.origin.y, z: a.origin.z };
    const effPower = Math.max(0.12, power) * 100;
    const traj = computeTrajectory(originV, a.yaw, a.pitch, effPower);
    // حلّ الهدف من المسار نفسه (اختراق برج القلعة يحدد الطابق من ارتفاع التقاطع)
    const rawTarget = resolveAimTarget(useGameStore.getState().state, traj.landing, traj.points);
    // ثبّت مرجع الهدف لتفادي إعادة رسم المشتركين كل إطار
    const json = JSON.stringify(rawTarget);
    if (json !== a.lastTargetJson) {
      a.lastTargetJson = json;
      a.lastTarget = rawTarget;
    }
    laserRef.current.points = traj.points.filter((_, i) => i % 2 === 0).map((p) => new THREE.Vector3(p.x, p.y, p.z));
    laserRef.current.landing = new THREE.Vector3(traj.landing.x, traj.landing.y, traj.landing.z);
    setAim(power, a.yaw, a.pitch, traj.landing, a.lastTarget);
    if (a.charging) {
      // سجّل المسار باستمرار أثناء الشحن ليكون آخر مسار جاهزًا للمطاردة
      recordLastShot({ origin: originV, landing: traj.landing, points: traj.points, at: Date.now() });
    }

    if (landingMarker.current && showAimGuide) {
      landingMarker.current.position.set(traj.landing.x, 0.15, traj.landing.z);
    }
  });

  if (!active) return null;

  const s = useGameStore.getState().state;
  const team = s.teams[s.turnIndex];
  const castle = team ? teamCastlePos(s, team.id) : { x: 0, y: 0, z: 0 };
  const gaugePos = team ? catapultPlatformPos(castle, roofHeight(team)) : null;

  return (
    <group>
      {/* عداد القوة بجانب منصة المنجنيق */}
      {team && gaugePos && <PowerGauge position={[gaugePos.x + 1.4, gaugePos.y, gaugePos.z + 1.2]} yaw={0} />}
      {/* الليزر الاختياري */}
      {showAimGuide && laserRef.current.points.length > 1 && (
        <group>
          <LaserLine pointsRef={laserRef} />
          <group ref={landingMarker}>
            <BreathingRing />
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.3, 12]} />
              <meshBasicMaterial color="#FFFFFF" depthWrite={false} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
}

/** حلقة هبوط نابضة (scale 1↔1.1 كل ثانية) */
function BreathingRing() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * Math.PI * 2) * 0.1);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.0, 1.5, 28]} />
      <meshBasicMaterial color="#FFF3C4" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

/** خط المسار المتقطع — BufferGeometry بسعة ثابتة تُحدَّث كل إطار */
const MAX_LASER_POINTS = 160;

function LaserLine({ pointsRef }: { pointsRef: React.RefObject<{ points: THREE.Vector3[] }> }) {
  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LASER_POINTS * 3), 3));
    const mat = new THREE.LineDashedMaterial({ color: '#FFF3C4', dashSize: 0.7, gapSize: 0.5, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    return line;
  }, []);

  useFrame(() => {
    const pts = pointsRef.current?.points ?? [];
    const n = Math.min(pts.length, MAX_LASER_POINTS);
    const attr = lineObj.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) attr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
    lineObj.geometry.setDrawRange(0, n);
    attr.needsUpdate = true;
    lineObj.computeLineDistances();
  });

  return <primitive object={lineObj} />;
}
