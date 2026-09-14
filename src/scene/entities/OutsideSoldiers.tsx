/**
 * الجنود الخارجون: حلقة حول القلعة (معسكرون خارج الأسوار) مع وقوف متنفس
 * متدرج الطور، واحتفال عند أحداث النصر/الترقية (عبر جسر المشهد).
 */
import { memo } from 'react';
import type { GameState, Team } from '@/contracts/types';
import { outsideSoldierPosition, teamCastlePos, yawTowards } from '../layout';
import { isCelebrating, useSceneBridge } from '../bridge';
import { SoldierModel } from './Soldier';

function TeamRingInner({ team, state }: { team: Team; state: GameState }) {
  // اشتراك خفيف لتحديث وضع الاحتفال
  useSceneBridge((s) => s.celebrating);
  const outside = team.soldiers.filter((s) => s.state === 'outside');
  const castle = teamCastlePos(state, team.id);
  const celebrating = isCelebrating(team.id);

  return (
    <group>
      {outside.map((s, i) => {
        const p = outsideSoldierPosition(state, team.id, i, outside.length);
        return (
          <group key={s.id} position={[p.x, 0, p.z]} rotation={[0, yawTowards(p, castle), 0]}>
            <SoldierModel
              rank={s.rank}
              teamColor={team.color}
              anim={celebrating ? 'celebrate' : 'idle'}
              phase={i * 0.9}
              badge
              bleeding={s.hp < s.maxHp}
            />
          </group>
        );
      })}
    </group>
  );
}

const TeamRing = memo(TeamRingInner);

export default function OutsideSoldiers({ state }: { state: GameState }) {
  return (
    <group>
      {state.teams.map((t) => (
        <TeamRing key={t.id} team={t} state={state} />
      ))}
    </group>
  );
}
