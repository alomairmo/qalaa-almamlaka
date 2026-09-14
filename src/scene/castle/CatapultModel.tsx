/**
 * منجنيق خشبي chunky على سطح القلعة: قاعدة + عجلات + ذراع تتحرك
 * (تميل للخلف مع قوة الشحن وتضرب عند الإطلاق) + حجر محمّل.
 * أثناء وضع المنجنيق يدور المجسم كاملًا حول Y متتبعًا زاوية التصويب
 * (دورة كاملة 360° بلا تثبيت — انظر gesture.ts/CatapultRig).
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { toonGradientMap } from '../palette';
import { useSceneBridge } from '../bridge';
import { nearestEquivalentAngle } from '../camera/gesture';

function m(color: string | number) {
  // transparent دائمًا حتى نستطيع خفوت المجسم أثناء التصويب العالي (لا يحجب الهدف)
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap(), transparent: true });
}

/**
 * @param aiming عندما true (وضع المنجنيق لقلعة صاحب الدور) تتبع الذراع قوة الشحن،
 * ويدور المجسم مع زاوية التصويب (360°)، ويخفت تدريجيًا كلما ارتفعت زاوية
 * التصويب حتى لا يحجب الهدف (إصلاح: «عند رفع المنجنيق يغطي المجسم على
 * مكان التصويب»).
 */
export default function CatapultModel({ aiming = false }: { aiming?: boolean }) {
  const arm = useRef<THREE.Group>(null!);
  const yawGroup = useRef<THREE.Group>(null!);
  const M = useMemo(
    () => ({ wood: m('#8A6238'), darkWood: m('#5E4028'), iron: m('#4A4A55'), stone: m('#8D99AE'), gold: m('#E8B93B') }),
    [],
  );

  useFrame(() => {
    const bridge = useSceneBridge.getState();
    // دوران 360°: اتجاه المجسم يتبع زاوية التصويب حول اتجاه الأساس (نحو
    // مركز الخريطة = الوضع الساكن). أي قيمة راديان مقبولة — بلا تثبيت.
    if (yawGroup.current) {
      const cur = yawGroup.current.rotation.y;
      const targetYaw = aiming ? bridge.catapultBaseYaw - bridge.aimYaw : 0;
      yawGroup.current.rotation.y = THREE.MathUtils.lerp(cur, nearestEquivalentAngle(targetYaw, cur), 0.22);
    }
    if (!arm.current) return;
    const power = aiming ? bridge.power : 0;
    // الذراع مشدودة للخلف بحسب القوة (زاوية سالبة = مشدودة)
    const target = -0.5 - power * 0.7;
    arm.current.rotation.x = THREE.MathUtils.lerp(arm.current.rotation.x, target, 0.15);

    // خفوت مع ارتفاع التصويب: كامل حتى pitch≈0.5 ثم يتلاشى حتى 0.12 عند أقصى رفع
    const targetOpacity = aiming ? THREE.MathUtils.clamp(1 - (bridge.aimPitch - 0.5) * 2.4, 0.12, 1) : 1;
    for (const mat of Object.values(M)) {
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.18);
      mat.depthWrite = mat.opacity > 0.9;
    }
  });

  return (
    <group ref={yawGroup}>
      {/* هيكل */}
      <mesh position={[0, 0.35, 0]} material={M.wood} castShadow>
        <boxGeometry args={[1.4, 0.25, 2.0]} />
      </mesh>
      {/* دعائم مثلثة */}
      <mesh position={[0, 0.85, -0.5]} rotation={[0.5, 0, 0]} material={M.darkWood} castShadow>
        <boxGeometry args={[0.18, 1.3, 0.18]} />
      </mesh>
      <mesh position={[0, 0.85, -0.5]} rotation={[0.5, 0, 0]} material={M.darkWood}>
        <boxGeometry args={[1.2, 0.18, 0.18]} />
      </mesh>
      {/* عجلات */}
      {([[-0.75, 0.3, 0.7], [0.75, 0.3, 0.7], [-0.75, 0.3, -0.7], [0.75, 0.3, -0.7]] as const).map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]} rotation={[0, 0, Math.PI / 2]} material={M.darkWood} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.14, 10]} />
        </mesh>
      ))}
      {/* الذراع */}
      <group ref={arm} position={[0, 1.1, -0.4]}>
        <mesh position={[0, 0, 0.9]} material={M.wood} castShadow>
          <boxGeometry args={[0.16, 0.16, 2.2]} />
        </mesh>
        {/* كأس الحجر */}
        <mesh position={[0, 0.12, 1.85]} material={M.iron}>
          <sphereGeometry args={[0.3, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 0.22, 1.85]} material={M.stone} castShadow>
          <icosahedronGeometry args={[0.24, 0]} />
        </mesh>
        {/* ثقل حديدي */}
        <mesh position={[0, -0.18, -0.35]} material={M.iron}>
          <boxGeometry args={[0.34, 0.4, 0.5]} />
        </mesh>
      </group>
    </group>
  );
}
