/**
 * الحياة المحيطة: غيوم billboard منجرفة (sky-clouds.png)، طيور تدور،
 * جسيمات غبار عائمة، دخان مداخن من القلاع — design.md §6.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { useGameStore } from '@/engine';
import { teamCastlePos, roofHeight } from '../layout';
import { usePrefersReducedMotion } from '../palette';

/** عشوائية حتمية (لا Math.random أثناء الرندر) */
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

/** غيوم billboard تنجرف ببطء وتلتف حول الأفق */
function Clouds() {
  const tex = useTexture('./sky-clouds.png');
  const reduced = usePrefersReducedMotion();
  const group = useRef<THREE.Group>(null!);
  const clouds = useMemo(() => {
    const list: { x: number; y: number; z: number; w: number; speed: number; opacity: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2;
      const r = 55 + (i % 3) * 14;
      list.push({
        x: Math.cos(ang) * r,
        y: 26 + (i % 4) * 6,
        z: Math.sin(ang) * r,
        w: 22 + (i % 3) * 8,
        speed: 0.35 + (i % 3) * 0.18,
        opacity: 0.75,
      });
    }
    return list;
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
        toneMapped: false,
      }),
    [tex],
  );

  useFrame(({ camera, clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const c = clouds[i];
      if (!reduced) {
        // انجراف بطيء مع التفاف عند الحواف
        child.position.x = ((((c.x + t * c.speed) % 140) + 140) % 140) - 70;
      }
      child.quaternion.copy(camera.quaternion); // billboard
    });
  });

  return (
    <group ref={group} renderOrder={-1}>
      {clouds.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} material={material}>
          <planeGeometry args={[c.w, c.w / 4]} />
        </mesh>
      ))}
    </group>
  );
}

/** سرب طيور يدور حلزونيًا — أجنحة ترفرف */
function BirdFlock({ center, radius, height, phase }: { center: [number, number]; radius: number; height: number; phase: number }) {
  const group = useRef<THREE.Group>(null!);
  const reduced = usePrefersReducedMotion();
  const birdMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3A3A44' }), []);
  const wingGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.7, 0.25);
    g.translate(0.35, 0, 0);
    return g;
  }, []);
  const birds = useMemo(() => [0, 1, 2].map((i) => ({ off: i * 0.9 })), []);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime * (reduced ? 0.15 : 1);
    group.current.children.forEach((bird, i) => {
      const a = t * 0.25 + phase + birds[i].off;
      bird.position.set(center[0] + Math.cos(a) * radius, height + Math.sin(t * 0.8 + i) * 0.8, center[1] + Math.sin(a) * radius);
      bird.rotation.y = -a;
      const flap = Math.sin(t * 8 + i * 1.7) * 0.7;
      const l = bird.children[0];
      const r = bird.children[1];
      if (l && r) {
        l.rotation.z = flap;
        r.rotation.z = Math.PI - flap;
      }
    });
  });

  return (
    <group ref={group}>
      {birds.map((_, i) => (
        <group key={i}>
          <mesh geometry={wingGeo} material={birdMat} rotation={[-Math.PI / 2, 0, 0]} />
          <mesh geometry={wingGeo} material={birdMat} rotation={[-Math.PI / 2, 0, Math.PI]} />
        </group>
      ))}
    </group>
  );
}

/** جسيمات غبار عائمة (نقاط خفيفة تسبح) — مواقع حتمية مزروعة */
function DustMotes() {
  const ref = useRef<THREE.Points>(null!);
  const reduced = usePrefersReducedMotion();
  const { geometry, base } = useMemo(() => {
    const rand = mulberry(777);
    const N = 90;
    const base = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      base[i * 3] = (rand() - 0.5) * 110;
      base[i * 3 + 1] = 1 + rand() * 14;
      base[i * 3 + 2] = (rand() - 0.5) * 110;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    return { geometry, base };
  }, []);

  useFrame(({ clock }) => {
    if (reduced || !ref.current) return;
    const t = clock.elapsedTime;
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        base[i * 3] + Math.sin(t * 0.12 + i) * 2,
        base[i * 3 + 1] + Math.sin(t * 0.2 + i * 2.1) * 0.8,
        base[i * 3 + 2] + Math.cos(t * 0.1 + i) * 2,
      );
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial size={0.18} color="#F5E9C8" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** دخان مداخن: عمود دخان صاعد من أول قلعتين (بحد أقصى) */
function ChimneySmoke() {
  const teams = useGameStore((s) => s.state.teams);
  const reduced = usePrefersReducedMotion();
  const ref = useRef<THREE.Group>(null!);
  const emitters = useMemo(() => teams.slice(0, 2).map((t) => teamCastlePos(useGameStore.getState().state, t.id)), [teams]);
  // مادة لكل نفثة (شفافيتها تُحرَّك دوريًا)
  const puffMats = useMemo(
    () =>
      Array.from(
        { length: emitters.length * 5 },
        () => new THREE.MeshBasicMaterial({ color: '#C9CDD4', transparent: true, opacity: 0.4, depthWrite: false }),
      ),
    [emitters.length],
  );

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = reduced ? 0 : clock.elapsedTime;
    ref.current.children.forEach((emitter, e) => {
      emitter.children.forEach((puff, i) => {
        const cycle = ((t * 0.35 + i / emitter.children.length) % 1 + 1) % 1;
        puff.position.y = cycle * 4;
        const s = 0.3 + cycle * 0.8;
        puff.scale.setScalar(s);
        puff.position.x = Math.sin(cycle * 4 + e) * 0.4;
        ((puff as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - cycle);
      });
    });
  });

  return (
    <group ref={ref}>
      {emitters.map((p, e) => {
        const team = teams[e];
        const top = team ? roofHeight(team) : 4;
        return (
          <group key={e} position={[p.x + 2.2, top + 0.5, p.z - 2.2]}>
            {[0, 1, 2, 3, 4].map((i) => (
              <mesh key={i} material={puffMats[e * 5 + i]}>
                <sphereGeometry args={[0.5, 6, 5]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

export default function Ambience() {
  return (
    <group>
      <Clouds />
      <BirdFlock center={[0, 0]} radius={30} height={22} phase={0} />
      <BirdFlock center={[15, -10]} radius={18} height={27} phase={2.2} />
      <DustMotes />
      <ChimneySmoke />
    </group>
  );
}
