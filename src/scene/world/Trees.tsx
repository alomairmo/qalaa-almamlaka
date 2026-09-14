/**
 * أشجار السرو والنخيل والزيتون (instanced) بتوزيع عضوي كثيف عند الأطراف،
 * وشجيرات قصيرة في الوسط لا تحجب الأهداف — design.md §6 / الوثيقة §10.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { toonGradientMap, usePrefersReducedMotion } from '../palette';
import { castlePosition } from '@/engine/logic/geometry';
import { useGameStore } from '@/engine';

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

const dummy = new THREE.Object3D();

interface TreeSpot {
  x: number;
  z: number;
  s: number;
  rot: number;
}

/** توزيع عضوي: كثيف عند الأطراف، يتجنب القلاع والطرق */
function scatter(count: number, seed: number, teamCount: number, minR: number, maxR: number): TreeSpot[] {
  const rand = mulberry(seed);
  const spots: TreeSpot[] = [];
  const castles: [number, number][] = [];
  for (let i = 0; i < teamCount; i++) {
    const p = castlePosition(i, teamCount);
    castles.push([p.x, p.z]);
  }
  let guard = 0;
  while (spots.length < count && guard++ < count * 30) {
    const ang = rand() * Math.PI * 2;
    // توزيع متحيز للأطراف
    const r = minR + (maxR - minR) * Math.pow(rand(), 0.6);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (Math.abs(x) > 58 || Math.abs(z) > 58) continue;
    // ابتعد عن القلاع والطرق (المحاور الشعاعية)
    let ok = true;
    for (const [cx, cz] of castles) {
      if (Math.hypot(x - cx, z - cz) < 11) ok = false;
      // قرب الطريق: مسقط النقطة على شعاع القلعة
      const len = Math.hypot(cx, cz) || 1;
      const dx = cx / len;
      const dz = cz / len;
      const proj = x * dx + z * dz;
      if (proj > 4 && proj < len - 6) {
        const px = dx * proj;
        const pz = dz * proj;
        if (Math.hypot(x - px, z - pz) < 4.5) ok = false;
      }
    }
    if (!ok) continue;
    spots.push({ x, z, s: 0.75 + rand() * 0.7, rot: rand() * Math.PI * 2 });
  }
  return spots;
}

/** طبقة instanced واحدة: جزء شجرة (جذع أو مظلة) */
function InstancedPart({
  geometry,
  color,
  spots,
  offset,
  sway,
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  spots: (TreeSpot & { y?: number })[];
  offset: (s: TreeSpot) => { x: number; y: number; z: number; sx: number; sy: number; sz: number };
  sway?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const reduced = usePrefersReducedMotion();
  const material = useMemo(
    () => new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap() }),
    [color],
  );

  useMemo(() => {
    spots.forEach((s) => void s);
  }, [spots]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const o = offset(s);
      dummy.position.set(s.x + o.x, o.y, s.z + o.z);
      dummy.scale.set(o.sx, o.sy, o.sz);
      dummy.rotation.set(0, s.rot, 0);
      if (sway && !reduced) dummy.rotation.z = Math.sin(t * 1.2 + s.x * 0.7 + s.z) * 0.03;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, spots.length]} castShadow />;
}

export default function Trees() {
  const teamCount = useGameStore((s) => s.state.teams.length);

  const cypressTrunk = useMemo(() => new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), []);
  const cypressTop = useMemo(() => new THREE.ConeGeometry(0.85, 3.4, 7), []);
  const palmTrunk = useMemo(() => new THREE.CylinderGeometry(0.14, 0.24, 2.6, 6), []);
  const palmTop = useMemo(() => new THREE.SphereGeometry(1.15, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.45), []);
  const oliveTrunk = useMemo(() => new THREE.CylinderGeometry(0.22, 0.3, 1.0, 6), []);
  const oliveTop = useMemo(() => new THREE.IcosahedronGeometry(1.25, 1), []);
  const shrubGeo = useMemo(() => new THREE.IcosahedronGeometry(0.55, 0), []);

  const cypressSpots = useMemo(() => scatter(46, 11, teamCount, 34, 58), [teamCount]);
  const palmSpots = useMemo(() => scatter(30, 22, teamCount, 30, 56), [teamCount]);
  const oliveSpots = useMemo(() => scatter(26, 33, teamCount, 28, 55), [teamCount]);
  const shrubSpots = useMemo(() => scatter(26, 44, teamCount, 8, 30), [teamCount]);

  return (
    <group>
      {/* سرو: جذع بني + مخروط أخضر غامق */}
      <InstancedPart geometry={cypressTrunk} color="#6B4A2B" spots={cypressSpots} offset={(s) => ({ x: 0, y: 0.6 * s.s, z: 0, sx: s.s, sy: s.s, sz: s.s })} />
      <InstancedPart geometry={cypressTop} color="#2F7D4A" spots={cypressSpots} sway offset={(s) => ({ x: 0, y: (1.2 + 1.7) * s.s, z: 0, sx: s.s, sy: s.s, sz: s.s })} />
      {/* نخيل: جذع طويل + تاج */}
      <InstancedPart geometry={palmTrunk} color="#8A6238" spots={palmSpots} offset={(s) => ({ x: 0, y: 1.3 * s.s, z: 0, sx: s.s, sy: s.s, sz: s.s })} />
      <InstancedPart geometry={palmTop} color="#3F9B53" spots={palmSpots} sway offset={(s) => ({ x: 0, y: 2.7 * s.s, z: 0, sx: s.s, sy: s.s * 0.8, sz: s.s })} />
      {/* زيتون: جذع قصير + مظلة فضية-خضراء */}
      <InstancedPart geometry={oliveTrunk} color="#5E4028" spots={oliveSpots} offset={(s) => ({ x: 0, y: 0.5 * s.s, z: 0, sx: s.s, sy: s.s, sz: s.s })} />
      <InstancedPart geometry={oliveTop} color="#7DA05C" spots={oliveSpots} sway offset={(s) => ({ x: 0, y: 1.7 * s.s, z: 0, sx: s.s, sy: s.s * 0.85, sz: s.s })} />
      {/* شجيرات وسطى قصيرة */}
      <InstancedPart geometry={shrubGeo} color="#5FA054" spots={shrubSpots} offset={(s) => ({ x: 0, y: 0.35 * s.s, z: 0, sx: s.s, sy: s.s * 0.8, sz: s.s })} />
    </group>
  );
}
