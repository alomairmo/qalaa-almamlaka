/**
 * جسر المشهد ↔ الواجهة (zustand صغير داخل نطاق src/scene).
 *
 * لماذا؟ عقود المحرك مجمّدة ولا تحوي قناة لحالة التصويب/القوة أو اختيار هدف
 * الجيش، فهذه الحالات «عرضية» وتعيش في المشهد، وتحتاجها الواجهة (HUD) لتعرض
 * عداد القوة وتفتح نافذة الإرسال. لا يُستخدم هذا الجسر لحالة اللعب نفسها
 * (تلك في useGameStore).
 *
 * ما تحتاجه الواجهة من هنا:
 * - catapult: power/aimTarget/charging/aimPoint — لعرض عداد القوة وزر الإطلاق
 *   في نمط «المقبض» (تستدعي fireFromBridge()).
 * - armyTarget: الهدف الذي نقره اللاعب في وضع الجيش — الواجهة تفتح نافذة
 *   الإرسال ثم تستدعي engineApi.dispatchArmy وتصفّر armyTarget.
 */
import { create } from 'zustand';
import type { ArmyTarget, CatapultTarget, Vec3 } from '@/contracts/types';
import { engineApi, useGameStore, computeTrajectory, catapultOrigin } from '@/engine';
import { resolveTargetPosition, teamCastlePos, pileScenePosition } from './layout';

export interface FloatText {
  id: string;
  position: Vec3;
  text: string;
  color: 'red' | 'gold' | 'gray' | 'green' | 'white';
}

/** مهمة كاميرا مؤقتة (مطاردة قذيفة / طيران تركيز / لقطة كيان مركزة) يقرؤها CameraRig */
export interface CameraJob {
  /**
   * chase: ملاحقة قذيفة على مسار. focus: رحلة استعراضية نحو قلعة (نقر بطاقة فريق).
   * focus-entity: لقطة مركزة قصيرة على كيان (طابق جديد/جندي جديد) تُفرج تلقائيًا
   * بعد durationMs — يطلبها مشغّل الأحداث أثناء أنيميشن البناء/التجنيد.
   */
  kind: 'chase' | 'focus' | 'focus-entity';
  /** نقاط المسار (chase) أو نقطة التركيز (focus / focus-entity) */
  points: Vec3[];
  /** نصف قطر الهدف التقريبي (focus-entity) — تُشتق منه مسافة الكاميرا لـ FOV=40 */
  radius?: number;
  /** بدأت عند (performance.now) */
  startedAt: number;
  durationMs: number;
}

/**
 * طور مشهد المعركة ثلاثي الأبعاد (يُشغّله مشغّل الأحداث لكل حدث battle-resolved):
 * - marching: جنود المهاجم يخرجون من بوابة قلعتهم ويمشون نحو موقع المعركة.
 * - fighting: اشتباك عند الهدف (تراب + نجوم سيوف + اهتزاز كاميرا). بعد لقطة
 *   القتال الأولية يستمر الاشتباك **في حلقة** داخل المشهد حتى تضبط الواجهة
 *   stickyHold لبطاقة النتائج، ثم ينتقل المشهد للاحتفال/الانكسار حتى
 *   confirmSticky — وكل ذلك يبقى مُشارًا له بـ 'fighting'.
 * - done: انتهى المشهد كاملًا — **لا يُضبط إلا بعد تأكيد البطاقة الثابتة**
 *   (confirmSticky من الواجهة) أو مهلة احتياطية 15ث إن لم تظهر بطاقة أصلًا.
 *   الواجهة تنتظر هذه الإشارة قبل متابعة ما بعد المعركة.
 * التخطي (skipSignal) يقفز إلى done فورًا.
 */
export type BattleFxPhase = 'marching' | 'fighting' | 'done';
export interface BattleFxState {
  /** معرّف حدث المعركة الجاري (أو آخر حدث اكتمل) — null حين لا معركة */
  eventId: string | null;
  phase: BattleFxPhase | null;
}

// ─── عقد البطاقة الثابتة (sticky) — المشهد ↔ الواجهة ───

/** نوع البطاقة الثابتة المعروضة حاليًا في الواجهة */
export type StickyKind = 'recruit' | 'battle' | 'catapult' | 'loot';

/** البطاقة الثابتة المعروضة حاليًا (الواجهة تضبطها عبر setStickyHold، المشهد يقرؤها) */
export interface StickyHold {
  eventId: string;
  kind: StickyKind;
}

/**
 * تأكيد البطاقة الثابتة — القرار النهائي للمزامنة:
 * الواجهة تنادي confirmSticky(eventId) عند ضغط «تأكيد ✓» فتُضبط
 * stickyConfirm = { eventId, at }. المشهد يرصد التأكيد بإحدى طريقتين:
 *   1) stickyConfirm.eventId === eventId المنتظَر (الأساسية)، أو
 *   2) توافقية: stickyHold كانت تشير للحدث ثم صارت null (إغلاق البطاقة = تأكيد).
 * مهلة احتياطية: إن لم تظهر stickyHold للحدث إطلاقًا خلال 15ث من بدء
 * الاحتفال/الكشف يُكمل المشهد تلقائيًا (واجهة قديمة بلا بطاقات).
 */
export interface StickyConfirm {
  eventId: string;
  /** ختم التأكيد (performance.now) */
  at: number;
}

/** طور مشهد قذيفة المنجنيق (لا ينتظر تأكيدًا — ينتهي بعد الأنيميشن) */
export type CatapultFxPhase = 'flying' | 'impact' | 'done';
export interface CatapultFxState {
  eventId: string | null;
  phase: CatapultFxPhase | null;
}

/** آخر رمية منجنيق — تُسجل عند الإطلاق لتلاحقها الكاميرا بمسار مطابق للتصويب */
export interface LastShot {
  origin: Vec3;
  landing: Vec3;
  points: Vec3[];
  at: number;
}

interface SceneBridgeData {
  /** قوة الإطلاق الحالية 0..1 (تُحدَّث كل إطار أثناء الشحن) */
  power: number;
  /** هل الشحن جارٍ (ضغط مطوّل) */
  charging: boolean;
  /** الهدف المقترح تحت المؤشر الحالي (من ليزر/مسار التصويب) */
  aimTarget: CatapultTarget | null;
  /** نقطة السقوط المتوقعة الحالية */
  aimPoint: Vec3 | null;
  /** زاوية التصويب الحالية (للواجهة إن أرادت عرضها) */
  aimYaw: number;
  aimPitch: number;
  /** هدف الجيش المنقور (تقرأه نافذة الإرسال ثم تصفّره) */
  armyTarget: ArmyTarget | null;
  /** نصوص الضرر العائمة فوق المشهد */
  floats: FloatText[];
  /** فرق تحتفل حاليًا (حتى طابع زمني) */
  celebrating: Record<string, number>;
  /** اهتزاز الشاشة: سعة + حتى متى (يستهلكه CameraRig) */
  shake: { amplitude: number; until: number };
  /** مهمة الكاميرا الجارية (مطاردة/تركيز) */
  cameraJob: CameraJob | null;
  /** آخر رمية (للمطاردة) */
  lastShot: LastShot | null;
  /**
   * حالة مشهد المعركة الجاري — تقرؤها الواجهة لتؤخّر بطاقة نتيجة المعركة
   * حتى phase === 'done' لنفس eventId (يبقى 'done' حتى يبدأ الحدث التالي).
   */
  battleFx: BattleFxState;
  /** طور مشهد قذيفة المنجنيق (flying عند catapult-fired، impact عند
   *  projectile-impact، done بعد انتهاء أنيميشن الإصابة — بلا انتظار تأكيد) */
  catapultFx: CatapultFxState;
  /** البطاقة الثابتة المعروضة حاليًا (تضبطها الواجهة، يقرؤها المشهد) */
  stickyHold: StickyHold | null;
  /** آخر تأكيد بطاقة ثابتة (تضبطه confirmSticky — المشهد يقارن eventId) */
  stickyConfirm: StickyConfirm | null;
  /**
   * زاوية التفاف المنجنيق من مقبض الواجهة في نمط slider (راديان، اتفاقية
   * computeTrajectory). دورة كاملة 360°: أي قيمة راديان مقبولة (بلا تثبيت
   * من جهة المشهد) — المشهد يطبّقها مباشرة على التصويب واتجاه المجسم.
   */
  catapultYaw: number;
  /**
   * زاوية الأساس (اتجاه مركز الخريطة من قلعة صاحب الدور) باتفاقية
   * computeTrajectory — يضبطها CatapultRig عند دخول وضع المنجنيق،
   * ويقرؤها CatapultModel ليدور المجسم بمقدار (baseYaw − aimYaw) حول
   * اتجاهه الافتراضي (نحو المركز) فيدعم الدوران الكامل 360°.
   */
  catapultBaseYaw: number;
}

let floatSeq = 0;

export const useSceneBridge = create<SceneBridgeData>(() => ({
  power: 0,
  charging: false,
  aimTarget: null,
  aimPoint: null,
  aimYaw: 0,
  aimPitch: 0.5,
  armyTarget: null,
  floats: [],
  celebrating: {},
  shake: { amplitude: 0, until: 0 },
  cameraJob: null,
  lastShot: null,
  battleFx: { eventId: null, phase: null },
  catapultFx: { eventId: null, phase: null },
  stickyHold: null,
  stickyConfirm: null,
  catapultYaw: 0,
  catapultBaseYaw: 0,
}));

// ─── أوامر من المشهد/الواجهة ───

export function setAim(power: number, yaw: number, pitch: number, point: Vec3 | null, target: CatapultTarget | null): void {
  useSceneBridge.setState({ power, aimYaw: yaw, aimPitch: pitch, aimPoint: point, aimTarget: target });
}

export function setCharging(charging: boolean): void {
  useSceneBridge.setState({ charging });
}

/** إطلاق من الواجهة في نمط «المقبض المتحرك» — الواجهة تمرّر قوة المقبض */
export function fireFromBridge(powerOverride?: number): void {
  const b = useSceneBridge.getState();
  const power = Math.min(1, Math.max(0, powerOverride ?? b.power));
  const target: CatapultTarget = b.aimTarget ?? (b.aimPoint ? { kind: 'ground', position: b.aimPoint } : { kind: 'ground', position: { x: 0, y: 0, z: 0 } });
  // سجّل المسار حتى تلاحق الكاميرا القذيفة بقوس مطابق للتصويب
  const s = useGameStore.getState().state;
  const team = s.teams[s.turnIndex];
  if (team) {
    const idx = s.teams.indexOf(team);
    const origin = catapultOrigin(team, idx, s.teams.length);
    const traj = computeTrajectory(origin, b.aimYaw, b.aimPitch, power * 100);
    recordLastShot({ origin, landing: traj.landing, points: traj.points, at: Date.now() });
  }
  engineApi.fireCatapult(target, power);
  useSceneBridge.setState({ power: 0, charging: false });
}

export function selectArmyTarget(target: ArmyTarget | null): void {
  useSceneBridge.setState({ armyTarget: target });
}

/** نمط «المقبض المتحرك»: الواجهة تكتب قوة المقبض هنا والمشهد يقرؤها لليزر/العداد */
export function setPower(power: number): void {
  useSceneBridge.setState({ power: Math.min(1, Math.max(0, power)) });
}

/** رحلة كاميرا استعراضية نحو قلعة مجموعة (نقر بطاقة الفريق في الشريط العلوي) */
export function focusTeamByIndex(teamIndex: number): void {
  const s = useGameStore.getState().state;
  const team = s.teams[teamIndex];
  if (!team) return;
  const pos = teamCastlePos(s, team.id);
  setCameraJob({ kind: 'focus', points: [{ ...pos }], startedAt: performance.now(), durationMs: 2600 });
}

/** إضافة نص ضرر/غنيمة عائم فوق موقع — يزال تلقائيًا بعد 1.3ث */
export function pushFloat(position: Vec3, text: string, color: FloatText['color']): void {
  const id = `float-${++floatSeq}`;
  useSceneBridge.setState((s) => ({ floats: [...s.floats.slice(-11), { id, position: { ...position }, text, color }] }));
  setTimeout(() => {
    useSceneBridge.setState((s) => ({ floats: s.floats.filter((f) => f.id !== id) }));
  }, 1350);
}

/** احتفال فريق (جنوده يقفزون) لمدة seconds */
export function celebrateTeam(teamId: string, seconds = 2.2): void {
  useSceneBridge.setState((s) => ({
    celebrating: { ...s.celebrating, [teamId]: Date.now() + seconds * 1000 },
  }));
}

export function isCelebrating(teamId: string): boolean {
  return (useSceneBridge.getState().celebrating[teamId] ?? 0) > Date.now();
}

/** اهتزاز الشاشة (design.md §7: يُعطَّل مع prefers-reduced-motion — يُفحص في CameraRig) */
export function shakeScreen(amplitude: number, durationSec = 0.25): void {
  useSceneBridge.setState({ shake: { amplitude, until: performance.now() + durationSec * 1000 } });
}

/** بدء مهمة كاميرا (مطاردة قذيفة) — يرفض المهام المسمومة بإحداثيات غير منتهية */
export function setCameraJob(job: CameraJob | null): void {
  if (job && !isCameraJobSane(job)) {
    // نقطة NaN/Infinity في مهمة كاميرا تسمّم camera.position عبر lerp
    // بلا استثناء وتبقى نهائيًا (الشاشة البنية) — نتخطاها بأمان.
    console.warn('[scene] تجاهل مهمة كاميرا بإحداثيات غير منتهية', job.kind);
    return;
  }
  useSceneBridge.setState({ cameraJob: job });
}

/** هل كل أرقام مهمة الكاميرا منتهية؟ (دالة نقية — قابلة للاختبار) */
export function isCameraJobSane(job: CameraJob): boolean {
  if (!Number.isFinite(job.startedAt) || !Number.isFinite(job.durationMs) || job.durationMs <= 0) return false;
  if (job.radius !== undefined && (!Number.isFinite(job.radius) || job.radius <= 0)) return false;
  if (job.points.length === 0) return false;
  return job.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
}

/**
 * تحديث إشارة تزامن مشهد المعركة للواجهة — يستدعيها مشغّل الأحداث/
 * مكوّن BattleScene: 'marching' عند بدء الحدث، 'fighting' عند الوصول،
 * 'done' عند اكتمال الخاتمة **بعد تأكيد البطاقة الثابتة** (أو فورًا عند
 * التخطي/المهلة الاحتياطية)، و(null, null) لمسحها.
 */
export function setBattleFx(eventId: string | null, phase: BattleFxPhase | null): void {
  useSceneBridge.setState({ battleFx: { eventId, phase } });
}

/** تحديث طور مشهد القذيفة: flying عند الإطلاق، impact عند الإصابة، done بعد الأنيميشن */
export function setCatapultFx(eventId: string | null, phase: CatapultFxPhase | null): void {
  useSceneBridge.setState({ catapultFx: { eventId, phase } });
}

/** الواجهة تضبط البطاقة الثابتة المعروضة حاليًا (null عند إغلاقها) */
export function setStickyHold(hold: StickyHold | null): void {
  useSceneBridge.setState({ stickyHold: hold });
}

/**
 * الواجهة تناديها عند ضغط «تأكيد ✓» على البطاقة الثابتة.
 * تضبط stickyConfirm = { eventId, at } — المشهد يقارن eventId لإنهاء
 * الاحتفال المستمر / إدخال المجند الجديد للقلعة.
 */
export function confirmSticky(eventId: string): void {
  useSceneBridge.setState({ stickyConfirm: { eventId, at: performance.now() } });
}

/** مقبض الالتفاف السفلي في نمط slider: يضبط زاوية المنجنيق (راديان، اتفاقية
 *  computeTrajectory). دورة كاملة — أي قيمة مقبولة بلا تثبيت زاوي هنا. */
export function setCatapultYaw(yawRad: number): void {
  useSceneBridge.setState({ catapultYaw: yawRad });
}

/** يضبطها CatapultRig عند دخول وضع المنجنيق — زاوية اتجاه مركز الخريطة (مرجع دوران المجسم) */
export function setCatapultBaseYaw(yawRad: number): void {
  useSceneBridge.setState({ catapultBaseYaw: yawRad });
}

// ─── بوّابة الانتظار حتى تأكيد البطاقة الثابتة ───

/** المهلة الاحتياطية السخية إن لم تظهر بطاقة ثابتة للحدث إطلاقًا (واجهة قديمة) */
export const STICKY_FALLBACK_MS = 15_000;

/** سياق بوّابة حدث واحد — يُنشأ عند بدء الاحتفال/الكشف ويُمرَّر لكل فحص */
export interface StickyGate {
  eventId: string;
  /** بدأت عند (performance.now) */
  startedAt: number;
  /** هل ظهرت بطاقة ثابتة لهذا الحدث في أي لحظة */
  sawHold: boolean;
}

export function createStickyGate(eventId: string): StickyGate {
  return { eventId, startedAt: performance.now(), sawHold: false };
}

/**
 * هل انتهى الانتظار؟ true عند:
 * 1) confirmSticky(eventId) نُوديت (stickyConfirm يطابق)، أو
 * 2) توافقية: كانت هناك stickyHold لهذا الحدث ثم صارت null، أو
 * 3) لم تظهر stickyHold إطلاقًا ومرّت STICKY_FALLBACK_MS.
 */
export function stickyGateReleased(gate: StickyGate, fallbackMs = STICKY_FALLBACK_MS): boolean {
  const b = useSceneBridge.getState();
  if (b.stickyConfirm && b.stickyConfirm.eventId === gate.eventId) return true;
  const hold = b.stickyHold;
  if (hold && hold.eventId === gate.eventId) {
    gate.sawHold = true;
    return false; // البطاقة معروضة وتنتظر التأكيد
  }
  if (gate.sawHold && !hold) return true; // أُغلقت البطاقة = تأكيد (توافق)
  if (!gate.sawHold && performance.now() - gate.startedAt > fallbackMs) return true;
  return false;
}

/**
 * لقطة مركزة مؤقتة على كيان (طابق مبني حديثًا / جندي مُجنَّد) —
 * يطلبها مشغّل الأحداث أثناء الأنيميشن، ويفرجها CameraRig تلقائيًا بعد durationMs
 * لتعود الكاميرا للتأطير الديناميكي للقلعة (أو للمنظور العام).
 * radius: نصف قطر ما يجب إظهاره حول النقطة (يُشتق منه الزوم لـ FOV=40).
 */
export function focusEntity(position: Vec3, radius = 3, durationMs = 1200): void {
  setCameraJob({ kind: 'focus-entity', points: [{ ...position }], radius, startedAt: performance.now(), durationMs });
}

/** تسجيل آخر رمية قبل استدعاء engineApi.fireCatapult */
export function recordLastShot(shot: LastShot): void {
  useSceneBridge.setState({ lastShot: shot });
}

/** اختيار أهداف الجيش القابلة للنقر في وضع الجيش (يستبعد المحمي وقلعة الفريق نفسه) */
export function useAttackableTargets(): { target: ArmyTarget; position: Vec3; label: string }[] {
  const state = useGameStore((s) => s.state);
  const me = state.teams[state.turnIndex];
  if (!me) return [];
  const out: { target: ArmyTarget; position: Vec3; label: string }[] = [];
  for (const team of state.teams) {
    if (team.id === me.id) continue;
    if ((state.protectionRoundsLeft[team.id] ?? 0) > 0) continue;
    out.push({
      target: { kind: 'castle', teamId: team.id },
      position: resolveTargetPosition(state, { kind: 'castle', teamId: team.id }),
      label: `قلعة ${team.name}`,
    });
  }
  // القوافل لا تُدرج هنا: موضعها المنطقي يتخلف عن موضعها المرئي المتحرك
  // (مشي مستمر بين بثّات convoy-moved) فكانت علامة النقر الثابتة تطفو فوق
  // طريق فارغ. النقر عليها يعالجه مجسم القافلة نفسه في entities/Convoys.tsx
  // بمنطقة التقاط غير مرئية تتحرك مع الجنود.
  for (const pile of state.piles) {
    if (pile.ownerTeamId === me.id) continue;
    const pos = pileScenePosition(state, pile); // موضع العرض (خارج قاعدة القلعة) لا الموضع المنطقي
    out.push({
      target: { kind: 'gold-pile', pileId: pile.id },
      position: { x: pos.x, y: 1, z: pos.z },
      label: `ذهب مكشوف: ${pile.amount}`,
    });
  }
  return out;
}
