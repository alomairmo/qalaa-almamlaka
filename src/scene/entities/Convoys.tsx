/**
 * القوافل العائدة: جنود يمشون على الطريق عند موضع convoy.position
 * (المحدَّث من المحرك)، كل جندٍ يحمل كيس ذهب ظاهرًا بمقداره فوقه.
 *
 * مشي مستمر أثناء جولات الآخرين: بدل الوقوف جامدين بين قفزات convoy-moved،
 * تتقدم القافلة **مرئيًا** ثلث طريقها (convoyStep) على مدى جولة تصرف كاملة
 * — يُشتق التقدّم من مؤقت الجولة في المتجر (elapsed/total) ويتجمد فورًا
 * عند توقفه (إعدادات/بطاقة/حدث). عند بث convoy-moved يلتحم الموضع المرئي
 * بالموضع المنطقي الجديد وتبدأ دورة الثلث التالية.
 */
import { memo, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Convoy, GameState, Team } from '@/contracts/types';
import { useGameStore } from '@/engine';
import { convoyGoldShare } from '@/engine/logic/combat';
import { convoySoldierOffset, teamCastlePos, yawTowards } from '../layout';
import { convoyVisualPoint, convoyVisualProgress } from '../convoy-progress';
import { toonGradientMap } from '../palette';
import { selectArmyTarget, useSceneBridge } from '../bridge';
import { Marker } from '../effects/TargetMarkers';
import { SoldierModel } from './Soldier';

/** كيس ذهب على ظهر الجندي + لافتة مقداره */
function GoldSack({ amount }: { amount: number }) {
  const mat = useMemo(() => new THREE.MeshToonMaterial({ color: '#8A6238', gradientMap: toonGradientMap() }), []);
  return (
    <group>
      <mesh position={[0, 1.05, -0.35]} material={mat}>
        <sphereGeometry args={[0.22, 8, 7]} />
      </mesh>
      <mesh position={[0, 1.24, -0.35]} material={mat}>
        <cylinderGeometry args={[0.06, 0.1, 0.12, 6]} />
      </mesh>
      <Html center position={[0, 2.2, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div
          dir="rtl"
          style={{
            fontFamily: "'Cairo', sans-serif",
            fontWeight: 900,
            fontSize: 16,
            color: '#FFF3C4',
            background: 'rgba(46,27,14,.85)',
            border: '1.5px solid rgba(232,185,59,.7)',
            borderRadius: 999,
            padding: '2px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          🪙 {amount}
        </div>
      </Html>
    </group>
  );
}

function ConvoyInner({ convoy, state }: { convoy: Convoy; state: GameState }) {
  const team: Team | undefined = state.teams.find((t) => t.id === convoy.teamId);
  const color = team?.color ?? 'emerald';
  const group = useRef<THREE.Group>(null!);
  // نقر القوافل في وضع الجيش: منطقة التقاط غير مرئية **داخل المجموعة
  // المتحركة** فتلحق الجنود أينما مشوا مرئيًا (الموضع المنطقي يتخلف عن
  // المرئي حتى ثلث الطريق — علامة ثابتة عنده كانت تطفو فوق طريق فارغ).
  const myTurn = state.teams[state.turnIndex]?.id === convoy.teamId;
  const attackable = state.phase === 'army' && !myTurn;
  const [hovered, setHovered] = useState(false);
  const armyTarget = useSceneBridge((s) => s.armyTarget);
  const selected = armyTarget?.kind === 'convoy' && armyTarget.convoyId === convoy.id;
  // مؤقت الجولة (يُشترك لإعادة الرسم عند بدء/توقف المشي)
  const timer = useGameStore((s) => s.timer);
  const walking = timer !== null && timer.kind === 'action' && timer.remaining > 0 && timer.remaining < timer.total;
  // أعلى تقدّم مرئي مطلق بلغته هذه القافلة (رتيب — لا يتراجع أبدًا مهما
  // كان ترتيب تحديث الحالة/المؤقت عند حدود الجولة). يبدأ من التقدّم
  // المنطقي الحالي حتى تظهر القوافل المحمَّلة من حفظ في مكانها الصحيح.
  const visualProgress = useRef(convoy.progress);

  // مشي سلس: القافلة تلحق موضعها المخزّن (يتقدم ثلثًا مع كل جولة) مضافًا إليه
  // تقدّم مرئي مستمر داخل الثلث الحالي بحسب مؤقت الجولة — §4.
  // الإصلاح: التقدّم المرئي رتيب. سابقًا كان يُشتق كل إطار من
  // (progress + step×frac) مباشرة، فإذا تصفّر المؤقت عند نهاية الجولة
  // قبل وصول بثّ convoy-moved سقط المجموع ثلثًا كاملًا للخلف — قفزة
  // إلى بداية القسم. الآن يبقى الجنود عند نهاية القسم حتى يلتحم
  // المنطقي بالمرئي، ثم يواصلون منها في الجولة التالية.
  useFrame((_, dt) => {
    if (!group.current) return;
    const g = group.current;
    const home = teamCastlePos(state, convoy.teamId);
    const step = 1 / Math.max(1, state.teams.length - 1); // ثلث الطريق لكل جولة (٤ مجموعات)
    // نسبة الجولة المنقضية (تتجمد تلقائيًا عند توقف المؤقت: remaining ثابتة)
    const frac = walking ? (timer.total - timer.remaining) / timer.total : 0;
    const v = convoyVisualProgress(visualProgress.current, convoy.progress, step, frac);
    visualProgress.current = v;
    const tp = convoyVisualPoint(convoy.position, home, convoy.progress, v);
    const k = Math.min(1, dt * 2.2);
    g.position.x += (tp.x - g.position.x) * k;
    g.position.z += (tp.z - g.position.z) * k;
    g.rotation.y = yawTowards({ x: g.position.x, y: 0, z: g.position.z }, home);
  });

  return (
    <group ref={group} position={[convoy.position.x, 0, convoy.position.z]}>
      {/* منطقة نقر/حوم تتحرك مع القافلة (وضع الجيش، قوافل الغير فقط) +
          مؤشر أحمر عند الحوم/الاختيار كمؤشر القلاع في TargetMarkers */}
      {attackable && (
        <group>
          {/* الصفوف تتأخر على -z المحلي (convoySoldierOffset) — الصندوق
              يغطي كل الصفوف بهامش */}
          <mesh
            visible={false}
            position={[0, 1.3, -0.6 * Math.floor(Math.max(0, convoy.soldiers.length - 1) / 2)]}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
              setHovered(true);
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
              setHovered(false);
            }}
            onClick={(e) => {
              e.stopPropagation();
              // الواجهة تفتح نافذة الإرسال عبر الجسر (لا نرسل من هنا)
              selectArmyTarget({ kind: 'convoy', convoyId: convoy.id });
            }}
          >
            <boxGeometry args={[3.8, 3.6, 2.4 + 1.2 * Math.floor(Math.max(0, convoy.soldiers.length - 1) / 2)]} />
          </mesh>
          {(hovered || selected) && <Marker position={[0, 1, 0]} label="قافلة عائدة" big={false} />}
        </group>
      )}
      {convoy.soldiers.map((s, i) => {
        const off = convoySoldierOffset(i);
        const share = convoyGoldShare(convoy, i);
        return (
          <group key={s.id} position={[off.x, 0, off.z]}>
            <SoldierModel
              rank={s.rank}
              teamColor={color}
              anim={walking ? 'carry' : 'idle'}
              phase={i * 1.3}
              badge
              bleeding={s.hp < s.maxHp}
            />
            <GoldSack amount={share} />
          </group>
        );
      })}
    </group>
  );
}

const ConvoyGroup = memo(ConvoyInner);

export default function Convoys({ state }: { state: GameState }) {
  return (
    <group>
      {state.convoys.map((c) => (
        <ConvoyGroup key={c.id} convoy={c} state={state} />
      ))}
    </group>
  );
}
