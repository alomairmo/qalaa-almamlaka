/**
 * GameCanvas — نقطة التصدير الرئيسية للمشهد ثلاثي الأبعاد.
 *
 * الدمج (من App.tsx أو شاشة اللعب):
 *   import { GameCanvas } from '@/scene';
 *   <GameCanvas />            // بلا props — يملأ الشاشة (position: fixed, zIndex: 0)
 *
 * كل التفاعل يمر عبر عقود المحرك المجمّدة (useGameStore / engineApi) وعبر
 * جسر المشهد src/scene/bridge.ts لحالات التصويب/القوة/اختيار هدف الجيش.
 * انظر src/scene/index.ts لتفاصيل ما تقرأه الواجهة من الجسر.
 */
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { useGameStore } from '@/engine';
import { PALETTE } from './palette';
import Terrain from './world/Terrain';
import Mountains from './world/Mountains';
import Trees from './world/Trees';
import Ambience from './world/Ambience';
import Castle from './castle/Castle';
import OutsideSoldiers from './entities/OutsideSoldiers';
import GoldPiles from './entities/GoldPile';
import { TeamStones } from './entities/StonePiles';
import Convoys from './entities/Convoys';
import Particles from './effects/Particles';
import DamageFloats from './effects/DamageFloats';
import TargetMarkers from './effects/TargetMarkers';
import Labels from './Labels';
import CameraRig from './camera/CameraRig';
import CatapultRig from './camera/CatapultRig';
import EventPlayer from './event-player';
import { stonesPosition } from './layout';

/** قبة سماء متدرجة: #AEE3F5 أعلى ← #E8F6E8 ← #F6EED9 عند الأفق (design.md §2.3) */
function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(PALETTE.sky300) },
          mid: { value: new THREE.Color('#E8F6E8') },
          bottom: { value: new THREE.Color(PALETTE.skyHorizon) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
          varying vec3 vPos;
          void main() {
            float h = normalize(vPos).y; // -1..1
            vec3 c = h > 0.12
              ? mix(mid, top, smoothstep(0.12, 0.75, h))
              : mix(bottom, mid, smoothstep(-0.08, 0.12, h));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  return (
    <mesh material={material} renderOrder={-10}>
      <sphereGeometry args={[300, 24, 16]} />
    </mesh>
  );
}

/** إضاءة design.md §6: شمس دافئة 45° + سماوي ambient + حافة خفيفة */
function Lights() {
  return (
    <group>
      <ambientLight color={PALETTE.sky300} intensity={0.6} />
      <directionalLight
        position={[60, 85, 30]}
        color={PALETTE.sun}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-75}
        shadow-camera-right={75}
        shadow-camera-top={75}
        shadow-camera-bottom={-75}
        shadow-camera-near={10}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
      />
      {/* حافة باردة خفيفة على القلاع */}
      <directionalLight position={[-40, 30, -50]} color={PALETTE.sky300} intensity={0.35} />
    </group>
  );
}

/** كل القلاع من حالة اللعبة */
function Castles() {
  const teams = useGameStore((s) => s.state.teams);
  return (
    <group>
      {teams.map((t) => (
        <Castle key={t.id} team={t} />
      ))}
    </group>
  );
}

/** أكوام الحجارة لكل الفرق */
function AllStones() {
  const state = useGameStore((s) => s.state);
  return (
    <group>
      {state.teams.map((t) => {
        const p = stonesPosition(state, t.id);
        return t.stonesOutside > 0 ? <TeamStones key={t.id} count={t.stonesOutside} position={[p.x, 0, p.z]} /> : null;
      })}
    </group>
  );
}

function SceneContent() {
  const state = useGameStore((s) => s.state);
  return (
    <group>
      <SkyDome />
      <Lights />
      <Terrain />
      <Mountains />
      <Trees />
      <Ambience />
      <Castles />
      <OutsideSoldiers state={state} />
      <GoldPiles piles={state.piles} />
      <AllStones />
      <Convoys state={state} />
      <Particles />
      <DamageFloats />
      <Labels state={state} />
      <TargetMarkers />
      <CameraRig />
      <CatapultRig />
      <EventPlayer />
    </group>
  );
}

export default function GameCanvas() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0 }} dir="rtl">
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 40, near: 0.5, far: 400, position: [58, 62, 58] }}
        style={{ width: '100%', height: '100%' }}
      >
        <fog attach="fog" args={[PALETTE.fog, 60, 180]} />
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  );
}
