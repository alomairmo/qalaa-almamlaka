/**
 * أساس روابط الأصول العامة (public/*).
 *
 * محليًا وفي بناء Kimi الافتراضي: ASSET_BASE فارغ → المسارات الأصلية كما هي.
 * في بناء GitHub Pages (--mode pages): VITE_ASSET_BASE يشير إلى bucket
 * Supabase العام الذي يستضيف الأصول (الثنائية لا يمكن نشرها عبر API GitHub).
 */
export const ASSET_BASE: string =
  (import.meta.env.VITE_ASSET_BASE as string | undefined) ?? '';

/** يحوّل مسار أصل عام (assetUrl("/x.png") أو "./x.png") إلى رابط كامل عند وجود ASSET_BASE */
export function assetUrl(p: string): string {
  if (!ASSET_BASE) return p;
  const clean = p.replace(/^\.?\//, '');
  return `${ASSET_BASE.replace(/\/$/, '')}/${clean}`;
}
