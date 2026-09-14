/**
 * هندسة الخريطة والتصويب الفيزيائي للمنجنيق.
 * ثوابت هنا «مقاييس مشهد» وليست قواعد لعب (قواعد اللعب كلها من الإعدادات).
 * الخريطة ~120×120 وحدة (design.md §6).
 */
import type { Team, Vec3 } from '@/contracts/types';

/** نصف قطر دائرة القلاع حول مركز الخريطة */
export const CASTLE_RING_RADIUS = 42;
/** ارتفاع القاعدة الأرضية (وحدات المشهد) */
export const BASE_HEIGHT = 4;
/** ارتفاع الطابق الواحد */
export const FLOOR_HEIGHT = 3;
/** الجاذبية المستخدمة في محاكاة القذيفة */
export const GRAVITY = 9.8;
/** أدنى/أقصى سرعة إطلاق (وحدة/ثانية) عند قوة 0 و100 */
export const MIN_LAUNCH_SPEED = 8;
export const MAX_LAUNCH_SPEED = 42;

/** موقع قلعة المجموعة ذات الفهرس i من أصل n مجموعات (موزعة بالتساوي على دائرة) */
export function castlePosition(index: number, teamCount: number): Vec3 {
  // حارس NaN: teamCount=0 (حالة عابرة أثناء إعادة الضبط/الاستئناف) كان
  // يقسم على صفر فيُنتج angle=NaN ← موقع NaN ← كاميرا NaN ← شاشة بنية
  // بلا استثناء ولا تعافٍ. البديل الآمن: موقع الشمال على الحلقة.
  const n = Number.isFinite(teamCount) && teamCount >= 1 ? teamCount : 1;
  const i = Number.isFinite(index) ? index : 0;
  // نبدأ من الشمال (أعلى الخريطة) ونوزع باتجاه عقارب الساعة
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return {
    x: Math.cos(angle) * CASTLE_RING_RADIUS,
    y: 0,
    z: Math.sin(angle) * CASTLE_RING_RADIUS,
  };
}

/** ارتفاع سطح القلعة (منصة المنجنيق) حسب عدد الطوابق — §3 */
export function castleTopHeight(team: Team): number {
  return BASE_HEIGHT + team.castle.floors.length * FLOOR_HEIGHT;
}

/** نقطة انطلاق القذيفة: سطح قلعة المجموعة */
export function catapultOrigin(team: Team, teamIndex: number, teamCount: number): Vec3 {
  const base = castlePosition(teamIndex, teamCount);
  return { x: base.x, y: castleTopHeight(team), z: base.z };
}

/**
 * اتجاه واجهة القلعة (النوافذ/البوابة) = اتجاه الكاميرا العامة الثابت 45°
 * (يطابق CAMERA_AZIMUTH في scene/layout — القلاع تُدوَّر لتواجهه).
 * كل ما هو «مكشوف خارج القلعة» (ذهب/حجارة/جنود خارجيون) يصطف في هذه
 * الجهة حتى يبقى ظاهرًا للكاميرا دائمًا.
 */
export const WINDOW_AZIMUTH = Math.PI / 4;

/** موقع كومة الذهب الخارجية بجوار القلعة — جهة النوافذ (ظاهرة للكاميرا دائمًا) */
export function outsidePilePosition(teamIndex: number, teamCount: number): Vec3 {
  const c = castlePosition(teamIndex, teamCount);
  const a = WINDOW_AZIMUTH - 0.22; // انزياح جانبي بسيط عن محور الواجهة (بعيدًا عن الحجارة)
  return { x: c.x + Math.cos(a) * 8.8, y: 0, z: c.z + Math.sin(a) * 8.8 };
}

/**
 * موقع جندي خارجي حول قلعته (لأهداف القصف/السبلاش/الارتداد).
 * الجنود الخارجيون يصطفّون على قوس نصف قطره 7 وحدات **جهة النوافذ**
 * (اتجاه الكاميرا العامة 45°)، يبدأ من محور الواجهة وبخطوة 22.5° لكل خانة.
 * slot = فهرس الجندي ضمن جنود مجموعته الخارجيين (بترتيب team.soldiers).
 * ⚠️ على المشهد استخدام هذه الدالة نفسها لعرض الجنود الخارجيين حتى
 * يتطابق المرئي مع منطق الإصابة.
 */
export function outsideSoldierPosition(teamIndex: number, teamCount: number, slot: number): Vec3 {
  const c = castlePosition(teamIndex, teamCount);
  const angle = WINDOW_AZIMUTH + slot * (Math.PI / 8);
  return { x: c.x + Math.cos(angle) * 7, y: 0, z: c.z + Math.sin(angle) * 7 };
}

/**
 * موقع كومة الحجارة الخارجية لقلعة ما — جهة النوافذ أيضًا (ظاهرة للكاميرا
 * دائمًا)، منزاحة جانبًا عن كومة الذهب حتى لا تتداخلا — لأهداف الارتداد.
 * ⚠️ على المشهد مطابقة هذا الموضع عند رسم كومة الحجارة.
 */
export function stonesPilePosition(teamIndex: number, teamCount: number): Vec3 {
  const c = castlePosition(teamIndex, teamCount);
  const a = WINDOW_AZIMUTH + 0.3;
  return { x: c.x + Math.cos(a) * 8.8, y: 0, z: c.z + Math.sin(a) * 8.8 };
}

/** مسافة أفقية (x,z) بين نقطتين — تُستخدم لنطاقات السبلاش/الارتداد */
export function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** تقاطع خطّي بين موقعين */
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export interface TrajectoryResult {
  /** نقطة السقوط المتوقعة (أول تماس مع الأرض y=0) */
  landing: Vec3;
  /** نقاط المسار (لرسم الليزر/الكاميرا الملاحقة) */
  points: Vec3[];
}

/**
 * محاكاة قذيفة المنجنيق بالجاذبية — §8.
 * angleYaw: زاوية الدوران الأفقي بالراديان (0 = +X، عكس عقارب الساعة).
 * anglePitch: زاوية الارتفاع بالراديان (0 = أفقي).
 * power: قوة الإطلاق 0..100.
 * تُستخدم لليزر التصويب وللإطلاق الفعلي على حد سواء.
 */
export function computeTrajectory(
  origin: Vec3,
  angleYaw: number,
  anglePitch: number,
  power: number,
): TrajectoryResult {
  const p = Math.min(100, Math.max(0, power)) / 100;
  const speed = MIN_LAUNCH_SPEED + p * (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED);
  const vy = Math.sin(anglePitch) * speed;
  const vh = Math.cos(anglePitch) * speed;
  const vx = Math.cos(angleYaw) * vh;
  const vz = Math.sin(angleYaw) * vh;

  const points: Vec3[] = [{ ...origin }];
  const dt = 0.05; // خطوة المحاكاة الزمنية
  let t = dt;
  let prev = { ...origin };
  // حد أقصى للمحاكاة لتفادي حلقة لا نهائية عند زوايا شبه أفقية سالبة
  for (let i = 0; i < 2000; i++, t += dt) {
    const pt: Vec3 = {
      x: origin.x + vx * t,
      y: origin.y + vy * t - 0.5 * GRAVITY * t * t,
      z: origin.z + vz * t,
    };
    if (pt.y <= 0) {
      // استيفاء خطي لنقطة التماس الدقيقة مع الأرض
      const f = prev.y / (prev.y - pt.y || 1);
      const landing = lerpVec3(prev, { ...pt, y: 0 }, Math.min(1, Math.max(0, f)));
      landing.y = 0;
      points.push(landing);
      return { landing, points };
    }
    points.push(pt);
    prev = pt;
  }
  // لم تلمس الأرض (زاوية مستقيمة للأعلى تقريبًا) — نرجع آخر نقطة مسندة للأرض
  const landing = { x: prev.x, y: 0, z: prev.z };
  points.push(landing);
  return { landing, points };
}
