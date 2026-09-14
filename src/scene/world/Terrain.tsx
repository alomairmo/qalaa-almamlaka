/**
 * التضاريس: أرض خضراء 120×120 بملمس العشب، طرق رملية من كل قلعة إلى المركز
 * (sand-path)، عواميد ميل صغيرة تقسم كل طريق إلى (عدد الفرق − 1) أثلاثًا،
 * تراسات رملية تحت القلاع وساحة وسطى — design.md §6 / الوثيقة §10.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useGameStore } from '@/engine';
import { castlePosition } from '@/engine/logic/geometry';
import { toonMaterial } from '../palette';

const MAP_SIZE = 120;
/** مستوى الأرض الكلي: يمتد تحت الجبال المحيطة (حلقة نصف قطرها ~96) وما وراءها */
const GROUND_SIZE = 260;

function useGrassMaterial(): THREE.MeshToonMaterial {
  const tex = useTexture('./ground-grass-texture.png');
  return useMemo(() => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // كثافة تبليط ثابتة مهما اتسع المستوى (8 تكرارات لكل 120 وحدة)
    const rep = (GROUND_SIZE / MAP_SIZE) * 8;
    t.repeat.set(rep, rep);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return new THREE.MeshToonMaterial({ map: t, color: '#ffffff' });
  }, [tex]);
}

function useSandMaterial(rx: number, ry: number): THREE.MeshToonMaterial {
  const tex = useTexture('./sand-path-texture.png');
  return useMemo(() => {
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return new THREE.MeshToonMaterial({ map: t, color: '#ffffff' });
  }, [tex, rx, ry]);
}

/**
 * أرضية خضراء واسعة (260×260) تمتد تحت الجبال المحيطة وما وراءها حتى لا تقف
 * في فراغ، بانحدار لطيف (تلال متموجة خفيفة بين الميدان والجبال، مسطّحة قرب
 * المركز والقلاع ومستوية تمامًا تحت حلقة الجبال)، والضباب يتلاشى عند الأطراف
 * البعيدة. الملمس متكرر tiled فلا كلفة إضافية غير مستوى أكبر.
 */
function Ground() {
  const material = useGrassMaterial();
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 72, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      // تلال لطيفة في الأطراف فقط (الطرق والقلاع مستوية)، ثم تخبو قبل حلقة
      // الجبال (~80-96) حتى تقف الجبال على أرض مستوية فعلًا
      const edge = THREE.MathUtils.smoothstep(r, 30, 58) * (1 - THREE.MathUtils.smoothstep(r, 70, 102));
      const y = (Math.sin(x * 0.16) * Math.cos(z * 0.13) * 0.9 + Math.sin(x * 0.05 + z * 0.07) * 0.6) * edge;
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

/** طريق رملي واحد من قلعة إلى المركز مع عواميد الميل */
function Road({ from, segments }: { from: THREE.Vector3; segments: number }) {
  const material = useSandMaterial(1, 6);
  const { position, rotationY, length, milestones } = useMemo(() => {
    const dir = from.clone().setY(0).normalize();
    const start = from.clone().setY(0).addScaledVector(dir, -7); // تبدأ بعد التراس
    const end = dir.clone().multiplyScalar(6); // تنتهي عند الساحة الوسطى
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const length = start.distanceTo(end);
    const rotationY = Math.atan2(dir.x, dir.z);
    const milestones: THREE.Vector3[] = [];
    for (let i = 1; i < segments; i++) {
      const p = start.clone().lerp(end, i / segments);
      // إزاحة جانبية صغيرة عن حافة الطريق
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(2.6);
      milestones.push(p.clone().add(side));
    }
    return { position: mid, rotationY, length, milestones };
  }, [from, segments]);

  return (
    <group>
      <mesh position={[position.x, 0.06, position.z]} rotation={[-Math.PI / 2, 0, rotationY]} material={material} receiveShadow>
        <planeGeometry args={[4.2, length]} />
      </mesh>
      {milestones.map((m, i) => (
        <Milestone key={i} position={m} />
      ))}
    </group>
  );
}

/** عمود ميل حجري صغير يقسم الطريق أثلاثًا (مسار القوافل) */
function Milestone({ position }: { position: THREE.Vector3 }) {
  const body = useMemo(() => toonMaterial('#B8C0CE'), []);
  const cap = useMemo(() => toonMaterial('#8D99AE'), []);
  return (
    <group position={[position.x, 0, position.z]}>
      <mesh position={[0, 0.75, 0]} material={body} castShadow>
        <boxGeometry args={[0.55, 1.5, 0.55]} />
      </mesh>
      <mesh position={[0, 1.65, 0]} material={cap} castShadow>
        <coneGeometry args={[0.45, 0.5, 4]} />
      </mesh>
    </group>
  );
}

/** تراس رملي دائري تحت قلعة */
function Terrace({ at }: { at: THREE.Vector3 }) {
  const material = useSandMaterial(3, 3);
  return (
    <mesh position={[at.x, 0.05, at.z]} rotation={[-Math.PI / 2, 0, 0]} material={material} receiveShadow>
      <circleGeometry args={[8.5, 28]} />
    </mesh>
  );
}

/** ساحة التقاطع الوسطى */
function CenterPlaza() {
  const material = useSandMaterial(4, 4);
  return (
    <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} receiveShadow>
      <circleGeometry args={[7.5, 32]} />
    </mesh>
  );
}

export default function Terrain() {
  const teamCount = useGameStore((s) => s.state.teams.length);
  const castles = useMemo(() => {
    const list: THREE.Vector3[] = [];
    for (let i = 0; i < teamCount; i++) {
      const p = castlePosition(i, teamCount);
      list.push(new THREE.Vector3(p.x, 0, p.z));
    }
    return list;
  }, [teamCount]);
  // الطريق يُقسم إلى (عدد الفرق − 1) أثلاثًا — الوثيقة §7/§10
  const segments = Math.max(1, teamCount - 1);

  return (
    <group>
      <Ground />
      <CenterPlaza />
      {castles.map((c, i) => (
        <Terrace key={`t${i}`} at={c} />
      ))}
      {castles.map((c, i) => (
        <Road key={`r${i}`} from={c} segments={segments} />
      ))}
    </group>
  );
}
