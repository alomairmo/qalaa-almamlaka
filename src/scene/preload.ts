/**
 * تسخين خامات المشهد مسبقًا (useTexture.preload من drei).
 *
 * لماذا؟ أول تركيب للمشهد يعلّق (Suspense) على تحميل الصور. في بناء
 * GitHub Pages تُجلب الخامات عبر CDN خارجي وقد يبقى الانتظار معلّقًا بلا
 * نهاية في بعض الظروف (شاشة بنية بلا أي استثناء يلتقطه حد الأخطاء).
 * النداء هنا أثناء شاشة العنوان يملأ كاش suspend-react، فيُركَّب المشهد
 * لاحقًا تزامنيًا بلا تعليق أصلًا.
 *
 * مهم: يجب أن تمرّ العناوين بنفس assetUrl حتى تطابق سلاسل الكاش حرفيًا
 * ما تستخدمه المكوّنات (وإلا تحميل مزدوج بلا فائدة).
 * fire-and-forget بالكامل: أي فشل هنا لا أثر له — useTexture يعيد المحاولة.
 */
import { useTexture } from '@react-three/drei';
import { assetUrl } from '@/asset-base';

/** كل الخامات التي يعلّق عليها المشهد عبر useTexture */
const SCENE_TEXTURES: readonly string[] = [
  '/ground-grass-texture.png', // world/Terrain.tsx
  '/sand-path-texture.png', // world/Terrain.tsx
  '/sky-clouds.png', // world/Ambience.tsx
  '/particle-coin-sparkle.png', // effects/Particles.tsx
  '/particle-smoke-puff.png', // effects/Particles.tsx
  '/stone-wall-texture.png', // castle/Castle.tsx
  './banner-team-1.svg', // castle/Banner.tsx (قالب ديناميكي — الموجود 1..4)
  './banner-team-2.svg',
  './banner-team-3.svg',
  './banner-team-4.svg',
];

let started = false;

/** يبدأ التسخين مرة واحدة — آمن للنداء من أي عدد من المواضع */
export function preloadSceneTextures(): void {
  if (started) return;
  started = true;
  for (const p of SCENE_TEXTURES) {
    try {
      useTexture.preload(assetUrl(p));
    } catch {
      /* تجاهل — التسخين تسريع فقط */
    }
  }
}
