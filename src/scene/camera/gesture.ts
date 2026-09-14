/**
 * رياضيات نمط «المقابض بالإيماء» للمنجنيق — دوال نقية قابلة للاختبار.
 *
 * اتفاقية الاتجاه (إصلاح «الماوس لليمين يحرّك يسار»):
 * - تحريك الفارة يمينًا (movementX موجب) **يزيد** الزاوية، وهو ما يطابق
 *   التفاف المنجنيق يمينًا من منظور اللاعب خلف الكاميرا.
 * - تحريك الفارة للأعلى (movementY سالب) **يزيد** القوة، وللأسفل ينقصها.
 *
 * دوران 360°: لا تثبيت زاوي هنا إطلاقًا — الزاوية تنمو بلا حدود،
 * ويُستخدم normalizeAngle فقط عند عرضها/دفعها للواجهة، و
 * nearestEquivalentAngle عند التنعيم حتى لا يلفّ التصويب لفة طويلة.
 */

/** حساسية الالتفاف (راديان لكل بكسل حركة) */
export const GESTURE_YAW_SPEED = 0.005;
/** حساسية القوة (لكل بكسل حركة عمودية) */
export const GESTURE_POWER_SPEED = 0.0035;

/** تطبيق إيماءة فارة واحدة على (الزاوية، القوة) — بلا أي clamp زاوي */
export function applyGestureAim(
  yaw: number,
  power: number,
  movementX: number,
  movementY: number,
): { yaw: number; power: number } {
  return {
    yaw: yaw + movementX * GESTURE_YAW_SPEED,
    // للأعلى (movementY سالب) = زيادة القوة
    power: Math.min(1, Math.max(0, power - movementY * GESTURE_POWER_SPEED)),
  };
}

/** تطبيع الزاوية إلى المجال (−π, π] — للعرض في مقبض الواجهة فقط */
export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r > Math.PI) r -= twoPi;
  if (r <= -Math.PI) r += twoPi;
  return r;
}

/**
 * أقرب مكافئ زاوي لـ target بالنسبة إلى reference (الفرق ≤ π).
 * يمنع التنعيم (lerp) من سلوك «اللفة الطويلة» عند عبور حد ±π —
 * مهم مع الدوران الكامل 360° حيث قد تقفز قيمة المقبض من +π إلى −π.
 */
export function nearestEquivalentAngle(target: number, reference: number): number {
  return reference + normalizeAngle(target - reference);
}
