/**
 * راية فريق متموجة (banner-team-N.svg على مستوى مقسّم، تموّج رؤوس إجرائي).
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { usePrefersReducedMotion } from '../palette';

export default function Banner({ teamIndex, height = 2.6 }: { teamIndex: number; height?: number }) {
  const n = Math.min(4, Math.max(1, teamIndex + 1));
  const tex = useTexture(`./banner-team-${n}.svg`);
  const mesh = useRef<THREE.Mesh>(null!);
  const reduced = usePrefersReducedMotion();
  const width = (height * 2) / 3;

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, height, 6, 8);
    g.translate(0, -height / 2, 0); // معلّقة من الأعلى
    return g;
  }, [width, height]);

  const material = useMemo(
    () => new THREE.MeshToonMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
    [tex],
  );

  useFrame(({ clock }) => {
    if (!mesh.current || reduced) return;
    const t = clock.elapsedTime;
    const pos = mesh.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const hang = 1 - (y + height) / height; // 0 أعلى ← 1 أسفل
      pos.setZ(i, Math.sin(t * 2.4 + x * 2 + hang * 3) * 0.12 * hang);
    }
    pos.needsUpdate = true;
  });

  return (
    <group>
      {/* سارية */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.05, 0.05, height + 0.9, 6]} />
        <meshToonMaterial color="#8A6238" />
      </mesh>
      <mesh position={[0, height + 0.85, 0]}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshToonMaterial color="#E8B93B" />
      </mesh>
      {/* عارضة الراية */}
      <mesh position={[0, height - 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, width + 0.15, 6]} />
        <meshToonMaterial color="#8A6238" />
      </mesh>
      <mesh ref={mesh} geometry={geometry} material={material} position={[0, height, 0]} />
    </group>
  );
}
