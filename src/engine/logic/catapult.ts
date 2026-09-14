/**
 * المنجنيق: الإطلاق وتطبيق الأضرار — §8 (+ إعانة إعادة الإعمار §17.3).
 *
 * - كلفة الحجر تُخصم عند الإطلاق فقط (الإلغاء بلا خسارة).
 * - الأضرار كلها من الإعدادات: طابق [4-6] / ذهب [4-6] / حجارة 2 ثابت / جنود [4-6] على الصحة.
 * - ضرر جماعي (splash): إصابة هدفٍ جنودًا (خارجيين أو قافلة) تطبّق الضرر على
 *   كل جندي مكشوف ضمن splashRadius من نقطة السقوط (مصدر المواقع: geometry.ts).
 * - ارتداد فيزيائي: إصابة برج قلعة (طابق/قاعدة) تجعل القذيفة تقفز قفزة أفقية
 *   عشوائية قصيرة (bounceDistance) ثم تسقط أرضًا بضرر مخفّض (bounceDamageFactor)
 *   قد يصيب جنودًا/أكوام ذهب/حجارة قريبة — حدث catapult-bounce يُبث فقط إن أصابت شيئًا.
 * - القاعدة الأرضية تُصاب لكن لا تُهدم أبدًا (حد أدنى 1).
 * - تدمير طابق = سقوطه + خفض السعة + فيض فوري للزائد.
 * - ترتيب الأحداث: catapult-fired ← projectile-impact (يحمل hits كاملة) ←
 *   أحداث الأثر الجانبية (هدم/موت/ذهب) ← catapult-bounce ← أحداث أثر الارتداد.
 * - آخر قوة إطلاق تُحفظ لكل مجموعة في state.catapultPowerByTeam (0–100).
 */
import type {
  CatapultBounceEvent,
  CatapultFiredEvent,
  CatapultHit,
  CatapultTarget,
  FloorDestroyedEvent,
  GameEvent,
  GameState,
  GoldBurnedEvent,
  GoldDroppedEvent,
  ImpactResult,
  ProjectileImpactEvent,
  ResourcesGainedEvent,
  Soldier,
  SoldierDiedEvent,
  TeamId,
  Vec3,
} from '@/contracts/types';
import { BASE_MIN_HP, CATAPULT_STONE_COST } from '@/contracts/defaults';
import {
  cloneState,
  currentTeam,
  getTeam,
  isTeamProtected,
  noChange,
  pushLog,
  stamp,
  teamIndexOf,
  type LogicResult,
} from './state';
import { enforceCapacity, syncOutsidePile, dropPile } from './economy';
import { convoyGoldShare } from './combat';
import { castlePosition, horizontalDistance, outsideSoldierPosition, stonesPilePosition } from './geometry';
import type { RNG } from '../rng';

/** هل يستطيع الفريق الحالي استخدام المنجنيق أصلًا؟ (حجر واحد على الأقل) */
export function canUseCatapult(state: GameState, teamId: TeamId): boolean {
  const team = getTeam(state, teamId);
  return team.castle.catapultReady && team.stonesOutside >= CATAPULT_STONE_COST;
}

/** تطبيع قوة الإطلاق إلى 0–100 (الواجهة تمرر 0..1 عادة) */
export function normalizeCatapultPower(power: number): number {
  const p100 = power <= 1 ? power * 100 : power;
  return Math.min(100, Math.max(0, Math.round(p100)));
}

/**
 * إطلاق القذيفة على هدف. power: 0..1 (من الضغط المطوّل أو المقبض أو الإيماء) —
 * تُمرر للحدث كما هي (وكيل المشهد يحوّلها لمسار فيزيائي عبر computeTrajectory).
 */
export function fireCatapult(
  state: GameState,
  teamId: TeamId,
  target: CatapultTarget,
  power: number,
  rng: RNG,
): LogicResult {
  const s = cloneState(state);
  const team = getTeam(s, teamId);
  if (team.id !== currentTeam(s).id) return noChange(state);
  if (!canUseCatapult(s, teamId)) return noChange(state);

  // الحماية: لا قصف لفريق محمي (حماية أول جولة / إعانة إعادة الإعمار)
  const targetTeamId = targetTeamOf(s, target);
  if (targetTeamId && targetTeamId !== teamId && isTeamProtected(s, targetTeamId)) return noChange(state);

  // خصم كلفة الحجر عند الإطلاق فقط — §8
  team.stonesOutside -= CATAPULT_STONE_COST;
  // ذاكرة قوة المقبض/الإيماء لكل مجموعة (تُحفظ مع اللعبة)
  s.catapultPowerByTeam[teamId] = normalizeCatapultPower(power);

  const events: GameEvent[] = [stamp<CatapultFiredEvent>(rng, { type: 'catapult-fired', teamId, target, power })];
  const impactSide: GameEvent[] = [];
  const { damage, result, hits } = applyImpact(s, teamId, target, rng, impactSide);
  // الإصابة أولًا (تحمل قائمة hits كاملة) ثم أحداث الأثر الجانبية
  events.push(stamp<ProjectileImpactEvent>(rng, { type: 'projectile-impact', teamId, target, damage, result, hits }));
  events.push(...impactSide);
  // ارتداد فيزيائي بعد إصابة برج قلعة فعلًا (وليس إخفاقًا بسبب طابق معدوم)
  if ((target.kind === 'floor' || target.kind === 'base') && result.kind !== 'miss') {
    applyBounce(s, teamId, target.teamId, damage, rng, events);
  }
  return { state: s, events };
}

/** المجموعة المالكة للهدف (للفحص الأمني للحماية) */
function targetTeamOf(s: GameState, target: CatapultTarget): TeamId | null {
  switch (target.kind) {
    case 'floor':
    case 'base':
    case 'stones':
    case 'soldier':
      return target.teamId;
    case 'convoy': {
      const c = s.convoys.find((x) => x.id === target.convoyId);
      return c ? c.teamId : null;
    }
    case 'gold-pile': {
      const p = s.piles.find((x) => x.id === target.pileId);
      return p?.ownerTeamId ?? null;
    }
    case 'ground':
      return null;
  }
}

// ─────────────────────────────────────────────
// الجنود المكشوفون على الأرض (أهداف السبلاش/الارتداد)
// ─────────────────────────────────────────────

/** مرجع جندي مكشوف على الأرض (خارجي أو في قافلة) مع موقعه المحسوب */
interface GroundUnit {
  kind: 'outside' | 'convoy';
  teamId: TeamId;
  convoyId?: string;
  soldier: Soldier;
  position: Vec3;
}

/**
 * كل الجنود المكشوفين على الأرض مع مواقعهم:
 * - الخارجيون: outsideSoldierPosition (صف حول القلعة، slot = ترتيبه بين الخارجيين).
 * - جنود القوافل: موقع القافلة الحالي convoy.position.
 * ⚠️ المشهد يجب أن يطابق هذه المواضع عند الرسم حتى يصح ما يراه اللاعب.
 */
export function collectGroundUnits(s: GameState): GroundUnit[] {
  const units: GroundUnit[] = [];
  for (const team of s.teams) {
    const ti = Math.max(0, teamIndexOf(s, team.id));
    let slot = 0;
    for (const soldier of team.soldiers) {
      if (soldier.state !== 'outside') continue;
      units.push({
        kind: 'outside',
        teamId: team.id,
        soldier,
        position: outsideSoldierPosition(ti, s.teams.length, slot),
      });
      slot += 1;
    }
  }
  for (const convoy of s.convoys) {
    for (const soldier of convoy.soldiers) {
      units.push({
        kind: 'convoy',
        teamId: convoy.teamId,
        convoyId: convoy.id,
        soldier,
        position: { ...convoy.position },
      });
    }
  }
  return units;
}

/** موت جندي قافلة بالقصف: يسقط ذهبه كومة مكشوفة مكانه — §7 */
function killConvoySoldier(
  s: GameState,
  convoyId: string,
  soldier: Soldier,
  rng: RNG,
  events: GameEvent[],
): void {
  const convoy = s.convoys.find((c) => c.id === convoyId);
  if (!convoy) return;
  const idx = convoy.soldiers.findIndex((x) => x.id === soldier.id);
  const share = idx >= 0 ? convoyGoldShare(convoy, idx) : 0;
  convoy.goldCarried -= share;
  convoy.soldiers = convoy.soldiers.filter((x) => x.id !== soldier.id);
  const owner = getTeam(s, convoy.teamId);
  owner.soldiers = owner.soldiers.filter((x) => x.id !== soldier.id);
  if (share > 0) {
    const pile = dropPile(s, share, convoy.position, rng);
    events.push(
      stamp<GoldDroppedEvent>(rng, {
        type: 'gold-dropped',
        pileId: pile.id,
        amount: share,
        position: pile.position,
      }),
    );
  }
  events.push(
    stamp<SoldierDiedEvent>(rng, {
      type: 'soldier-died',
      teamId: convoy.teamId,
      soldierId: soldier.id,
      droppedGold: share > 0 ? share : undefined,
      dropPosition: { ...convoy.position },
    }),
  );
  pushLog(s, `قُتل جندي من قافلة ${owner.name} بالمنجنيق`, convoy.teamId);
}

/**
 * ضرر جماعي على كل جندي مكشوف ضمن نصف القطر من نقطة السقوط —
 * الضرر نفسه (سحبة واحدة) يُخصم من صحة كل جندي، ومن مات تُطبق عليه
 * قواعد السقوط المعتادة (الخارجي يختفي، وجندي القافلة يسقط ذهبه).
 */
function applySplashDamage(
  s: GameState,
  point: Vec3,
  damage: number,
  rng: RNG,
  events: GameEvent[],
  hits: CatapultHit[],
  radius = s.settings.catapult.splashRadius,
): void {
  for (const u of collectGroundUnits(s)) {
    if (horizontalDistance(u.position, point) > radius) continue;
    u.soldier.hp -= damage;
    const died = u.soldier.hp <= 0;
    if (u.kind === 'outside') {
      hits.push({ kind: 'soldier', teamId: u.teamId, soldierId: u.soldier.id, damage, died });
      if (died) {
        const team = getTeam(s, u.teamId);
        team.soldiers = team.soldiers.filter((x) => x.id !== u.soldier.id);
        events.push(
          stamp<SoldierDiedEvent>(rng, { type: 'soldier-died', teamId: u.teamId, soldierId: u.soldier.id }),
        );
        pushLog(s, `قُتل جندي خارجي من ${team.name} بالمنجنيق`, u.teamId);
      }
    } else {
      hits.push({ kind: 'convoy-soldier', convoyId: u.convoyId!, soldierId: u.soldier.id, damage, died });
      if (died) killConvoySoldier(s, u.convoyId!, u.soldier, rng, events);
    }
  }
  // قافلة بلا جنود تتبخر (ذهبها كله سقط)
  s.convoys = s.convoys.filter((c) => c.soldiers.length > 0);
}

/** تطبيق أثر الإصابة على الحالة المنسوخة — يرجع الضرر والنتيجة وقائمة الإصابات */
function applyImpact(
  s: GameState,
  _attackerTeamId: TeamId,
  target: CatapultTarget,
  rng: RNG,
  events: GameEvent[],
): { damage: number; result: ImpactResult; hits: CatapultHit[] } {
  const dmg = s.settings.combat.catapultDamage;
  const miss = { damage: 0, result: { kind: 'miss' } as ImpactResult, hits: [] as CatapultHit[] };

  switch (target.kind) {
    case 'floor': {
      const team = getTeam(s, target.teamId);
      const floor = team.castle.floors.find((f) => f.id === target.floorId);
      if (!floor) return miss;
      const damage = rng.int(dmg.floor[0], dmg.floor[1]);
      floor.hp -= damage;
      if (floor.hp <= 0) {
        // هدم الطابق: سقوطه + فيض فوري للزائد عن السعة الجديدة — §8
        team.castle.floors = team.castle.floors.filter((f) => f.id !== floor.id);
        const { spilledGold, spilledSoldierIds } = enforceCapacity(s, team, rng);
        events.push(
          stamp<FloorDestroyedEvent>(rng, {
            type: 'floor-destroyed',
            teamId: team.id,
            floorId: floor.id,
            spilledGold,
            spilledSoldierIds,
          }),
        );
        pushLog(s, `تهدم طابق من قلعة ${team.name}`, team.id);
        checkRebuildGrant(s, team.id, rng, events);
        return {
          damage,
          result: { kind: 'floor-damaged', floorId: floor.id, destroyed: true },
          hits: [{ kind: 'floor', teamId: team.id, floorId: floor.id, damage, destroyed: true }],
        };
      }
      return {
        damage,
        result: { kind: 'floor-damaged', floorId: floor.id, destroyed: false },
        hits: [{ kind: 'floor', teamId: team.id, floorId: floor.id, damage, destroyed: false }],
      };
    }

    case 'base': {
      const team = getTeam(s, target.teamId);
      const damage = rng.int(dmg.floor[0], dmg.floor[1]);
      // القاعدة لا تُهدم أبدًا — حد أدنى 1 — §17.1
      team.castle.baseHp = Math.max(BASE_MIN_HP, team.castle.baseHp - damage);
      return {
        damage,
        result: { kind: 'base-damaged', newHp: team.castle.baseHp },
        hits: [{ kind: 'base', teamId: team.id, damage, newHp: team.castle.baseHp }],
      };
    }

    case 'gold-pile': {
      const pile = s.piles.find((p) => p.id === target.pileId);
      if (!pile) return miss;
      const damage = rng.int(dmg.gold[0], dmg.gold[1]);
      const burned = Math.min(pile.amount, damage);
      pile.amount -= burned;
      // كومة خارجية: خصم من رصيد المالك الخارجي
      if (pile.kind === 'outside' && pile.ownerTeamId) {
        getTeam(s, pile.ownerTeamId).goldOutside = pile.amount;
      }
      if (pile.amount <= 0) s.piles = s.piles.filter((p) => p.id !== pile.id);
      events.push(stamp<GoldBurnedEvent>(rng, { type: 'gold-burned', pileId: pile.id, amount: burned }));
      pushLog(s, `أُتلف ${burned} ذهب بالقصف`);
      return {
        damage: burned,
        result: { kind: 'gold-burned', pileId: pile.id, amount: burned },
        hits: [{ kind: 'gold-pile', pileId: pile.id, amount: burned }],
      };
    }

    case 'stones': {
      const team = getTeam(s, target.teamId);
      const destroyed = Math.min(team.stonesOutside, dmg.stones);
      team.stonesOutside -= destroyed;
      return {
        damage: destroyed,
        result: { kind: 'stones-destroyed', teamId: team.id, count: destroyed },
        hits: [{ kind: 'stones', teamId: team.id, count: destroyed }],
      };
    }

    case 'soldier': {
      const team = getTeam(s, target.teamId);
      // القصف يصيب الجنود الخارجيين فقط (الداخليون في مأمن داخل القلعة) — §5
      const soldier = team.soldiers.find((x) => x.id === target.soldierId && x.state === 'outside');
      if (!soldier) return miss;
      const damage = rng.int(dmg.units[0], dmg.units[1]);
      // ضرر جماعي: كل جندي مكشوف ضمن نصف القطر من موقع الجندي المستهدف يُصاب
      const unit = collectGroundUnits(s).find((u) => u.soldier.id === target.soldierId);
      const point = unit?.position ?? castlePosition(Math.max(0, teamIndexOf(s, target.teamId)), s.teams.length);
      const hits: CatapultHit[] = [];
      applySplashDamage(s, point, damage, rng, events, hits);
      const died = !team.soldiers.some((x) => x.id === target.soldierId);
      return { damage, result: { kind: 'soldier-hit', soldierId: target.soldierId, died }, hits };
    }

    case 'convoy': {
      const convoy = s.convoys.find((c) => c.id === target.convoyId);
      if (!convoy) return miss;
      const targetSoldier = convoy.soldiers.find((x) => x.id === target.soldierId);
      if (!targetSoldier) return miss;
      const damage = rng.int(dmg.units[0], dmg.units[1]);
      // ضرر جماعي حول موقع القافلة: يصيب كل جنودها (وأي جندي مكشوف قريب)
      const hpBefore = targetSoldier.hp;
      const hits: CatapultHit[] = [];
      applySplashDamage(s, convoy.position, damage, rng, events, hits);
      return {
        damage,
        result: { kind: 'soldier-hit', soldierId: target.soldierId, died: hpBefore - damage <= 0 },
        hits,
      };
    }

    case 'ground':
      return miss;
  }
}

/**
 * الارتداد الفيزيائي: بعد إصابة برج قلعة تقفز القذيفة قفزة أفقية عشوائية
 * قصيرة (bounceDistance) وتسقط أرضًا. نقطة سقوط الارتداد قد تصيب هدفًا
 * أرضيًا ثانويًا (جنودًا مكشوفين/أكوام ذهب/حجارة) بضرر مخفّض
 * = round(الضرر الأساسي × bounceDamageFactor) بحد أدنى 1.
 * لا يُبثّ حدث catapult-bounce إن لم يصب الارتداد شيئًا.
 */
function applyBounce(
  s: GameState,
  attackerTeamId: TeamId,
  targetTeamId: TeamId,
  primaryDamage: number,
  rng: RNG,
  events: GameEvent[],
): void {
  const cs = s.settings.catapult;
  if (!cs.bounceEnabled || primaryDamage <= 0) return;
  const origin = castlePosition(Math.max(0, teamIndexOf(s, targetTeamId)), s.teams.length);
  const angle = rng.next() * Math.PI * 2;
  const [dMin, dMax] = cs.bounceDistance;
  const dist = dMin + rng.next() * Math.max(0, dMax - dMin);
  const landing: Vec3 = {
    x: origin.x + Math.cos(angle) * dist,
    y: 0,
    z: origin.z + Math.sin(angle) * dist,
  };
  const dmg = Math.max(1, Math.round(primaryDamage * cs.bounceDamageFactor));
  const radius = cs.splashRadius;
  const hits: CatapultHit[] = [];
  const side: GameEvent[] = [];

  // 1) جنود مكشوفون على الأرض (خارجيون + جنود قوافل) ضمن النطاق
  applySplashDamage(s, landing, dmg, rng, side, hits, radius);

  // 2) أكوام ذهب (خارجية/ساقطة) ضمن النطاق — تُتلف بمقدار الضرر
  for (const pile of s.piles.slice()) {
    if (horizontalDistance(pile.position, landing) > radius) continue;
    const burned = Math.min(pile.amount, dmg);
    if (burned <= 0) continue;
    pile.amount -= burned;
    if (pile.kind === 'outside' && pile.ownerTeamId) {
      getTeam(s, pile.ownerTeamId).goldOutside = pile.amount;
    }
    if (pile.amount <= 0) s.piles = s.piles.filter((p) => p.id !== pile.id);
    side.push(stamp<GoldBurnedEvent>(rng, { type: 'gold-burned', pileId: pile.id, amount: burned }));
    hits.push({ kind: 'gold-pile', pileId: pile.id, amount: burned });
  }

  // 3) حجارة خارجية ضمن النطاق — تدمير بمقدار الضرر
  for (const team of s.teams) {
    if (team.stonesOutside <= 0) continue;
    const pos = stonesPilePosition(Math.max(0, teamIndexOf(s, team.id)), s.teams.length);
    if (horizontalDistance(pos, landing) > radius) continue;
    const destroyed = Math.min(team.stonesOutside, dmg);
    team.stonesOutside -= destroyed;
    hits.push({ kind: 'stones', teamId: team.id, count: destroyed });
    pushLog(s, `دمّر ارتداد قذيفة ${destroyed} حجارة من ${team.name}`, team.id);
  }

  if (hits.length === 0) return; // إن لم يصب شيئًا فلا حدث إضافي
  events.push(
    stamp<CatapultBounceEvent>(rng, { type: 'catapult-bounce', teamId: attackerTeamId, origin, landing, hits }),
  );
  events.push(...side);
}

/**
 * إعانة إعادة الإعمار — §17.3: من فقد جميع طوابقه يحصل على
 * goldAmount ذهب + حماية protectionRounds جولة (إن كانت مفعّلة).
 * تُستدعى بعد أي تدمير طابق (مرة واحدة عند بلوغ الصفر).
 */
export function checkRebuildGrant(s: GameState, teamId: TeamId, rng: RNG, events: GameEvent[]): void {
  const grant = s.settings.general.rebuildGrant;
  if (!grant.enabled) return;
  const team = getTeam(s, teamId);
  if (team.castle.floors.length > 0) return;
  if ((s.protectionRoundsLeft[teamId] ?? 0) > 0) return; // حصل عليها بالفعل
  // تُودع الإعانة مع احترام السعة (الفيض يخرج للكومة)
  const cap = (1 + team.castle.floors.length) * s.settings.combat.goldCapacityPerLevel;
  const room = Math.max(0, cap - team.goldInside);
  const toInside = Math.min(room, grant.goldAmount);
  team.goldInside += toInside;
  team.goldOutside += grant.goldAmount - toInside;
  syncOutsidePile(s, team, rng);
  s.protectionRoundsLeft[teamId] = grant.protectionRounds;
  events.push(
    stamp<ResourcesGainedEvent>(rng, { type: 'resources-gained', teamId, gold: grant.goldAmount, stones: 0 }),
  );
  pushLog(s, `${team.name} حصلت على إعانة إعادة الإعمار (+${grant.goldAmount} ذهب وحماية)`, teamId);
}
