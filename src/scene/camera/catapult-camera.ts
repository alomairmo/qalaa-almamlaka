/**
 * كاميرا المنجنيق المتكيفة مع طول البرج (وضع التصويب FPS فوق القبة).
 *
 * المشكلة: المنظور من سطح القلعة يرتفع مع عدد الطوابق، وعند أبراج عالية
 * تصبح العين ملاصقة للقمة ناظرةً شبه أفقيًا فلا يظهر الميدان الأرضي ولا
 * الأفق معًا. الحل: ملف ارتكاز مشتق من عدد الطوابق — كلما طال البرج رجعت
 * العين خلف المنصة وارتفعت فوقها، وانحدرت نقطة النظر نحو الميدان وتقدّمت
 * أفقيًا، فيبقى الأفق والأهداف الأرضية في الكادر معًا.
 *
 * دوال نقية مستخرجة من CatapultRig للاختبار. الارتفاعات تُبنى على ثوابت
 * القلعة نفسها (BASE_HEIGHT/FLOOR_HEIGHT من geometry عبر castleTopHeight)
 * حتى لا تنفصل الحسابات عن بناء المجسم.
 */
import type { Vec3 } from '@/contracts/types';

/** ملف ارتكاز كاميرا المنجنيق لعدد طوابق معطى */
export interface CatapultCamProfile {
  /** رجوع العين خلف المنصة (عكس اتجاه التصويب) */
  back: number;
  /** ارتفاع العين فوق مستوى المنصة */
  lift: number;
  /** انحدار نقطة النظر تحت مستوى العين */
  lookDrop: number;
  /** تقدّم نقطة النظر الأفقي أمام العين */
  lookAhead: number;
}

/**
 * الملف الأساسي (برج بلا طوابق/طابق واحد) يطابق السلوك السابق:
 * رجوع 1.7 ورفع 0.5 ونظر شبه أفقي عند 15 وحدة. كل طابق إضافي يرجع العين
 * ويرفعها ويزيد انحدار النظر — بسقوف حتى لا تصبح الكاميرا فوق القمة
 * مباشرة ناظرةً للأسفل.
 */
export function catapultCameraProfile(floorCount: number): CatapultCamProfile {
  const extra = Math.max(0, floorCount - 1);
  return {
    back: 1.7 + Math.min(9, extra * 1.15),
    lift: 0.5 + Math.min(7, extra * 0.85),
    lookDrop: Math.min(11, extra * 1.5),
    lookAhead: 15 + Math.min(30, extra * 4),
  };
}

/**
 * قاطع أمان ضد اختراق القبة/الطوابق: إن كانت العين أفقيًا داخل غلاف البرج
 * (نصف قطر القاعدة + هامش) وتحت قمة القبة تُرفع فوقها. يُطبَّق بعد حساب
 * الموضع من الملف (الرجوع خلف المنصة قد يمر فوق القبة عند التصويب بعيدًا
 * عن مركز الخريطة مع رجوع كبير).
 */
export function clampAboveDome(pos: Vec3, castleCenter: Vec3, topY: number): Vec3 {
  const domeShellR = 5.0; // نصف عرض القاعدة 4.5 + هامش قريب
  const domeTopY = topY + 4.3; // قبة (حتى ~2.8) + سنّ ذهبية (~3.7) + هامش
  const d = Math.hypot(pos.x - castleCenter.x, pos.z - castleCenter.z);
  if (d < domeShellR && pos.y < domeTopY) return { x: pos.x, y: domeTopY, z: pos.z };
  return pos;
}

/**
 * نقطة نظر كاميرا المنجنيق: أمام العين باتجاه التصويب بمسافة lookAhead،
 * وتحت مستوى العين بمقدار lookDrop (بأرضية دنيا فوق سطح الأرض) — كلما طال
 * البرج انحدرت أكثر نحو الميدان فتبقى الأهداف الأرضية مرئية.
 */
export function catapultLookPoint(eye: Vec3, dir: Vec3, profile: CatapultCamProfile): Vec3 {
  const ahead = {
    x: eye.x + dir.x * profile.lookAhead,
    y: eye.y,
    z: eye.z + dir.z * profile.lookAhead,
  };
  ahead.y = Math.max(3.2, eye.y - 2 - profile.lookDrop);
  return ahead;
}
