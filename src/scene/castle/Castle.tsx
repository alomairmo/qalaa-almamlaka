/**
 * القلعة المعيارية (design.md §6 / الوثيقة §3):
 * قاعدة حجرية غير قابلة للهدم (بوابة بقوس حدوي + أبراج زاوية بأسلوب مئذنة)
 * + وحدات طوابق تتكدس (نافذتان مقوستان باتجاه الكاميرا بثلاث حالات إشغال
 * + حافة مسننة) + قبة علوية مزججة بلون الفريق + منصة منجنيق + راية متموجة.
 * حالات الضرر: تشققات عند hp<50% (overlay داكن)، ملمس stone-wall.
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import type { Floor, Soldier, Team } from '@/contracts/types';
import { useGameStore } from '@/engine';
import { teamCastlePos, castleFacingYaw, teamIndex, catapultPlatformLocal } from '../layout';
import { toonGradientMap, mixHex, teamHex, usePrefersReducedMotion } from '../palette';
import { burstFire } from '../effects/particle-pool';
import Banner from './Banner';
import CatapultModel from './CatapultModel';
import { SoldierBust } from '../entities/Soldier';

const BASE_H = 4;
const FLOOR_H = 3;
const BASE_W = 9;
const FLOOR_W = 7.4;

function stoneMat(map: THREE.Texture | null, tint = '#ffffff'): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color: tint, gradientMap: toonGradientMap(), map: map ?? undefined });
}

/** حافة مسننة (شرفات) على محيط مربع */
function Crenellation({ width, y, material }: { width: number; y: number; material: THREE.Material }) {
  const teeth = useMemo(() => {
    const list: [number, number][] = [];
    const half = width / 2;
    const step = 1.1;
    for (let i = -half + 0.55; i <= half - 0.4; i += step) {
      list.push([i, -half + 0.3]);
      list.push([i, half - 0.3]);
      list.push([-half + 0.3, i]);
      list.push([half - 0.3, i]);
    }
    return list;
  }, [width]);
  return (
    <group position={[0, y, 0]}>
      {/* الأسننة تتغلغل 0.05 في سطح الطابق (لا قاعدة مستوية ملتصقة → لا z-fighting) */}
      {teeth.map((p, i) => (
        <mesh key={i} position={[p[0], 0.2, p[1]]} material={material} castShadow>
          <boxGeometry args={[0.55, 0.5, 0.55]} />
        </mesh>
      ))}
    </group>
  );
}

/** قوس حدوي (بوابة أو نافذة): إطار حجري فاتح + عمق داكن */
function HorseshoeArch({ w, h, material, dark }: { w: number; h: number; material: THREE.Material; dark: THREE.Material }) {
  return (
    <group>
      <mesh material={dark}>
        <planeGeometry args={[w * 0.72, h * 0.78]} />
      </mesh>
      <mesh position={[0, h * 0.32, 0]} material={dark}>
        <circleGeometry args={[w * 0.36, 14, 0, Math.PI]} />
      </mesh>
      {/* إطار القوس */}
      <mesh position={[0, h * 0.32, 0.005]} material={material}>
        <ringGeometry args={[w * 0.36, w * 0.5, 14, 1, 0, Math.PI]} />
      </mesh>
      <mesh position={[-w * 0.43, 0, 0.005]} material={material}>
        <boxGeometry args={[w * 0.14, h * 0.78, 0.01]} />
      </mesh>
      <mesh position={[w * 0.43, 0, 0.005]} material={material}>
        <boxGeometry args={[w * 0.14, h * 0.78, 0.01]} />
      </mesh>
    </group>
  );
}

/** برج زاوية بأسلوب مئذنة: أسطوانة + شرفة + قبة صغيرة */
function MinaretTower({ position, material, domeMaterial }: { position: [number, number, number]; material: THREE.Material; domeMaterial: THREE.Material }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.4, 0]} material={material} castShadow>
        <cylinderGeometry args={[0.75, 0.9, 4.8, 10]} />
      </mesh>
      <mesh position={[0, 4.95, 0]} material={material} castShadow>
        <cylinderGeometry args={[1.0, 1.0, 0.35, 10]} />
      </mesh>
      <mesh position={[0, 5.55, 0]} material={domeMaterial} castShadow>
        <sphereGeometry args={[0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, 6.1, 0]} material={domeMaterial}>
        <coneGeometry args={[0.1, 0.45, 6]} />
      </mesh>
    </group>
  );
}

/**
 * احتراق مستمر فوق طابق مصاب (لهب ودخان خفيف) — حالة رسم دائمة:
 * يشتعل ما دام hp < maxHp وينطفئ عند الإصلاح الكامل (الطابق المتهدم يُزال
 * من الحالة أصلًا). ينبعث من علامة فوق الطابق جهة الواجهة.
 */
function BurningFloor({ anchor }: { anchor: React.RefObject<THREE.Object3D | null> }) {
  const acc = useRef(0);
  const flame = useRef<THREE.Mesh>(null!);
  const reduced = usePrefersReducedMotion();
  useFrame(({ clock }, dt) => {
    if (flame.current) {
      const m = flame.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.55 + Math.sin(clock.elapsedTime * 9) * 0.2;
      flame.current.scale.y = 1 + Math.sin(clock.elapsedTime * 7) * 0.18;
    }
    if (reduced || !anchor.current) return;
    acc.current += dt;
    if (acc.current > 0.4) {
      acc.current = 0;
      const wp = new THREE.Vector3();
      anchor.current.getWorldPosition(wp);
      burstFire({ x: wp.x, y: wp.y, z: wp.z }, 5, 0.7);
    }
  });
  return (
    <mesh ref={flame} position={[0, 0.5, 0]}>
      <coneGeometry args={[0.55, 1.4, 8]} />
      <meshBasicMaterial color="#F08A24" transparent opacity={0.6} depthWrite={false} />
    </mesh>
  );
}

/** طابق: صندوق حجري + نافذتان مقوستان + شرفات + حالات إشغال وتشقق */
function FloorModule({
  floor,
  occupants,
  y,
  materials,
  teamColor,
}: {
  floor: Floor;
  occupants: Soldier[]; // حتى جنديين يطلان من النافذتين
  y: number;
  materials: { wall: THREE.Material; trim: THREE.Material; dark: THREE.Material; crack: THREE.Material };
  teamColor: Team['color'];
}) {
  const damaged = floor.hp < floor.maxHp / 2;
  const burning = floor.hp < floor.maxHp; // مصاب ولم يُهدم: يحترق حتى يُصلَح
  const fireAnchor = useRef<THREE.Group>(null!);
  const windows: (Soldier | null)[] = [occupants[0] ?? null, occupants[1] ?? null];
  // أنيميشن «الطابق يصعد» عند البناء: y-scale 0→1 مع ارتداد (battles-convoys.md §5)
  const growRef = useRef<THREE.Group>(null!);
  useEffect(() => {
    if (!growRef.current) return;
    growRef.current.scale.y = 0.05;
    gsap.to(growRef.current.scale, { y: 1, duration: 0.9, ease: 'bounce.out' });
  }, []);
  return (
    <group position={[0, y, 0]}>
      <group ref={growRef}>
      {/* الصندوق أقصر بـ 0.04 من ارتفاع الطابق حتى لا يلتصق سطحه العلوي
          بقاعة الطابق التالي (z-fighting «سطحين متداخلين»)؛ الفجوة تغطيها
          الشرفة المسننة والشريط الزخرفي البارز */}
      <mesh position={[0, (FLOOR_H - 0.04) / 2, 0]} material={materials.wall} castShadow receiveShadow>
        <boxGeometry args={[FLOOR_W, FLOOR_H - 0.04, FLOOR_W]} />
      </mesh>
      {/* شريط زخرفي علوي: يعلو سطح الصندوق بـ 0.14 ويتغلغل فيه 0.16 — بلا مستويات متطابقة */}
      <mesh position={[0, FLOOR_H - 0.05, 0]} material={materials.trim}>
        <boxGeometry args={[FLOOR_W + 0.15, 0.3, FLOOR_W + 0.15]} />
      </mesh>
      <Crenellation width={FLOOR_W + 0.2} y={FLOOR_H} material={materials.wall} />
      {/* النافذتان على الواجهة (+Z المحلي) */}
      {windows.map((occ, i) => (
        <group key={i} position={[(i - 0.5) * 2.4, FLOOR_H * 0.42, FLOOR_W / 2 + 0.01]}>
          <HorseshoeArch w={1.3} h={1.7} material={materials.trim} dark={materials.dark} />
          {occ && (
            <group position={[0, -0.35, 0.12]}>
              <SoldierBust rank={occ.rank} teamColor={teamColor} badge bleeding={occ.hp < occ.maxHp} />
            </group>
          )}
        </group>
      ))}
      {/* احتراق مستمر فوق الطابق المصاب (حتى الإصلاح) */}
      {burning && (
        <group ref={fireAnchor} position={[0, FLOOR_H + 0.2, FLOOR_W * 0.22]}>
          <BurningFloor anchor={fireAnchor} />
        </group>
      )}
      {/* تشققات عند ضرر < 50% */}
      {damaged && (
        <group position={[0, FLOOR_H / 2, FLOOR_W / 2 + 0.02]}>
          <mesh position={[-1.2, 0.3, 0]} rotation={[0, 0, 0.5]} material={materials.crack}>
            <planeGeometry args={[0.18, 1.8]} />
          </mesh>
          <mesh position={[0.9, -0.2, 0]} rotation={[0, 0, -0.4]} material={materials.crack}>
            <planeGeometry args={[0.14, 1.4]} />
          </mesh>
          <mesh position={[0.1, 0.6, 0]} rotation={[0, 0, 1.2]} material={materials.crack}>
            <planeGeometry args={[0.12, 1.1]} />
          </mesh>
        </group>
      )}
      </group>
    </group>
  );
}

function CastleInner({ team }: { team: Team }) {
  const state = useGameStore((s) => s.state);
  const stoneTex = useTexture('./stone-wall-texture.png');
  const phase = useGameStore((s) => s.state.phase);
  const idx = teamIndex(state, team.id);
  const pos = teamCastlePos(state, team.id);
  const yaw = castleFacingYaw(pos);

  const textures = useMemo(() => {
    const mk = (rx: number, ry: number) => {
      const t = stoneTex.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { base: mk(2, 1), floor: mk(2, 0.8) };
  }, [stoneTex]);

  const M = useMemo(
    () => ({
      base: stoneMat(textures.base),
      floor: stoneMat(textures.floor),
      trim: stoneMat(null, '#E8EDF4'), // فاتح واضح (parchment مزرقّ) — يُقرأ جيدًا على السطوح
      dark: new THREE.MeshBasicMaterial({ color: '#241A12' }),
      crack: new THREE.MeshBasicMaterial({ color: '#3A3230' }),
      dome: new THREE.MeshToonMaterial({
        color: mixHex('#2EC4B6', teamHex(team.color), 0.45),
        gradientMap: toonGradientMap(),
      }),
      gold: stoneMat(null, '#E8B93B'),
    }),
    [textures, team.color],
  );

  // توزيع الجنود الداخليين على النوافذ: جنديان لكل طابق من الأعلى للأسفل،
  // وما تبقى (حتى جنديين — الأرخص ثمنًا) يظهران في نافذتي القاعدة الأرضية
  const insideSoldiers = useMemo(() => team.soldiers.filter((s) => s.state === 'inside'), [team.soldiers]);
  const { floorOccupants, baseOccupants } = useMemo(() => {
    const map = new Map<string, Soldier[]>();
    const floors = team.castle.floors;
    let cursor = 0;
    // الأثمن يُحفظ أولًا: الجنود مرتبون حسب الأولوية — نملأ من الأعلى
    for (let i = floors.length - 1; i >= 0 && cursor < insideSoldiers.length; i--) {
      const take = insideSoldiers.slice(cursor, cursor + 2);
      map.set(floors[i].id, take);
      cursor += take.length;
    }
    return { floorOccupants: map, baseOccupants: insideSoldiers.slice(cursor, cursor + 2) };
  }, [team.castle.floors, insideSoldiers]);

  const topY = BASE_H + team.castle.floors.length * FLOOR_H;
  const isMyCatapult = phase === 'catapult' && state.teams[state.turnIndex]?.id === team.id;
  const baseDamaged = team.castle.baseHp < team.castle.baseMaxHp / 2;
  const plat = catapultPlatformLocal(pos);
  // الراية في الجهة المعاكسة لمنصة المنجنيق حتى لا تتداخلا مهما كان اتجاه القلعة
  const platLen = Math.hypot(plat.x, plat.z) || 1;
  const bannerX = (-plat.x / platLen) * 3.0;
  const bannerZ = (-plat.z / platLen) * 3.0;

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, yaw, 0]}>
      {/* القاعدة الأرضية */}
      <group>
        <mesh position={[0, BASE_H / 2, 0]} material={M.base} castShadow receiveShadow>
          <boxGeometry args={[BASE_W, BASE_H, BASE_W]} />
        </mesh>
        {/* بوابة بقوس حدوي على الواجهة */}
        <group position={[0, 1.5, BASE_W / 2 + 0.01]}>
          <HorseshoeArch w={2.4} h={2.9} material={M.gold} dark={M.dark} />
          {/* باب خشبي */}
          <mesh position={[0, -0.28, -0.005]}>
            <planeGeometry args={[1.55, 2.1]} />
            <meshToonMaterial color="#4A2F1B" />
          </mesh>
        </group>
        {/* نافذتا القاعدة الأرضية (مثل الطوابق): تُظهران إشغال جنديَي القاعدة */}
        {([baseOccupants[0] ?? null, baseOccupants[1] ?? null] as (Soldier | null)[]).map((occ, i) => (
          <group key={`bw${i}`} position={[(i - 0.5) * 4.9, 2.35, BASE_W / 2 + 0.01]}>
            <HorseshoeArch w={1.3} h={1.7} material={M.trim} dark={M.dark} />
            {occ && (
              <group position={[0, -0.35, 0.12]}>
                <SoldierBust rank={occ.rank} teamColor={team.color} badge bleeding={occ.hp < occ.maxHp} />
              </group>
            )}
          </group>
        ))}
        {/* أبراج الزاوية (مآذن) */}
        {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map((c, i) => (
          <MinaretTower key={i} position={[c[0] * (BASE_W / 2 - 0.4), 0, c[1] * (BASE_W / 2 - 0.4)]} material={M.base} domeMaterial={M.dome} />
        ))}
        <Crenellation width={BASE_W + 0.2} y={BASE_H} material={M.base} />
        {baseDamaged && (
          <group position={[0, 2, BASE_W / 2 + 0.02]}>
            <mesh position={[-1.6, 0.4, 0]} rotation={[0, 0, 0.4]} material={M.crack}>
              <planeGeometry args={[0.2, 2.2]} />
            </mesh>
            <mesh position={[1.4, -0.3, 0]} rotation={[0, 0, -0.55]} material={M.crack}>
              <planeGeometry args={[0.16, 1.6]} />
            </mesh>
          </group>
        )}
      </group>

      {/* الطوابق */}
      {team.castle.floors.map((f, i) => (
        <FloorModule key={f.id} floor={f} y={BASE_H + i * FLOOR_H} occupants={floorOccupants.get(f.id) ?? []} teamColor={team.color} materials={{ wall: M.floor, trim: M.trim, dark: M.dark, crack: M.crack }} />
      ))}

      {/* القبة المزججة بلون الفريق — قاعدتها تتغلغل 0.03 في السطح (لا z-fighting) */}
      <group position={[0, topY, 0]}>
        <mesh position={[0, 0.22, 0]} material={M.trim} castShadow>
          <cylinderGeometry args={[2.6, 2.9, 0.5, 12]} />
        </mesh>
        <mesh position={[0, 0.5, 0]} material={M.dome} castShadow>
          <sphereGeometry args={[2.3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 2.9, 0]} material={M.gold}>
          <coneGeometry args={[0.22, 0.8, 8]} />
        </mesh>
      </group>

      {/* منصة المنجنيق فوق السطح (تعلو مع الطوابق) — أمام القبة دائمًا:
          الإزاحة المحلية تُشتق من اتجاه مركز الخريطة (ساحة المعركة) لكل قلعة
          فلا تحجب القبة خط النظر من كاميرا FPS نحو الأفق */}
      <group
        position={[plat.x, topY + 0.3, plat.z]}
        rotation={[0, Math.atan2(-pos.x, -pos.z) - yaw, 0]}
        scale={0.9}
      >
        <CatapultModel aiming={isMyCatapult} />
      </group>

      {/* راية الفريق — الجهة المعاكسة للمنصة */}
      <group position={[bannerX, topY + 0.2, bannerZ]} rotation={[0, -yaw, 0]}>
        <Banner teamIndex={idx} height={2.6} />
      </group>
    </group>
  );
}

const Castle = memo(CastleInner);
export default Castle;
