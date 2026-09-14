/**
 * مشهد كشف التجنيد (حدث soldier-recruited):
 * يظهر الجندي الجديد **أمام القلعة** (جهة النوافذ/الكاميرا) تحت عمود نور
 * ذهبي وكشّاف ضوئي، والكاميرا تركّز عليه (مهمة focus-entity يجددها مشغّل
 * الأحداث أثناء الانتظار). يبقى واقفًا حتى تنادي الواجهة
 * confirmSticky(eventId) من البطاقة الثابتة (أو تُغلقها / مهلة 15ث)،
 * ثم يمشي ويدخل القلعة من بوابتها (إن كان داخليًا) أو يتحرك إلى خانته في
 * حلقة الخارجيين ويتلاشى (النسخة الدائمة يعرضها OutsideSoldiers).
 */
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Rank, TeamColor, Vec3 } from '@/contracts/types';
import { createStickyGate, stickyGateReleased, type StickyGate } from './bridge';
import { outsideSoldierPosition, yawTowards } from './layout';
import { SoldierModel } from './entities/Soldier';
import type { GameState } from '@/contracts/types';

interface Props {
  eventId: string;
  rank: Rank;
  teamColor: TeamColor;
  /** موضع الكشف أمام البوابة */
  reveal: Vec3;
  /** بوابة القلعة (مدخل الجنود الداخليين) */
  gate: Vec3;
  /** هل الجندي داخلي (يدخل القلعة) أم خارجي (يتجه لخانته) */
  inside: boolean;
  soldierId: string;
  teamId: string;
  state: GameState;
}

export function RecruitReveal({ eventId, rank, teamColor, reveal, gate, inside, soldierId, teamId, state }: Props) {
  const root = useRef<THREE.Group>(null!);
  const pillar = useRef<THREE.Mesh>(null!);
  const gateRef = useRef<StickyGate>(createStickyGate(eventId));
  const [phase, setPhase] = useState<'reveal' | 'walk'>('reveal');
  const phaseRef = useRef<'reveal' | 'walk'>('reveal');
  const walkStart = useRef(0);

  // وجهة المشي بعد التأكيد: بوابة القلعة (داخلي) أو خانة الحلقة الخارجية
  const dest = useMemo<Vec3>(() => {
    if (inside) return { ...gate };
    const team = state.teams.find((t) => t.id === teamId);
    const outside = team ? team.soldiers.filter((s) => s.state === 'outside') : [];
    const idx = Math.max(0, outside.findIndex((s) => s.id === soldierId));
    return outsideSoldierPosition(state, teamId, idx, Math.max(1, outside.length));
  }, [inside, gate, state, teamId, soldierId]);

  useFrame(({ clock }) => {
    const g = root.current;
    if (!g) return;
    const t = clock.elapsedTime;

    if (phaseRef.current === 'reveal') {
      // وقوف تحت النور حتى تأكيد البطاقة الثابتة
      if (stickyGateReleased(gateRef.current)) {
        phaseRef.current = 'walk';
        setPhase('walk');
        walkStart.current = performance.now();
      }
      g.position.set(reveal.x, 0, reveal.z);
      g.rotation.y = yawTowards(reveal, gate);
      g.scale.setScalar(1);
    } else {
      const WALK_MS = 1100;
      const q = Math.min(1, (performance.now() - walkStart.current) / WALK_MS);
      const x = reveal.x + (dest.x - reveal.x) * q;
      const z = reveal.z + (dest.z - reveal.z) * q;
      g.position.set(x, 0, z);
      g.rotation.y = yawTowards(reveal, dest);
      // تلاشٍ عند الوصول (الدخول من الباب / الانضمام للحلقة الظاهرة أصلًا)
      g.scale.setScalar(q > 0.8 ? Math.max(0.01, 1 - (q - 0.8) / 0.2) : 1);
    }

    // نبض عمود النور أثناء الكشف ثم يخبو أثناء المشي
    if (pillar.current) {
      const m = pillar.current.material as THREE.MeshBasicMaterial;
      if (phaseRef.current === 'reveal') {
        m.opacity = 0.4 + Math.sin(t * 3) * 0.12;
      } else {
        m.opacity = Math.max(0, m.opacity - 0.04);
      }
    }
  });

  return (
    <group>
      <group ref={root} position={[reveal.x, 0, reveal.z]}>
        <SoldierModel rank={rank} teamColor={teamColor} anim={phase === 'walk' ? 'walk' : 'idle'} badge />
      </group>
      {/* عمود نور ذهبي خفيف فوق المجند الجديد */}
      <mesh ref={pillar} position={[reveal.x, 4.5, reveal.z]}>
        <cylinderGeometry args={[0.9, 1.3, 9, 12, 1, true]} />
        <meshBasicMaterial color="#F5D76E" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* كشّاف ضوئي موجّه عليه */}
      <spotLight
        position={[reveal.x, 10, reveal.z]}
        target-position={[reveal.x, 0, reveal.z]}
        angle={0.35}
        penumbra={0.6}
        intensity={phase === 'reveal' ? 60 : 0}
        color="#FFE9A8"
        distance={18}
      />
    </group>
  );
}
