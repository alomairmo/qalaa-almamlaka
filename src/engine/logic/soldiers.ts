/**
 * الجنود: التجنيد (سحب الرتبة)، الترقية، الشفاء — §4، §15 د-2.
 */
import type {
  GameEvent,
  GameState,
  HealAmount,
  Rank,
  Soldier,
  SoldierHealedEvent,
  SoldierPromotedEvent,
  SoldierRecruitedEvent,
  TeamId,
} from '@/contracts/types';
import { RANK_ORDER } from '@/contracts/defaults';
import { cloneState, getTeam, makeId, noChange, pushLog, stamp, type LogicResult } from './state';
import { regarrison, syncOutsidePile } from './economy';
import type { RNG } from '../rng';

/** سحب رتبة جندي جديد حسب احتمالات التجنيد من الإعدادات (25/50/25 افتراضيًا) */
export function drawRank(state: GameState, rng: RNG): Rank {
  const c = state.settings.combat.recruitChances;
  const roll = rng.next() * (c.novice + c.soldier + c.expert);
  if (roll < c.novice) return 'novice';
  if (roll < c.novice + c.soldier) return 'soldier';
  return 'expert';
}

/** إنشاء جندي برتبة محددة وصحتها الثابتة القصوى من الإعدادات */
export function createSoldier(state: GameState, rank: Rank, rng: RNG): Soldier {
  const hp = state.settings.combat.rankHp[rank];
  return { id: makeId('sol', rng), rank, hp, maxHp: hp, state: 'outside' };
}

/** شراء/تجنيد جندي (−5 ذهب افتراضيًا) — الذهب يُخصم من الداخل ثم الخارج */
export function recruitSoldier(state: GameState, teamId: TeamId, rng: RNG): LogicResult {
  const s = cloneState(state);
  const team = getTeam(s, teamId);
  const cost = s.settings.economy.soldierCost;
  const totalGold = team.goldInside + team.goldOutside;
  if (totalGold < cost) return noChange(state);
  // الخصم من الداخل أولًا ثم من الكومة الخارجية
  const fromInside = Math.min(team.goldInside, cost);
  team.goldInside -= fromInside;
  team.goldOutside -= cost - fromInside;
  if (team.goldOutside < 0) team.goldOutside = 0;

  const soldier = createSoldier(s, drawRank(s, rng), rng);
  team.soldiers.push(soldier);
  // التعبئة التلقائية: الأثمن يدخل القلعة أولًا
  regarrison(s, team);
  // مزامنة كومة الذهب الخارجية بعد الخصم
  syncOutsidePile(s, team, rng);

  const events: GameEvent[] = [stamp<SoldierRecruitedEvent>(rng, { type: 'soldier-recruited', teamId, soldier })];
  pushLog(s, `${team.name} جنّدت جنديًا جديدًا`, teamId);
  return { state: s, events };
}

/** الرتبة التالية في سلم الترقية (الخبير أعلى رتبة — لا ترقية بعده) */
export function nextRank(rank: Rank): Rank | null {
  const i = RANK_ORDER.indexOf(rank);
  return i < RANK_ORDER.length - 1 ? RANK_ORDER[i + 1] : null;
}

/**
 * ترقية جندي رتبة واحدة (ناجٍ منتصر) — §4.
 * عند الترقية تُرفع الصحة القصوى لسقف الرتبة الجديدة (الجروح تبقى بنسبتها:
 * نرفع hp بمقدار الفرق حتى لا يفقد الجندي جروحه).
 */
export function promoteSoldier(
  state: GameState,
  teamId: TeamId,
  soldier: Soldier,
  rng: RNG,
  events: GameEvent[],
): void {
  const to = nextRank(soldier.rank);
  if (!to) return;
  const from = soldier.rank;
  const newMax = state.settings.combat.rankHp[to];
  soldier.hp = Math.min(newMax, soldier.hp + Math.max(0, newMax - soldier.maxHp));
  soldier.maxHp = newMax;
  soldier.rank = to;
  soldier.pendingPromotion = false;
  events.push(stamp<SoldierPromotedEvent>(rng, { type: 'soldier-promoted', teamId, soldierId: soldier.id, fromRank: from, toRank: to }));
}

/** تطبيق مقدار شفاء على جندي */
export function healSoldier(soldier: Soldier, amount: HealAmount): number {
  const before = soldier.hp;
  soldier.hp = amount.kind === 'full' ? soldier.maxHp : Math.min(soldier.maxHp, soldier.hp + amount.points);
  return soldier.hp - before;
}

/**
 * شفاء فئة من جنود مجموعة (inside/outside/convoy) إن كانت مفعّلة —
 * يُستدعى في بداية جولة المجموعة، ويحترم توقيت «كل N جولات» عبر roundNumber.
 */
export function applyHealingForTeam(state: GameState, teamId: TeamId, rng: RNG): GameEvent[] {
  const s = state; // يُفترض أنها نسخة بالفعل (يستدعيها rounds.ts بعد cloneState)
  const healing = s.settings.healing;
  if (!healing.enabled) return [];
  const team = getTeam(s, teamId);
  const events: GameEvent[] = [];
  const categories = ['inside', 'outside', 'convoy'] as const;
  for (const cat of categories) {
    const cfg = healing[cat];
    if (!cfg.enabled) continue;
    const every = Math.max(1, cfg.timing.everyTurns);
    // تقريب موثَّق: دورات المجموعة ≈ رقم الجولة الكلية
    if (s.roundNumber % every !== 0) continue;
    for (const soldier of team.soldiers) {
      if (soldier.state !== cat) continue;
      const before = soldier.hp;
      const gained = healSoldier(soldier, cfg.amount);
      if (gained > 0) {
        events.push(
          stamp<SoldierHealedEvent>(rng, {
            type: 'soldier-healed',
            teamId,
            soldierId: soldier.id,
            hpBefore: before,
            hpAfter: soldier.hp,
          }),
        );
      }
    }
  }
  return events;
}
