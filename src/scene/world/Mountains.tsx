/**
 * جبال صحراوية محيطية متعددة الأوجه (تدرج رملي-وردي) — instanced، design.md §6.
 * توضع على حلقة خارج حدود الخريطة بأحجام عشوائية حتمية (seeded).
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { toonGradientMap } from '../palette';

/** عشوائية حتمية بسيطة حتى لا تتغير الخريطة بين الإطارات */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNT = 22;

export default function Mountains() {
  const { geometry, materials, transforms } = useMemo(() => {
    const rand = mulberry(20240601);
    // جبل من مخروط منخفض التفصيل (faceted)
    const geometry = new THREE.ConeGeometry(1, 1, 6, 3);
    geometry.computeVertexNormals();

    // تدرج رملي → وردي عبر لون النسيج الرأسي: نستخدم vertexColors
    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color('#E9D8A6');
    const rose = new THREE.Color('#D9A08B');
    const dark = new THREE.Color('#B98468');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 0.5; // 0..1
      const c = dark.clone().lerp(sand, Math.min(1, y * 1.4)).lerp(rose, Math.max(0, y - 0.55) * 1.2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradientMap(), fog: false });

    const transforms: { pos: [number, number, number]; scale: [number, number, number]; rotY: number }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const ang = (i / COUNT) * Math.PI * 2 + rand() * 0.22;
      const r = 80 + rand() * 16;
      const h = 8 + rand() * 10;
      const w = 10 + rand() * 9;
      transforms.push({
        pos: [Math.cos(ang) * r, h / 2 - 0.5, Math.sin(ang) * r],
        scale: [w, h, w],
        rotY: rand() * Math.PI,
      });
    }
    return { geometry, materials: [material], transforms };
  }, []);

  return (
    <group>
      {transforms.map((t, i) => (
        <mesh key={i} geometry={geometry} material={materials[0]} position={t.pos} scale={t.scale} rotation={[0, t.rotY, 0]} />
      ))}
    </group>
  );
}
