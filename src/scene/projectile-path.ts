/**
 * دوال نقية لمسار القذيفة المرئي: اقتطاع المسار عند سطح البرج، قوس
 * الارتداد من نقطة اصطدام مرتفعة إلى السقوط الأرضي، وتأطير كاميرا يغطي
 * نقطتين. مستخرجة من event-player حتى تُختبر بمعزل عن React/R3F.
 */
import type { Vec3 } from '@/contracts/types';

/**
 * اقتطاع المسار المرئي عند نقطة الاصطدام بالبرج: النقاط حتى pathIndex ثم
 * نقطة الوجه نفسها — فتنتهي القذيفة مصطدمةً بالجدار بدل اختراقه نحو الأرض.
 * إن كان pathIndex خارج النطاق يُعاد المسار كاملًا مع إلحاق النقطة.
 */
export function truncatePathAt(points: Vec3[], pathIndex: number, hitPoint: Vec3): Vec3[] {
  const cut = Math.max(0, Math.min(pathIndex, points.length - 1));
  return [...points.slice(0, cut + 1), { ...hitPoint }];
}

/**
 * قوس الارتداد المرئي: يبدأ من نقطة الاصطدام الفعلية على ارتفاعها (وجه
 * البرج) ويهبط إلى نقطة السقوط الأرضية — نصف جيبي للارتفاع الإضافي مع
 * استيفاء خطي للهبوط من ارتفاع البداية.
 */
export function bounceArcPoints(start: Vec3, landing: Vec3, segments = 12): Vec3[] {
  const dist = Math.hypot(landing.x - start.x, landing.z - start.z);
  const arcH = 1.6 + dist * 0.12;
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pts.push({
      x: start.x + (landing.x - start.x) * t,
      y: Math.max(0, start.y * (1 - t) + Math.sin(t * Math.PI) * arcH),
      z: start.z + (landing.z - start.z) * t,
    });
  }
  // طرفا القوس دقيقان تمامًا (لا بقايا sin(π) العشرية): البداية عند الاصطدام
  // والنهاية عند السقوط الأرضي
  pts[0] = { ...start };
  pts[pts.length - 1] = { x: landing.x, y: 0, z: landing.z };
  return pts;
}

/**
 * تأطير يغطي نقطتين (موقع الإصابة الأولي + سقوط الارتداد): المركز منتصف
 * القطعة (بارتفاع أعلى النقطتين) ونصف القطر نصف البعد + هامش.
 */
export function coveringFocus(a: Vec3, b: Vec3, pad = 4): { center: Vec3; radius: number } {
  return {
    center: { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y, 1.5), z: (a.z + b.z) / 2 },
    radius: Math.hypot(b.x - a.x, b.z - a.z) / 2 + pad,
  };
}
