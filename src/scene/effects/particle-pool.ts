/**
 * مجمع الجسيمات وأوامر الانبعاث — وحدة خالصة بلا مكوّنات React
 * (حتى يبقى Particles.tsx مكوّنًا وحيدًا ويرضى react-refresh).
 * سعة إجمالية 300 جسيم كحد أقصى (150 دخان + 150 بريق) — design.md §6.
 */
import type { Vec3 } from '@/contracts/types';

export const CAP_PER_SYSTEM = 150;

export interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
}

function makePool(): Particle[] {
  return Array.from({ length: CAP_PER_SYSTEM }, () => ({
    alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    life: 0, maxLife: 1, size: 1, grow: 0, r: 1, g: 1, b: 1, gravity: 0,
  }));
}

export const smokePool = makePool();
export const sparklePool = makePool();

function spawn(pool: Particle[], pos: Vec3, opts: { spread?: number; up?: number } & Partial<Particle>) {
  const p = pool.find((x) => !x.alive);
  if (!p) return;
  const spread = opts.spread ?? 2;
  p.alive = true;
  p.x = pos.x + (Math.random() - 0.5) * 0.6;
  p.y = pos.y + (Math.random() - 0.5) * 0.4;
  p.z = pos.z + (Math.random() - 0.5) * 0.6;
  const a = Math.random() * Math.PI * 2;
  const v = Math.random() * spread;
  p.vx = Math.cos(a) * v;
  p.vz = Math.sin(a) * v;
  p.vy = (opts.up ?? 2.5) * (0.5 + Math.random());
  p.maxLife = opts.maxLife ?? 1;
  p.life = p.maxLife;
  p.size = opts.size ?? 1;
  p.grow = opts.grow ?? 1.5;
  p.gravity = opts.gravity ?? 0;
  p.r = opts.r ?? 1;
  p.g = opts.g ?? 1;
  p.b = opts.b ?? 1;
}

/** انفجار غبار (دائرة متوسعة + دخان) */
export function burstSmoke(pos: Vec3, count = 18, scale = 1): void {
  for (let i = 0; i < count; i++) {
    spawn(smokePool, pos, {
      spread: 3.5 * scale,
      up: 2.2 * scale,
      size: (1.2 + Math.random()) * scale,
      grow: 2.2,
      maxLife: 0.9 + Math.random() * 0.5,
      r: 0.82, g: 0.78, b: 0.72,
    });
  }
}

/** بريق ذهبي */
export function burstSparkle(pos: Vec3, count = 14, scale = 1): void {
  for (let i = 0; i < count; i++) {
    spawn(sparklePool, pos, {
      spread: 2 * scale,
      up: 3 * scale,
      size: (0.5 + Math.random() * 0.5) * scale,
      grow: -0.3,
      maxLife: 0.7 + Math.random() * 0.4,
      r: 1, g: 0.87, b: 0.43,
      gravity: -2,
    });
  }
}

/** حطام حجري متطاير (دخان رمادي داكن بجاذبية) */
export function burstDebris(pos: Vec3, count = 16, scale = 1): void {
  for (let i = 0; i < count; i++) {
    spawn(smokePool, pos, {
      spread: 5 * scale,
      up: 5.5 * scale,
      size: (0.5 + Math.random() * 0.6) * scale,
      grow: 0.4,
      maxLife: 1 + Math.random() * 0.6,
      r: 0.55, g: 0.55, b: 0.6,
      gravity: -7,
    });
  }
  burstSmoke(pos, Math.floor(count / 2), scale);
}

/** عمود نور ذهبي (للترقية): بريق صاعد */
export function burstPillar(pos: Vec3, count = 24): void {
  for (let i = 0; i < count; i++) {
    spawn(sparklePool, pos, {
      spread: 0.4,
      up: 7,
      size: 0.5 + Math.random() * 0.4,
      grow: 0,
      maxLife: 1.1 + Math.random() * 0.5,
      r: 1, g: 0.85, b: 0.35,
    });
  }
}

/** لهب برتقالي متصاعد (احتراق طابق/كومة) + دخان خفيف */
export function burstFire(pos: Vec3, count = 12, scale = 1): void {
  for (let i = 0; i < count; i++) {
    spawn(sparklePool, pos, {
      spread: 1.2 * scale,
      up: 2.4 * scale,
      size: (0.5 + Math.random() * 0.5) * scale,
      grow: -0.4,
      maxLife: 0.5 + Math.random() * 0.4,
      r: 1, g: 0.45 + Math.random() * 0.25, b: 0.1,
    });
  }
  if (count >= 6) burstSmoke(pos, Math.floor(count / 3), scale * 0.7);
}

/** نزيف أحمر خفيف متقطع (جندي مجروح حي) */
export function burstBlood(pos: Vec3, count = 4): void {
  for (let i = 0; i < count; i++) {
    spawn(sparklePool, pos, {
      spread: 0.7,
      up: 1.4,
      size: 0.32 + Math.random() * 0.2,
      grow: -0.5,
      maxLife: 0.5 + Math.random() * 0.3,
      r: 0.82, g: 0.12, b: 0.12,
      gravity: -4,
    });
  }
}
