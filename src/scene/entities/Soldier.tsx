/**
 * جنود chibi إجرائيون بثلاث رتب (design.md §6):
 * - مبتدئ: ثوب أخضر + سيف خشبي + ترس دائري صغير، بلا خوذة (الأصغر).
 * - جندي: درع سلسلي + سيف فولاذي + ترس طائرة بنجمة الفريق + خوذة أنفية.
 * - خبير: درع صفيحي مذهّب + خوذة بعرف + شمشير معقوف + عباءة (الأطول).
 * أنيميشن إجرائي: وقوف متنفس / مشي / احتفال / سقوط.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import gsap from 'gsap';
import type { Rank, TeamColor } from '@/contracts/types';
import { RANK_LABELS } from '@/contracts/defaults';
import { toonGradientMap, teamHex, usePrefersReducedMotion } from '../palette';
import { burstBlood } from '../effects/particle-pool';

export type SoldierAnim = 'idle' | 'walk' | 'celebrate' | 'dead' | 'carry';

/** لون شارة الرتبة: خبير ذهبي / جندي فضي / مبتدئ برونزي */
export const RANK_BADGE_COLORS: Record<Rank, string> = {
  expert: '#E8B93B',
  soldier: '#C0C8D4',
  novice: '#B07845',
};
const RANK_BADGE_ICONS: Record<Rank, string> = { expert: '★', soldier: '◆', novice: '●' };

/**
 * شارة رتبة دائمة فوق الجندي (بحجم شاشة ثابت عبر Html، فوق العمق دائمًا)
 * + tooltip باسم الرتبة العربية عند التحويم.
 */
export function RankBadge({ rank, hovered }: { rank: Rank; hovered: boolean }) {
  return (
    <Html center position={[0, 2.15, 0]} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }} occlude={false}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        {hovered && (
          <div
            dir="rtl"
            style={{
              fontFamily: "'Cairo', sans-serif",
              fontWeight: 900,
              fontSize: 12,
              color: '#2B2118',
              background: 'rgba(246,238,217,.95)',
              border: `1.5px solid ${RANK_BADGE_COLORS[rank]}`,
              borderRadius: 999,
              padding: '0 8px',
              whiteSpace: 'nowrap',
            }}
          >
            {RANK_LABELS[rank]}
          </div>
        )}
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: RANK_BADGE_COLORS[rank],
            border: '2px solid rgba(43,33,24,.85)',
            color: '#2B2118',
            fontSize: 10,
            fontWeight: 900,
            lineHeight: '13px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,.4)',
          }}
        >
          {RANK_BADGE_ICONS[rank]}
        </div>
      </div>
    </Html>
  );
}

function mat(color: string | number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap() });
}

const SKIN = '#E8B98A';
const RANK_SCALE: Record<Rank, number> = { novice: 0.85, soldier: 1.0, expert: 1.12 };

interface ModelProps {
  rank: Rank;
  teamColor: TeamColor;
  anim?: SoldierAnim;
  /** إزاحة طور الحركة حتى لا يتحرك الجميع بتزامن */
  phase?: number;
  /** شارة رتبة دائمة فوق الرأس + tooltip عربي عند التحويم */
  badge?: boolean;
  /** جريح (hp < maxHp): ينزف باستمرار أينما كان — حالة رسم مستمرة */
  bleeding?: boolean;
}

/** المجسم الكامل للجندي (يُستخدم في الخارج والقوافل) */
function SoldierModelInner({ rank, teamColor, anim = 'idle', phase = 0, badge = false, bleeding = false }: ModelProps) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Mesh>(null!);
  const legR = useRef<THREE.Mesh>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  const bleedAcc = useRef(0);

  const M = useMemo(
    () => ({
      skin: mat(SKIN),
      tunic: mat(rank === 'novice' ? '#4E9B47' : rank === 'soldier' ? '#9AA5B1' : '#5B5B66'),
      trim: mat(rank === 'expert' ? '#E8B93B' : teamHex(teamColor)),
      team: mat(teamHex(teamColor)),
      wood: mat('#7A5230'),
      steel: mat('#C8CFD8'),
      gold: mat('#E8B93B'),
      dark: mat('#3A3A44'),
      cape: mat(rank === 'expert' ? '#7A1F2B' : teamHex(teamColor)),
    }),
    [rank, teamColor],
  );

  const s = RANK_SCALE[rank];

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime * (reduced ? 0.25 : 1) + phase;
    const g = root.current;
    if (!g) return;
    // نزيف مستمر للجريح: دفقة حمراء خفيفة كل ~0.8ث (يتخطاها reduced-motion)
    if (bleeding && anim !== 'dead' && !reduced) {
      bleedAcc.current += dt;
      if (bleedAcc.current > 0.8) {
        bleedAcc.current = 0;
        const wp = new THREE.Vector3();
        g.getWorldPosition(wp);
        burstBlood({ x: wp.x, y: wp.y + 0.7, z: wp.z }, 3);
      }
    }
    if (anim === 'dead') {
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -Math.PI / 2.2, 0.08);
      g.position.y = THREE.MathUtils.lerp(g.position.y, 0.25, 0.08);
      return;
    }
    g.rotation.x = 0;
    const breathe = Math.sin(t * 2.2) * 0.02;
    if (anim === 'walk' || anim === 'carry') {
      const w = Math.sin(t * 7);
      g.position.y = Math.abs(Math.sin(t * 7)) * 0.07;
      if (legL.current) legL.current.rotation.x = w * 0.7;
      if (legR.current) legR.current.rotation.x = -w * 0.7;
      if (armL.current) armL.current.rotation.x = anim === 'carry' ? -1.1 : -w * 0.5;
      if (armR.current) armR.current.rotation.x = anim === 'carry' ? -1.1 : w * 0.5;
    } else if (anim === 'celebrate') {
      g.position.y = Math.abs(Math.sin(t * 5)) * 0.35;
      if (armL.current) armL.current.rotation.z = 2.6 + Math.sin(t * 8) * 0.2;
      if (armR.current) armR.current.rotation.z = -2.6 - Math.sin(t * 8) * 0.2;
      if (legL.current) legL.current.rotation.x = 0;
      if (legR.current) legR.current.rotation.x = 0;
    } else {
      // وقوف متنفس
      g.position.y = 0;
      if (body.current) body.current.scale.y = 1 + breathe;
      if (armL.current) armL.current.rotation.z = 0.25 + breathe * 2;
      if (armR.current) armR.current.rotation.z = -0.25 - breathe * 2;
      if (armL.current) armL.current.rotation.x = 0;
      if (armR.current) armR.current.rotation.x = 0;
      if (legL.current) legL.current.rotation.x = 0;
      if (legR.current) legR.current.rotation.x = 0;
    }
  });

  return (
    <group
      ref={root}
      scale={[s, s, s]}
      {...(badge
        ? {
            onPointerOver: () => setHovered(true),
            onPointerOut: () => setHovered(false),
          }
        : {})}
    >
      {badge && <RankBadge rank={rank} hovered={hovered} />}
      <group ref={body}>
        {/* قوام */}
        <mesh position={[0, 0.62, 0]} material={M.tunic} castShadow>
          <capsuleGeometry args={[0.3, 0.35, 4, 10]} />
        </mesh>
        {/* حزام بلون الفريق */}
        <mesh position={[0, 0.62, 0]} material={M.team}>
          <cylinderGeometry args={[0.31, 0.33, 0.12, 10]} />
        </mesh>
        {/* رأس كبير chibi */}
        <mesh position={[0, 1.18, 0]} material={M.skin} castShadow>
          <sphereGeometry args={[0.36, 14, 12]} />
        </mesh>
        {/* عينان */}
        <mesh position={[-0.12, 1.22, 0.31]} material={M.dark}>
          <sphereGeometry args={[0.045, 6, 6]} />
        </mesh>
        <mesh position={[0.12, 1.22, 0.31]} material={M.dark}>
          <sphereGeometry args={[0.045, 6, 6]} />
        </mesh>
        {/* عمامة/خوذة حسب الرتبة */}
        {rank === 'novice' && (
          <mesh position={[0, 1.38, 0]} material={M.trim}>
            <sphereGeometry args={[0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
          </mesh>
        )}
        {rank === 'soldier' && (
          <group position={[0, 1.34, 0]}>
            <mesh material={M.steel}>
              <sphereGeometry args={[0.33, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            </mesh>
            <mesh position={[0, -0.05, 0.3]} material={M.steel}>
              <boxGeometry args={[0.06, 0.22, 0.04]} />
            </mesh>
          </group>
        )}
        {rank === 'expert' && (
          <group position={[0, 1.36, 0]}>
            <mesh material={M.gold}>
              <sphereGeometry args={[0.34, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            </mesh>
            {/* عرف */}
            <mesh position={[0, 0.22, -0.05]} rotation={[0.4, 0, 0]} material={M.cape}>
              <coneGeometry args={[0.09, 0.45, 6]} />
            </mesh>
          </group>
        )}
        {/* عباءة الخبير */}
        {rank === 'expert' && (
          <mesh position={[0, 0.85, -0.28]} rotation={[0.15, 0, 0]} material={M.cape}>
            <boxGeometry args={[0.55, 0.9, 0.06]} />
          </mesh>
        )}
      </group>
      {/* أرجل */}
      <mesh ref={legL} position={[-0.14, 0.32, 0]} material={M.dark}>
        <capsuleGeometry args={[0.09, 0.22, 3, 8]} />
      </mesh>
      <mesh ref={legR} position={[0.14, 0.32, 0]} material={M.dark}>
        <capsuleGeometry args={[0.09, 0.22, 3, 8]} />
      </mesh>
      {/* ذراع السيف (يمين) */}
      <group ref={armR} position={[0.36, 0.88, 0]}>
        <mesh position={[0, -0.14, 0]} material={M.skin}>
          <capsuleGeometry args={[0.08, 0.24, 3, 8]} />
        </mesh>
        {rank === 'novice' ? (
          <mesh position={[0.02, -0.28, 0.16]} rotation={[Math.PI / 2, 0, 0]} material={M.wood}>
            <boxGeometry args={[0.07, 0.5, 0.03]} />
          </mesh>
        ) : rank === 'soldier' ? (
          <mesh position={[0.02, -0.28, 0.2]} rotation={[Math.PI / 2, 0, 0]} material={M.steel}>
            <boxGeometry args={[0.06, 0.58, 0.025]} />
          </mesh>
        ) : (
          // شمشير معقوف
          <group position={[0.02, -0.28, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh material={M.gold}>
              <boxGeometry args={[0.06, 0.5, 0.025]} />
            </mesh>
            <mesh position={[0, 0.32, 0.06]} rotation={[0.5, 0, 0]} material={M.gold}>
              <boxGeometry args={[0.06, 0.2, 0.025]} />
            </mesh>
          </group>
        )}
      </group>
      {/* ذراع الترس (يسار) */}
      <group ref={armL} position={[-0.36, 0.88, 0]}>
        <mesh position={[0, -0.14, 0]} material={M.skin}>
          <capsuleGeometry args={[0.08, 0.24, 3, 8]} />
        </mesh>
        {rank === 'soldier' ? (
          <mesh position={[-0.1, -0.2, 0.1]} rotation={[0, Math.PI / 2, 0]} material={M.team}>
            <cylinderGeometry args={[0.22, 0.22, 0.05, 3]} />
          </mesh>
        ) : (
          <mesh position={[-0.08, -0.2, 0.08]} rotation={[0, Math.PI / 2, 0]} material={rank === 'expert' ? M.gold : M.wood}>
            <cylinderGeometry args={[0.2, 0.2, 0.05, 12]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

export const SoldierModel = memo(SoldierModelInner);

/** رأس وأكتاف تطل من نافذة (ثلاث حالات إشغال الطابق) — تظهر بقفزة boing.
 *  شارة الرتبة فوق النافذة + نزيف مستمر إن كان مجروحًا. */
export function SoldierBust({ rank, teamColor, badge = false, bleeding = false }: { rank: Rank; teamColor: TeamColor; badge?: boolean; bleeding?: boolean }) {
  const popRef = useRef<THREE.Group>(null!);
  const bleedAcc = useRef(0);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (!popRef.current) return;
    popRef.current.scale.setScalar(0.01);
    gsap.to(popRef.current.scale, { x: 0.62, y: 0.62, z: 0.62, duration: 0.5, ease: 'back.out(2.5)' });
  }, []);
  useFrame((_, dt) => {
    if (!bleeding || reduced || !popRef.current) return;
    bleedAcc.current += dt;
    if (bleedAcc.current > 0.9) {
      bleedAcc.current = 0;
      const wp = new THREE.Vector3();
      popRef.current.getWorldPosition(wp);
      burstBlood({ x: wp.x, y: wp.y + 0.2, z: wp.z }, 2);
    }
  });
  const M = useMemo(
    () => ({
      skin: mat(SKIN),
      tunic: mat(rank === 'novice' ? '#4E9B47' : rank === 'soldier' ? '#9AA5B1' : '#5B5B66'),
      helm: mat(rank === 'soldier' ? '#C8CFD8' : '#E8B93B'),
      trim: mat(rank === 'expert' ? '#E8B93B' : teamHex(teamColor)),
      dark: mat('#3A3A44'),
    }),
    [rank, teamColor],
  );
  return (
    <group ref={popRef} scale={0.62}>
      {badge && <RankBadge rank={rank} hovered={false} />}
      <mesh position={[0, 0.1, 0]} material={M.tunic}>
        <cylinderGeometry args={[0.3, 0.38, 0.3, 10]} />
      </mesh>
      <mesh position={[0, 0.42, 0]} material={M.skin}>
        <sphereGeometry args={[0.36, 12, 10]} />
      </mesh>
      <mesh position={[-0.12, 0.46, 0.31]} material={M.dark}>
        <sphereGeometry args={[0.045, 6, 6]} />
      </mesh>
      <mesh position={[0.12, 0.46, 0.31]} material={M.dark}>
        <sphereGeometry args={[0.045, 6, 6]} />
      </mesh>
      {rank === 'novice' ? (
        <mesh position={[0, 0.62, 0]} material={M.trim}>
          <sphereGeometry args={[0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
        </mesh>
      ) : (
        <mesh position={[0, 0.6, 0]} material={M.helm}>
          <sphereGeometry args={[0.33, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        </mesh>
      )}
    </group>
  );
}
