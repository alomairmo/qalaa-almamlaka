/**
 * مدير الكاميرا — أوضاع design.md §6 / الوثيقة §10:
 * - overview (2.5D): زاوية 45° ترى الخريطة كاملة + انجراف خامل لطيف.
 * - turn-follow: طوال طور 'action' تؤطّر الكاميرا قلعة صاحب الدور كاملة
 *   (تأطير ديناميكي من bounding sphere: القلعة + الجنود الخارجيون + الأكوام).
 * - army: مبتعدة أعلى تكشف الخريطة كلها.
 * - catapult: يقودها CatapultRig (هنا فقط طيران الدخول/الخروج).
 * - freeCamera: WASD + عجلة تقريب + زر أيمن وسحب.
 * - chase: مهمة مؤقتة من جسر المشهد (ملاحقة القذيفة) ثم عودة.
 * - focus-entity: لقطة مركزة قصيرة (بناء طابق/تجنيد جندي) يطلبها مشغّل الأحداث.
 * - اهتزاز الشاشة من جسر المشهد (يُعطَّل مع prefers-reduced-motion).
 * - prefers-reduced-motion: تُلغى الحركات التلقائية (تأطير الدور واللقطات المركزة).
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useGameStore } from '@/engine';
import { setCameraJob, useSceneBridge } from '../bridge';
import { usePrefersReducedMotion } from '../palette';
import { CAMERA_AZIMUTH, castleFrameSphere, frameDistance, FRAME_MARGIN } from '../layout';

type CamMode = 'overview' | 'army' | 'catapult' | 'free' | 'chase';

const OVERVIEW_POS = new THREE.Vector3(58, 62, 58);
const OVERVIEW_LOOK = new THREE.Vector3(0, 0, 0);
const ARMY_POS = new THREE.Vector3(0, 88, 80);
/** ارتفاع نظرة كاميرا الدور (~35°) — قريبة من إحساس المنظور العام */
const FOLLOW_ELEVATION = 0.62;

/**
 * مفاتيح الحركة بالكود الفيزيائي لا بالحرف — لوحة عربية/RTL تجعل e.key
 * حرفًا عربيًا (ص/ش/س/ي) فتتعطل WASD؛ e.code ثابت مهما كان التخطيط.
 */
const KEY_CODE_MAP: Record<string, string> = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd',
};

/** تدوير متجه حول محور Y بزاوية a (اتفاقية three) */
function rotateY(v: THREE.Vector3, a: number): THREE.Vector3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = v.x * c + v.z * s;
  const z = -v.x * s + v.z * c;
  v.x = x;
  v.z = z;
  return v;
}

/** اتجاه النظر من الهدف نحو الكاميرا (ربع +x,+z كالمنظور العام) بزاوية ارتفاع */
function viewOffsetDir(elevation: number, out: THREE.Vector3): THREE.Vector3 {
  const ch = Math.cos(elevation);
  return out.set(Math.cos(CAMERA_AZIMUTH) * ch, Math.sin(elevation), Math.sin(CAMERA_AZIMUTH) * ch);
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const phase = useGameStore((s) => s.state.phase);
  const reduced = usePrefersReducedMotion();

  const mode: CamMode = phase === 'army' ? 'army' : phase === 'catapult' ? 'catapult' : phase === 'freeCamera' ? 'free' : 'overview';

  // حالة داخلية للكاميرا (لا setState — تُحرَّك كل إطار)
  const ctrl = useRef({
    look: OVERVIEW_LOOK.clone(),
    freeYaw: Math.PI / 4,
    freePitch: 0.75,
    freeDist: 90,
    freeTarget: new THREE.Vector3(0, 0, 0),
    keys: new Set<string>(),
    dragging: false,
    tweening: false,
    /** دوران المستخدم حول القلعة المؤطَّرة (زر أيمن + سحب) وتقريب العجلة */
    orbitYaw: 0,
    orbitDist: 1,
    orbiting: false,
  });
  // آخر وضع كاميرا صالح — يستعيده حارس NaN إن تسمّم الموضع/الهدف
  const lastGood = useRef({ pos: OVERVIEW_POS.clone(), look: OVERVIEW_LOOK.clone() });
  // مرجع حي للطور/الوضع تستخدمه معالجات الأحداث (خارج دورة الرسم)
  const live = useRef({ mode, phase });
  live.current = { mode, phase };

  /** هل الدوران اليدوي حول القلعة متاح الآن؟ (تأطير دور أو لقطة تركيز) */
  const orbitAllowed = (): boolean => {
    const l = live.current;
    if (l.mode !== 'overview') return false;
    if (l.phase === 'action') return true;
    const job = useSceneBridge.getState().cameraJob;
    return job !== null && (job.kind === 'focus' || job.kind === 'focus-entity');
  };

  /** طيران سلس إلى وضع */
  const flyTo = (pos: THREE.Vector3, look: THREE.Vector3, duration = 1.1) => {
    const c = ctrl.current;
    c.tweening = true;
    gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration, ease: 'power3.inOut' });
    gsap.to(c.look, {
      x: look.x, y: look.y, z: look.z, duration, ease: 'power3.inOut',
      onComplete: () => { c.tweening = false; },
    });
  };

  // انتقالات الأوضاع
  const prevMode = useRef<CamMode>('overview');
  useEffect(() => {
    if (mode === prevMode.current) return;
    const from = prevMode.current;
    prevMode.current = mode;
    if (mode === 'overview') {
      flyTo(OVERVIEW_POS, OVERVIEW_LOOK, from === 'catapult' ? 0.9 : 1.1);
    } else if (mode === 'army') {
      flyTo(ARMY_POS, OVERVIEW_LOOK, 1.0);
    }
    // catapult: CatapultRig يقود الغطس (lerp سلس من الموضع الحالي)
    // free: لا طيران — يتولى المستخدم
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // عند مغادرة طور 'action' يعود التأطير للمنظور العام بطيران سلس
  // (الدخول إلى 'action' لا يحتاج flyTo — تأطير الدور يسير بالـ lerp كل إطار)
  const prevPhase = useRef(phase);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (prev === 'action' && phase !== 'action' && mode === 'overview') {
      flyTo(OVERVIEW_POS, OVERVIEW_LOOK, 1.0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode]);

  // إدخال الكاميرا الحرة
  useEffect(() => {
    if (mode !== 'free') return;
    const el = gl.domElement;
    const c = ctrl.current;
    // التقط الحالة الحالية كبداية
    c.freeTarget.copy(c.look);
    c.freeDist = camera.position.distanceTo(c.look);
    c.freeYaw = Math.atan2(camera.position.x - c.look.x, camera.position.z - c.look.z);
    c.freePitch = Math.acos(THREE.MathUtils.clamp((camera.position.y - c.look.y) / (c.freeDist || 1), -1, 1));

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      // e.code: ثابت فيزيائيًا (WASD تعمل حتى بلوحة عربية/RTL)
      const k = KEY_CODE_MAP[e.code] ?? e.key.toLowerCase();
      if (KEY_CODE_MAP[e.code]) e.preventDefault(); // الأسهم لا تمرّر الصفحة
      if (down) c.keys.add(k); else c.keys.delete(k);
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      c.freeDist = THREE.MathUtils.clamp(c.freeDist * (1 + Math.sign(e.deltaY) * 0.08), 12, 160);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) c.dragging = true;
    };
    const onUp = () => (c.dragging = false);
    const onMove = (e: PointerEvent) => {
      if (!c.dragging) return;
      c.freeYaw -= e.movementX * 0.005;
      c.freePitch = THREE.MathUtils.clamp(c.freePitch + e.movementY * 0.004, 0.15, 1.45);
    };
    const onCtx = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    el.addEventListener('contextmenu', onCtx);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      el.removeEventListener('contextmenu', onCtx);
    };
  }, [mode, gl, camera]);

  const chaseState = useRef({ lastJobId: 0 });

  // دوران يدوي حول القلعة المؤطَّرة: زر أيمن + سحب أثناء تأطير دور المجموعة
  // أو أثناء لقطات التركيز (focus/focus-entity)؛ العجلة تقريب ضمن حدود.
  // عند انتهاء الدور يعود الطور للمنظور العام (flyTo في تأثير الطور أعلاه)
  // ويُصفَّر الانزياح تلقائيًا في useFrame.
  useEffect(() => {
    const el = gl.domElement;
    const c = ctrl.current;
    const onDown = (e: PointerEvent) => {
      if (e.button === 2 && orbitAllowed()) {
        c.orbiting = true;
        e.preventDefault();
      }
    };
    const onUp = () => (c.orbiting = false);
    const onMove = (e: PointerEvent) => {
      if (!c.orbiting) return;
      c.orbitYaw -= e.movementX * 0.006;
    };
    const onWheel = (e: WheelEvent) => {
      if (!orbitAllowed()) return;
      e.preventDefault();
      c.orbitDist = THREE.MathUtils.clamp(c.orbitDist * (1 + Math.sign(e.deltaY) * 0.09), 0.55, 1.9);
    };
    const onCtx = (e: Event) => {
      if (orbitAllowed() || live.current.mode === 'overview') e.preventDefault();
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onCtx);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onCtx);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useFrame(({ clock }, dt) => {
    const c = ctrl.current;
    const bridge = useSceneBridge.getState();
    const t = clock.elapsedTime;

    // ─── حارس NaN للكاميرا ───
    // NaN في position/lookAt يكسر مصفوفة العرض فيختفي المشهد كله (شاشة بنية)
    // **بلا استثناء** ولا يتعافى (lerp نحو هدف NaN يبقي الموضع NaN دائمًا).
    // عند رصد تلوث: استعد آخر وضع صالح، أوقف كل tween، وألغِ المهمة المسمومة.
    const pos = camera.position;
    const poisoned =
      !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z) ||
      !Number.isFinite(c.look.x) || !Number.isFinite(c.look.y) || !Number.isFinite(c.look.z);
    if (poisoned) {
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(c.look);
      c.tweening = false;
      if (bridge.cameraJob) setCameraJob(null);
      pos.copy(lastGood.current.pos);
      c.look.copy(lastGood.current.look);
      camera.lookAt(c.look);
      return;
    }
    // خزّن الوضع الصالح باستمرار ليستعيده الحارس عند الحاجة
    lastGood.current.pos.copy(pos);
    lastGood.current.look.copy(c.look);

    // مهمة مطاردة القذيفة لها الأولوية القصوى
    const job = bridge.cameraJob;
    if (job && job.startedAt !== chaseState.current.lastJobId) {
      chaseState.current.lastJobId = job.startedAt;
    }
    // عودة سلسة بعد انتهاء المهمة (في طور التصرف يستأنف تأطير الدور بنفسه)
    if (!job && chaseState.current.lastJobId !== 0) {
      chaseState.current.lastJobId = 0;
      if (mode === 'overview' && phase !== 'action') flyTo(OVERVIEW_POS, OVERVIEW_LOOK, 0.9);
    }
    // إعادة ضبط انزياح الدوران اليدوي تدريجيًا خارج سياقه (انتهى الدور/التركيز)
    if (!orbitAllowed() && (c.orbitYaw !== 0 || c.orbitDist !== 1)) {
      c.orbitYaw *= Math.exp(-dt * 4);
      c.orbitDist += (1 - c.orbitDist) * Math.min(1, dt * 4);
      if (Math.abs(c.orbitYaw) < 0.01) c.orbitYaw = 0;
      if (Math.abs(c.orbitDist - 1) < 0.01) c.orbitDist = 1;
    }
    if (job) {
      const p = Math.min(1, (performance.now() - job.startedAt) / job.durationMs);
      if (job.kind === 'focus') {
        // رحلة تركيز استعراضية نحو قلعة (نقر بطاقة فريق): اقتراب ناعم ثم انتهاء ذاتي.
        // الاقتراب من جهة النوافذ (اتجاه الكاميرا العامة 45° — CAMERA_AZIMUTH)
        // لا من جهة مركز الخريطة، حتى تظهر الواجهة لا ظهر القلعة، لكل القلاع.
        // الزر الأيمن + سحب يدور حول القلعة أثناء التركيز، والعجلة تقرّب.
        const target = job.points[0];
        if (target) {
          const k = 1 - Math.exp(-dt * 3.2);
          const look = new THREE.Vector3(target.x, 5, target.z);
          const dir = rotateY(viewOffsetDir(0.55, new THREE.Vector3()), c.orbitYaw);
          const camPos = look.clone().addScaledVector(dir, 32 * c.orbitDist);
          camera.position.lerp(camPos, k);
          c.look.lerp(look, k);
          camera.lookAt(c.look);
        }
        if (p >= 1) setCameraJob(null);
        return;
      }
      if (job.kind === 'focus-entity') {
        // لقطة مركزة مؤقتة (بناء طابق/تجنيد جندي) — تُفرج تلقائيًا بعد durationMs.
        // أوضاع المنجنيق/الجيش/الحرة لها أولوية: لا نختطف الكاميرا منها،
        // ومع prefers-reduced-motion تُلغى اللقطة (لا حركة تلقائية).
        // الزر الأيمن + سحب يدور حول نقطة التركيز، والعجلة تقرّب.
        if (mode !== 'overview' || reduced) {
          setCameraJob(null);
          return;
        }
        const target = job.points[0];
        if (target) {
          const persp = camera as THREE.PerspectiveCamera;
          const aspect = persp.isPerspectiveCamera ? persp.aspect : 16 / 9;
          const dist = frameDistance(job.radius ?? 3, persp.fov || 40, aspect, FRAME_MARGIN) * c.orbitDist;
          const dir = rotateY(viewOffsetDir(0.45, new THREE.Vector3()), c.orbitYaw);
          const look = new THREE.Vector3(target.x, target.y, target.z);
          const camPos = look.clone().addScaledVector(dir, dist);
          const k = 1 - Math.exp(-dt * 4.2);
          camera.position.lerp(camPos, k);
          c.look.lerp(look, k);
          camera.lookAt(c.look);
        }
        if (p >= 1) setCameraJob(null);
        return;
      }
      const pts = job.points;
      if (pts.length > 1) {
        const fi = p * (pts.length - 1);
        const i = Math.min(pts.length - 2, Math.floor(fi));
        const f = fi - i;
        const cur = new THREE.Vector3(pts[i].x, pts[i].y, pts[i].z).lerp(new THREE.Vector3(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z), f);
        // الكاميرا خلف القذيفة وفوقها قليلًا
        const back = new THREE.Vector3(pts[Math.max(0, i - 3)].x, pts[Math.max(0, i - 3)].y, pts[Math.max(0, i - 3)].z);
        const camPos = cur.clone().lerp(back, 0.35).add(new THREE.Vector3(0, 3.5, 0));
        camera.position.lerp(camPos, 0.25);
        camera.lookAt(cur);
      }
      if (p >= 1) {
        // انتهت المطاردة — يمسحها مشغّل الأحداث
      }
      return;
    }

    if (c.tweening) {
      camera.lookAt(c.look);
      return;
    }

    if (mode === 'overview') {
      if (phase === 'action' && !reduced) {
        // تأطير الدور الديناميكي: قلعة صاحب الدور كاملة + جنودها الخارجيين
        // + الأكوام المجاورة. الكرة المحيطة تُعاد حسابها كل إطار، فإن تغيّر
        // الحجم أثناء الجولة (طابق جديد مثلًا) تكيّف الـ lerp بسلاسة.
        const s = useGameStore.getState().state;
        const team = s.teams[s.turnIndex];
        if (team) {
          const frame = castleFrameSphere(s, team.id);
          const persp = camera as THREE.PerspectiveCamera;
          const aspect = persp.isPerspectiveCamera ? persp.aspect : 16 / 9;
          const dist = frameDistance(frame.radius, persp.fov || 40, aspect, FRAME_MARGIN) * c.orbitDist;
          const look = new THREE.Vector3(frame.center.x, frame.center.y, frame.center.z);
          // دوران المستخدم اليدوي (زر أيمن + سحب) حول القلعة المؤطَّرة
          const dir = rotateY(viewOffsetDir(FOLLOW_ELEVATION, new THREE.Vector3()), c.orbitYaw);
          const camPos = look.clone().addScaledVector(dir, dist);
          const k = 1 - Math.exp(-dt * 2.4);
          camera.position.lerp(camPos, k);
          c.look.lerp(look, k);
          camera.lookAt(c.look);
        }
      } else {
        // انجراف خامل ±2° على مدار 30 ثانية
        const sway = reduced ? 0 : Math.sin((t / 30) * Math.PI * 2) * THREE.MathUtils.degToRad(2);
        const r = Math.hypot(OVERVIEW_POS.x, OVERVIEW_POS.z);
        const a = Math.atan2(OVERVIEW_POS.z, OVERVIEW_POS.x) + sway;
        camera.position.set(Math.cos(a) * r, OVERVIEW_POS.y, Math.sin(a) * r);
        camera.lookAt(OVERVIEW_LOOK);
      }
    } else if (mode === 'army') {
      camera.position.lerp(ARMY_POS, 0.05);
      c.look.lerp(OVERVIEW_LOOK, 0.05);
      camera.lookAt(c.look);
    } else if (mode === 'free') {
      // WASD تحريك الهدف
      const speed = 0.9;
      const fwd = new THREE.Vector3(Math.sin(c.freeYaw), 0, Math.cos(c.freeYaw)).multiplyScalar(-1);
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      if (c.keys.has('w')) c.freeTarget.addScaledVector(fwd, speed);
      if (c.keys.has('s')) c.freeTarget.addScaledVector(fwd, -speed);
      if (c.keys.has('a')) c.freeTarget.addScaledVector(right, -speed);
      if (c.keys.has('d')) c.freeTarget.addScaledVector(right, speed);
      c.freeTarget.x = THREE.MathUtils.clamp(c.freeTarget.x, -60, 60);
      c.freeTarget.z = THREE.MathUtils.clamp(c.freeTarget.z, -60, 60);
      const sp = Math.sin(c.freePitch);
      camera.position.set(
        c.freeTarget.x + Math.sin(c.freeYaw) * sp * c.freeDist,
        c.freeTarget.y + Math.cos(c.freePitch) * c.freeDist,
        c.freeTarget.z + Math.cos(c.freeYaw) * sp * c.freeDist,
      );
      camera.lookAt(c.freeTarget);
      c.look.copy(c.freeTarget);
    }
    // catapult: يقوده CatapultRig

    // اهتزاز الشاشة
    if (!reduced && bridge.shake.until > performance.now() && bridge.shake.amplitude > 0) {
      const amp = bridge.shake.amplitude;
      camera.position.x += (Math.random() - 0.5) * amp;
      camera.position.y += (Math.random() - 0.5) * amp * 0.6;
      camera.position.z += (Math.random() - 0.5) * amp;
    }
  });

  // FOV 40 ثابت (punch أثناء المطاردة)
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera && persp.fov !== 40) {
      persp.fov = 40;
      persp.updateProjectionMatrix();
    }
  }, [camera]);

  const job = useSceneBridge((s) => s.cameraJob);
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    if (!persp.isPerspectiveCamera) return;
    gsap.to(persp, { fov: job ? 48 : 40, duration: 0.4, onUpdate: () => persp.updateProjectionMatrix() });
  }, [job, camera]);

  // وضع المنجنيق يقود الكاميرا بنفسه — لا نفعل شيئًا هناك

  return null;
}
