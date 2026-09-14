/**
 * طبقة اللافتات فوق العناصر:
 * - في الوضع العام: تلميح صغير عند الحوم على قلعة (طوابق/ذهب/جنود).
 * - في الكاميرا الحرة: فوق كل قلعة شريحة بياناتها (صحة قاعدة/طوابق، جنود، أكوام).
 */
import { useState } from 'react';
import { Html } from '@react-three/drei';
import type { GameState, Team } from '@/contracts/types';
import { useGameStore } from '@/engine';
import { teamCastlePos, stonesPosition, outsideSoldierPosition, convoySoldierOffset, floorCenterY } from './layout';

const chipStyle: React.CSSProperties = {
  fontFamily: "'Cairo', sans-serif",
  fontWeight: 800,
  fontSize: 14,
  color: '#2B2118',
  background: 'rgba(246,238,217,.95)',
  border: '1.5px solid #B8860B',
  borderRadius: 10,
  padding: '3px 10px',
  whiteSpace: 'nowrap',
  direction: 'rtl',
};

function CastleChip({ team, state, detailed }: { team: Team; state: GameState; detailed: boolean }) {
  const pos = teamCastlePos(state, team.id);
  const top = 4 + team.castle.floors.length * 3;
  const inside = team.soldiers.filter((s) => s.state === 'inside').length;
  const outside = team.soldiers.filter((s) => s.state === 'outside').length;
  return (
    <Html center position={[pos.x, top + 6.5, pos.z]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div style={chipStyle}>
        {detailed
          ? `${team.name} · طوابق: ${team.castle.floors.length} · قاعدة: ${team.castle.baseHp}/${team.castle.baseMaxHp} · ذهب: ${team.goldInside}د+${team.goldOutside}خ · جنود: ${inside}د/${outside}خ · حجارة: ${team.stonesOutside}`
          : `${team.name} · طوابق: ${team.castle.floors.length} · ذهب داخل: ${team.goldInside} · جنود: ${team.soldiers.length}`}
      </div>
    </Html>
  );
}

export default function Labels({ state }: { state: GameState }) {
  const phase = useGameStore((s) => s.state.phase);
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);
  const free = phase === 'freeCamera';

  return (
    <group>
      {state.teams.map((team) => {
        const pos = teamCastlePos(state, team.id);
        return (
          <group key={team.id}>
            {/* منطقة حوم حول القلعة (تلميح الوضع العام فقط).
                مُعطّلة في وضع الجيش: هذا الاسطوانة غير المرئية (نصف قطرها 6.5)
                كانت تبتلع أحداث المؤشر عبر stopPropagation قبل وصولها إلى
                علامات الاستهداف في TargetMarkers فتتعطل نقرة/حومة القلاع
                (إصلاح: «القلاع لا تُنقر في وضع الجيش»). */}
            {phase !== 'catapult' && phase !== 'army' && (
              <mesh
                position={[pos.x, 3, pos.z]}
                visible={false}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHoveredTeam(team.id);
                }}
                onPointerOut={() => setHoveredTeam((h) => (h === team.id ? null : h))}
              >
                <cylinderGeometry args={[6.5, 6.5, 8 + team.castle.floors.length * 3, 10]} />
              </mesh>
            )}
            {free && <CastleChip team={team} state={state} detailed />}
            {!free && hoveredTeam === team.id && <CastleChip team={team} state={state} detailed={false} />}
            {free && team.stonesOutside > 0 && (
              <StonesChip state={state} teamId={team.id} count={team.stonesOutside} />
            )}
          </group>
        );
      })}
      {/* علامات الصحة أثناء وضع المنجنيق فقط */}
      {phase === 'catapult' && <CatapultHealthLabels state={state} />}
    </group>
  );
}

/** شريحة صحة زجاجية داكنة تواجه الكاميرا (Cairo 900 أبيض) — وضع المنجنيق */
function HpChip({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <Html center position={position} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div
        dir="rtl"
        style={{
          fontFamily: "'Cairo', sans-serif",
          fontWeight: 900,
          fontSize: 14,
          color: '#FFFFFF',
          background: 'rgba(11,62,67,.85)',
          border: '1.5px solid rgba(245,215,110,.6)',
          borderRadius: 999,
          padding: '1px 10px',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </Html>
  );
}

/**
 * علامات الصحة في وضع المنجنيق: فوق كل طابق (وقاعدة) من طوابق كل القلاع
 * صحته الحالية/القصوى، وفوق كل جندي خارجي وجندي قافلة صحته — تساعد اللاعب
 * على اختيار هدفه. تختفي تلقائيًا عند الخروج من الوضع. (أكوام الذهب تعرض
 * مقدارها دائمًا عبر ValueTag فتبقى ظاهرة هنا أيضًا.)
 */
function CatapultHealthLabels({ state }: { state: GameState }) {
  return (
    <group>
      {state.teams.map((team) => {
        const pos = teamCastlePos(state, team.id);
        const outside = team.soldiers.filter((s) => s.state === 'outside');
        return (
          <group key={team.id}>
            {/* القاعدة الأرضية */}
            <HpChip position={[pos.x, 2.1, pos.z]} text={`${team.castle.baseHp}/${team.castle.baseMaxHp}`} />
            {/* كل طابق */}
            {team.castle.floors.map((f, i) => (
              <HpChip key={f.id} position={[pos.x, floorCenterY(i) + 0.9, pos.z]} text={`${f.hp}/${f.maxHp}`} />
            ))}
            {/* الجنود الخارجيون */}
            {outside.map((sol, i) => {
              const p = outsideSoldierPosition(state, team.id, i, Math.max(1, outside.length));
              return <HpChip key={sol.id} position={[p.x, 2.3, p.z]} text={`${sol.hp}/${sol.maxHp}`} />;
            })}
          </group>
        );
      })}
      {/* جنود القوافل (فوق لافتة الذهب بقليل حتى لا تتداخل) */}
      {state.convoys.map((convoy) =>
        convoy.soldiers.map((sol, i) => {
          const off = convoySoldierOffset(i);
          return (
            <HpChip
              key={sol.id}
              position={[convoy.position.x + off.x, 2.95, convoy.position.z + off.z]}
              text={`${sol.hp}/${sol.maxHp}`}
            />
          );
        }),
      )}
    </group>
  );
}

function StonesChip({ state, teamId, count }: { state: GameState; teamId: string; count: number }) {
  const p = stonesPosition(state, teamId);
  return (
    <Html center position={[p.x, 2.4, p.z]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div style={chipStyle}>🪨 حجارة: {count}</div>
    </Html>
  );
}
