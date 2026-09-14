/**
 * القوافل العائدة: التقدّم والوصول — §7.
 *
 * - ذهاب فوري (النتيجة لحظة المعركة)، عودة مؤجلة سيرًا على الطريق.
 * - الطريق يُقسم إلى (عدد المجموعات − 1) أثلاثًا: مع بداية جولة كل
 *   مجموعة أخرى تتقدم القافلة ثلثًا، ومع بداية جولة صاحبها تصل.
 * - الذهب يُضاف للخزنة عند الوصول فقط، ثم تُطبق الترقيات المستحقة
 *   (الأنيميشن: زيادة الذهب أولًا ثم الترقيات — ترتيب الأحداث هنا يعكس ذلك).
 */
import type { ConvoyArrivedEvent, ConvoyMovedEvent, GameEvent, GameState, TeamId } from '@/contracts/types';
import { getTeam, pushLog, stamp } from './state';
import { depositGold, regarrison, teamCastlePosition } from './economy';
import { healSoldier, promoteSoldier } from './soldiers';
import type { RNG } from '../rng';

/** خطوة التقدم لكل جولة = 1 ÷ (عدد المجموعات − 1) — §7 */
export function convoyStep(state: GameState): number {
  return 1 / Math.max(1, state.teams.length - 1);
}

/** موقع القافلة على الطريق بين قلعة الهدف وقلعة صاحبها */
function convoyPosition(state: GameState, convoy: { teamId: TeamId; fromTeamId: TeamId; progress: number }) {
  const from = teamCastlePosition(state, convoy.fromTeamId);
  const to = teamCastlePosition(state, convoy.teamId);
  const t = Math.min(1, Math.max(0, convoy.progress));
  return { x: from.x + (to.x - from.x) * t, y: 0, z: from.z + (to.z - from.z) * t };
}

/**
 * معالجة القوافل مع بداية جولة المجموعة teamId:
 * - قوافل المجموعة نفسها: تصل (ذهب + جنود عائدون + ترقيات + شفاء الوصول).
 * - قوافل بقية المجموعات: تتقدم ثلث الطريق.
 * يُستدعى من startTurn على نسخة الحالة (s معدَّلة موضعيًا).
 */
export function processConvoysAtTurnStart(s: GameState, teamId: TeamId, rng: RNG): GameEvent[] {
  const events: GameEvent[] = [];
  const step = convoyStep(s);
  const arriving = s.convoys.filter((c) => c.teamId === teamId);
  const moving = s.convoys.filter((c) => c.teamId !== teamId);

  // تقدّم قوافل الآخرين ثلث الطريق
  for (const c of moving) {
    c.progress = Math.min(1, c.progress + step);
    c.position = convoyPosition(s, c);
    events.push(
      stamp<ConvoyMovedEvent>(rng, { type: 'convoy-moved', convoyId: c.id, progress: c.progress, position: c.position }),
    );
  }

  // وصول قوافل صاحب الجولة
  for (const c of arriving) {
    const team = getTeam(s, teamId);
    c.progress = 1;
    c.position = convoyPosition(s, c);
    const gold = c.goldCarried;
    // 1) أنيميشن دخول القافلة + زيادة الذهب أولًا
    depositGold(s, team, gold, rng);
    events.push(
      stamp<ConvoyArrivedEvent>(rng, { type: 'convoy-arrived', convoyId: c.id, teamId, goldDelivered: gold }),
    );
    pushLog(s, `وصلت قافلة ${team.name} بغنيمة ${gold} ذهب`, teamId);
    // الجنود يعودون لصفوف المجموعة ثم تُعاد التعبئة (الأثمن أولًا)
    for (const soldier of c.soldiers) {
      soldier.state = 'outside'; // مؤقتًا — regarrison يقرر الداخل/الخارج
      delete soldier.convoyId;
    }
    regarrison(s, team);
    // 2) شفاء فوري عند الوصول إن كان مفعّلًا — §15 د-2
    const arrivalHeal = s.settings.healing.healOnArrival;
    if (s.settings.healing.enabled && arrivalHeal.enabled) {
      for (const soldier of c.soldiers) {
        const before = soldier.hp;
        const gained = healSoldier(soldier, arrivalHeal.amount);
        if (gained > 0) {
          events.push(
            stamp(rng, {
              type: 'soldier-healed' as const,
              teamId,
              soldierId: soldier.id,
              hpBefore: before,
              hpAfter: soldier.hp,
            }),
          );
        }
      }
    }
    // 3) ثم أنيميشن الترقية لكل جندٍ مستحق — §4
    for (const soldier of c.soldiers) {
      if (soldier.pendingPromotion) promoteSoldier(s, teamId, soldier, rng, events);
    }
    // إزالة القافلة من الطريق
    s.convoys = s.convoys.filter((x) => x.id !== c.id);
  }

  return events;
}
