/**
 * أكوام الذهب: عملات chunky متراكمة + بريق دوري + لافتة رقم بالمقدار
 * تواجه الكاميرا دائمًا (Cairo 900 أبيض على شريحة داكنة) — design.md §6.
 */
import { memo, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { GoldPile, Vec3 } from '@/contracts/types';
import { useGameStore } from '@/engine';
import { toonGradientMap } from '../palette';
import { pileScenePosition } from '../layout';

function goldMat(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: '#E8B93B', gradientMap: toonGradientMap(), emissive: '#B8860B', emissiveIntensity: 0.15 });
}

/** لافتة رقم عائمة تواجه الكاميرا — بحجم شاشة ثابت لتبقى مقروءة من بعيد */
export function ValueTag({ amount, icon = '🪙', large = false }: { amount: number; icon?: string; large?: boolean }) {
  return (
    <Html center position={[0, large ? 3.1 : 2.1, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div
        dir="rtl"
        style={{
          fontFamily: "'Cairo', sans-serif",
          fontWeight: 900,
          fontSize: large ? 26 : 18,
          color: '#FFFFFF',
          background: 'rgba(11,62,67,.85)',
          border: '1.5px solid rgba(245,215,110,.6)',
          borderRadius: 999,
          padding: large ? '3px 17px' : '2px 12px',
          whiteSpace: 'nowrap',
        }}
      >
        {icon} {amount}
      </div>
    </Html>
  );
}

function GoldPileInner({ pile, position }: { pile: GoldPile; position: Vec3 }) {
  const group = useRef<THREE.Group>(null!);
  const sparkle = useRef<THREE.Mesh>(null!);
  const M = useMemo(() => ({ gold: goldMat(), dark: goldMat() }), []);

  // عدد العملات الظاهرة يتناسب مع المقدار (سقف 14)
  const coins = useMemo(() => {
    const n = Math.min(14, Math.max(3, Math.round(pile.amount / 2)));
    const list: { x: number; z: number; y: number; r: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 1.3;
      const rr = (i % 3) * 0.32;
      list.push({
        x: Math.cos(a) * rr,
        z: Math.sin(a) * rr,
        y: 0.12 + Math.floor(i / 5) * 0.14,
        r: a,
      });
    }
    return list;
  }, [pile.amount]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) group.current.position.y = Math.sin(t * 1.6 + position.x) * 0.05;
    if (sparkle.current) {
      const cyc = (t % 4) / 4; // بريق كل ~4 ثوانٍ
      const s = cyc < 0.15 ? 1 - cyc / 0.15 : 0;
      sparkle.current.scale.setScalar(0.2 + s * 1.4);
      (sparkle.current.material as THREE.MeshBasicMaterial).opacity = s;
    }
  });

  // كومة خارجية أكبر ~1.5× لتكون هدفًا واضحًا من بعيد
  const big = pile.kind === 'outside';
  return (
    <group position={[position.x, 0, position.z]}>
      <group ref={group} scale={big ? 1.5 : 1}>
        {/* قاعدة ترابية */}
        <mesh position={[0, 0.05, 0]} receiveShadow>
          <cylinderGeometry args={[1.1, 1.3, 0.12, 12]} />
          <meshToonMaterial color="#C9B37E" gradientMap={toonGradientMap()} />
        </mesh>
        {coins.map((c, i) => (
          <mesh key={i} position={[c.x, c.y, c.z]} rotation={[0, c.r, 0]} material={M.gold} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 0.1, 10]} />
          </mesh>
        ))}
        {/* بريق */}
        <mesh ref={sparkle} position={[0.3, 0.9, 0.2]}>
          <octahedronGeometry args={[0.16, 0]} />
          <meshBasicMaterial color="#FFF3C4" transparent opacity={0} />
        </mesh>
      </group>
      <ValueTag amount={pile.amount} large={big} />
    </group>
  );
}

const GoldPileMesh = memo(GoldPileInner);

export default function GoldPiles({ piles }: { piles: GoldPile[] }) {
  const state = useGameStore((s) => s.state);
  return (
    <group>
      {piles.map((p) => (
        <GoldPileMesh key={p.id} pile={p} position={pileScenePosition(state, p)} />
      ))}
    </group>
  );
}
