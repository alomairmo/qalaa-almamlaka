/**
 * لوحة الألوان والمواد المشتركة للمشهد ثلاثي الأبعاد — design.md §2/§6.
 * chunk toon: مواد MeshToonMaterial بخريطة تدرج من 3 درجات.
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { TEAM_COLORS } from '@/contracts/defaults';
import type { TeamColor } from '@/contracts/types';

export const PALETTE = {
  teal900: '#0B3E43',
  teal700: '#0F5E63',
  teal500: '#17A2A0',
  turquoiseGlaze: '#2EC4B6',
  gold600: '#B8860B',
  gold500: '#E8B93B',
  gold300: '#F5D76E',
  sand200: '#E9D8A6',
  parchment: '#F6EED9',
  wood700: '#4A2F1B',
  wood900: '#2E1B0E',
  ink: '#2B2118',
  night800: '#123B4F',
  stone400: '#8D99AE',
  danger500: '#D64545',
  success500: '#43A95C',
  sky300: '#AEE3F5',
  skyHorizon: '#F6EED9',
  fog: '#D8ECF0',
  sun: '#FFE8C0',
} as const;

export function teamHex(color: TeamColor): string {
  return TEAM_COLORS[color] ?? '#888888';
}

/** خريطة تدرج toon من 3 درجات (داكن/وسط/فاتح) */
let gradientMapCache: THREE.DataTexture | null = null;
export function toonGradientMap(): THREE.DataTexture {
  if (gradientMapCache) return gradientMapCache;
  const data = new Uint8Array([90, 160, 255, 255]); // 3 درجات + حافة
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  gradientMapCache = tex;
  return tex;
}

/** مادة toon قياسية للمشهد */
export function toonMaterial(color: string | number, extra: Partial<THREE.MeshToonMaterialParameters> = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap(), ...extra });
}

/** هل يفضّل المستخدم تقليل الحركة؟ (design.md §7/§13) */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/** خلط لونين hex — يُستخدم لتلوين القبة بلون الفريق مع المزج الفيروزي */
export function mixHex(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  ca.lerp(cb, t);
  return `#${ca.getHexString()}`;
}
