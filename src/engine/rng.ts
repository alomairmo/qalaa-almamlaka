/**
 * مولّد أرقام عشوائية قابل للبذر (mulberry32) —
 * كل عشوائية اللعبة (رتب التجنيد، قوة القتال، ضرر المنجنيق، خلط الأسئلة)
 * تمر عبره لتسهيل الاختبار وإعادة الإنتاج.
 */

export interface RNG {
  /** رقم عشوائي في [0, 1) */
  next(): number;
  /** عدد صحيح عشوائي في [min, max] شاملًا الطرفين */
  int(min: number, max: number): number;
  /** true باحتمال p */
  chance(p: number): boolean;
  /** خلط عشوائي (Fisher–Yates) — يرجع نسخة جديدة */
  shuffle<T>(arr: readonly T[]): T[];
}

/** mulberry32 — مولّد بسيط سريع وكافٍ للعبة صفّية */
export function createRng(seed?: number): RNG {
  let a = (seed ?? Date.now()) >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      if (max < min) [min, max] = [max, min];
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(p) {
      return next() < p;
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
