/**
 * أكوام الحجارة الخارجية — الوثيقة §9:
 * كل 5 حجارة = هرم (4 قاعدة + 1 أعلى)، والباقي مجسم بحجمه (4/3/2/1).
 * لا دمج تلقائي داخل الجولة — العرض مشتق مباشرة من stonesOutside
 * (إعادة الترتيب تحدث في دور صاحبها لأن المحرك يخصم من العدد فقط).
 */
import { memo, useMemo } from 'react';
import * as THREE from 'three';
import { STONE_PYRAMID_SIZE } from '@/contracts/defaults';
import { toonGradientMap } from '../palette';
import { ValueTag } from './GoldPile';

function stoneMat(color = '#8D99AE') {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap() });
}

function Boulder({ position, scale = 1, material }: { position: [number, number, number]; scale?: number; material: THREE.Material }) {
  return (
    <mesh position={position} scale={scale} rotation={[position[0] * 1.7, position[2] * 2.3, 0]} material={material} castShadow>
      <icosahedronGeometry args={[0.42, 0]} />
    </mesh>
  );
}

/** مجسم كومة واحدة حسب عددها (1..5) */
function StoneStack({ count, position, material }: { count: number; position: [number, number, number]; material: THREE.Material }) {
  const stones = useMemo((): [number, number, number][] => {
    const d = 0.62;
    switch (Math.min(5, count)) {
      case 1:
        return [[0, 0.35, 0]];
      case 2:
        return [[-d / 2, 0.35, 0], [d / 2, 0.35, 0]];
      case 3:
        return [[-d / 2, 0.35, d / 3], [d / 2, 0.35, d / 3], [0, 0.35, -d / 2.5]];
      case 4:
        return [[-d / 2, 0.35, -d / 2], [d / 2, 0.35, -d / 2], [-d / 2, 0.35, d / 2], [d / 2, 0.35, d / 2]];
      default:
        // هرم خماسي: 4 قاعدة + 1 أعلى
        return [
          [-d / 2, 0.35, -d / 2],
          [d / 2, 0.35, -d / 2],
          [-d / 2, 0.35, d / 2],
          [d / 2, 0.35, d / 2],
          [0, 0.95, 0],
        ];
    }
  }, [count]);
  return (
    <group position={position}>
      {stones.map((p, i) => (
        <Boulder key={i} position={p} material={material} />
      ))}
    </group>
  );
}

/** كل أكوام فريق واحد (أهرامات + باقٍ) في صف بجانب القلعة */
function TeamStonesInner({ count, position }: { count: number; position: [number, number, number] }) {
  const material = useMemo(() => stoneMat(), []);
  const stacks = useMemo(() => {
    const list: number[] = [];
    let rest = count;
    while (rest >= STONE_PYRAMID_SIZE) {
      list.push(STONE_PYRAMID_SIZE);
      rest -= STONE_PYRAMID_SIZE;
    }
    if (rest > 0) list.push(rest);
    return list;
  }, [count]);

  if (count <= 0) return null;
  return (
    <group position={position}>
      {stacks.map((c, i) => (
        <StoneStack key={i} count={c} position={[i * 1.6 - ((stacks.length - 1) * 1.6) / 2, 0, 0]} material={material} />
      ))}
      <ValueTag amount={count} icon="🪨" />
    </group>
  );
}

export const TeamStones = memo(TeamStonesInner);
