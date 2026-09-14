/**
 * علامات الاستهداف في وضع الجيش: عند حوم المؤشر فوق هدف قابل للهجوم
 * تظهر دائرة حمراء + مثلث أحمر نابض فوقه (target-marker-red.svg motif)،
 * والنقر يمرّر الهدف للواجهة عبر جسر المشهد (armyTarget) — army.md.
 */
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useGameStore } from '@/engine';
import { selectArmyTarget, useAttackableTargets, useSceneBridge } from '../bridge';
import type { ArmyTarget } from '@/contracts/types';

/** علامة استهداف حمراء (دائرة + مثلث نابض + لافتة) — تُصدَّر لإعادة الاستخدام
 *  فوق القوافل المتحركة (Convoys.tsx) بنفس مظهر علامات القلاع */
export function Marker({ position, label, big }: { position: [number, number, number]; label: string; big: boolean }) {
  const ring = useRef<THREE.Mesh>(null!);
  const tri = useRef<THREE.Mesh>(null!);
  // القلاع: علامة أكبر تحيط بالقاعدة وترتفع فوق السطح حتى لا تختفي داخل البرج
  const ringInner = big ? 5.0 : 2.2;
  const ringOuter = big ? 5.7 : 2.8;
  const triY = big ? position[1] * 2 + 4.2 : position[1] + 3.4;
  const labelY = big ? position[1] * 2 + 6.4 : position[1] + 5.2;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      const s = 1 + Math.sin(t * 3.5) * 0.08;
      ring.current.scale.setScalar(s);
    }
    if (tri.current) {
      tri.current.position.y = triY + Math.sin(t * 2.6) * 0.35;
      tri.current.rotation.y = t * 1.2;
    }
  });
  return (
    <group position={[position[0], 0, position[2]]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
        <ringGeometry args={[ringInner, ringOuter, 32]} />
        <meshBasicMaterial color="#D64545" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={tri} position={[0, triY, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[big ? 1.3 : 0.9, big ? 1.8 : 1.3, 3]} />
        <meshBasicMaterial color="#D64545" />
      </mesh>
      <Html center position={[0, labelY, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div
          dir="rtl"
          style={{
            fontFamily: "'Cairo', sans-serif",
            fontWeight: 800,
            fontSize: 14,
            color: '#FFF',
            background: 'rgba(214,69,69,.9)',
            borderRadius: 999,
            padding: '2px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

export default function TargetMarkers() {
  const phase = useGameStore((s) => s.state.phase);
  const targets = useAttackableTargets();
  const [hovered, setHovered] = useState<number>(-1);
  const armyTarget = useSceneBridge((s) => s.armyTarget);

  const positions = useMemo(() => targets.map((t) => [t.position.x, t.position.y, t.position.z] as [number, number, number]), [targets]);

  if (phase !== 'army') return null;

  const handleClick = (t: ArmyTarget) => {
    // النقر يفتح نافذة الإرسال في الواجهة عبر الجسر (لا ننفذ الإرسال هنا)
    selectArmyTarget(t);
  };

  return (
    <group>
      {targets.map((t, i) => {
        const isCastle = t.target.kind === 'castle';
        return (
          <group
            key={i}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
              setHovered(i);
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
              setHovered((h) => (h === i ? -1 : h));
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleClick(t.target);
            }}
          >
            {/* منطقة حوم/نقر غير مرئية: اسطوانة تغطي القلعة كاملة (الكرة القديمة
                r=3.4 كانت مدفونة داخل جسم القلعة فلا يصلها المؤشر)، وكرة واسعة
                للأهداف الأرضية (أكوام/قوافل) */}
            <mesh position={positions[i]} visible={false}>
              {isCastle ? (
                <cylinderGeometry args={[5.8, 5.8, Math.max(22, positions[i][1] * 2 + 8), 12]} />
              ) : (
                <sphereGeometry args={[4.2, 8, 8]} />
              )}
            </mesh>
            {(hovered === i || JSON.stringify(armyTarget) === JSON.stringify(t.target)) && (
              <Marker position={positions[i]} label={t.label} big={isCastle} />
            )}
          </group>
        );
      })}
    </group>
  );
}
