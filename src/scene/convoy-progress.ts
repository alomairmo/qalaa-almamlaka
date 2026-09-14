/**
 * حساب التقدّم المرئي للقافلة — دوال نقية مفصولة عن مكوّن Convoys
 * (حتى تبقى قابلة للاختبار، ويبقى المكوّن «عرضًا فقط»).
 *
 * المشكلة التي تعالجها: التقدّم المرئي كان يُشتق كل إطار من
 * (convoy.progress المنطقي + كسر الجولة المنقضي من المؤقت). عند حافة
 * الجولة يتصفّر كسر المؤقت **قبل** أن يصل بثّ convoy-moved ويحدّث
 * progress، فيسقط المجموع من (progress + step) إلى (progress) فجأة —
 * قفزة بصرية للخلف إلى بداية القسم، ثم قفزة للأمام عند وصول البثّ.
 *
 * الحل: التقدّم المرئي المطلق **رتيب لا يتراجع أبدًا**:
 *   visual = max(visual السابق, progress + step × frac)
 * فإن تصفّر المؤقت قبل تحديث الحالة بقي الجنود عند نهاية القسم، وعند
 * وصول convoy-moved يلتحم المنطقي بالمرئي (= حدود القسم بالضبط)، ومع
 * الجولة التالية يواصلون من تلك النقطة نحو نهاية الثلث التالي بسلاسة.
 * ويتجمدون في مكانهم عند توقف المؤقت (إعدادات/بطاقة) دون رجوع.
 */
import type { Vec3 } from '@/contracts/types';

/**
 * التقدّم المرئي المطلق على الطريق (0..1) — رتيب (لا يعود للخلف مهما
 * كان ترتيب/توقيت تحديثات الحالة والمؤقت).
 *
 * @param prevVisual     آخر تقدّم مرئي محسوب (احتفظ به بين الإطارات)
 * @param logicalProgress قيمة convoy.progress من الحالة (تتقدم step كل جولة)
 * @param roundStep      مقدار الجولة الواحدة = 1 ÷ (عدد المجموعات − 1)
 * @param roundFrac      كسر الجولة المنقضي 0..1 من مؤقت الجولة (0 عند توقفه)
 */
export function convoyVisualProgress(
  prevVisual: number,
  logicalProgress: number,
  roundStep: number,
  roundFrac: number,
): number {
  const frac = Math.min(1, Math.max(0, roundFrac));
  const raw = Math.min(1, logicalProgress + roundStep * frac);
  // لا رجوع أبدًا: نأخذ الأكبر من المرئي السابق والمنطقي الحالي والمشتق
  return Math.max(prevVisual, logicalProgress, raw);
}

/**
 * موضع العرض على الطريق المستقيم نحو القلعة لقيمة تقدّم مرئي معطاة.
 * convoy.position يقابل logicalProgress دائمًا، والفائض المرئي
 * (visual − logical) يُوزَّع على باقي الطريق نحو القلعة.
 */
export function convoyVisualPoint(
  position: Vec3,
  home: Vec3,
  logicalProgress: number,
  visualProgress: number,
): { x: number; z: number } {
  const remaining = Math.max(1e-6, 1 - logicalProgress);
  const adv = Math.min(1, Math.max(0, (visualProgress - logicalProgress) / remaining));
  return {
    x: position.x + (home.x - position.x) * adv,
    z: position.z + (home.z - position.z) * adv,
  };
}
