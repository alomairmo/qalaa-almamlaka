/**
 * المعارك والغزو والقوافل القتالية — §5، §6، §7.
 *
 * قواعد جوهرية:
 * - المعركة فورية: مجموع القوة المسحوبة للمهاجمين ضد مجموع المدافعين
 *   داخل القلعة (المرسَلون غائبون). التعادل = فشل الغزو.
 * - الفائز يخسر الأضعف فالأضعف بما يعادل مجموع قوة الخاسر (ضرر متدفق:
 *   يُقتل جندي إن بلغ الضرر المتبقي قوته المسحوبة، والفائض ينتقل لمن يليه).
 * - الغنيمة: كل ناجٍ مهاجم يحمل ذهبًا بمقدار قوته المسحوبة.
 * - قلعة بلا جنود داخلها = سرقة بلا قتال. الذهب الخارجي/الساقط يُلتقط بلا قتال.
 * - الناجون المنتصرون يعودون في قافلة مؤجلة، ويترقون عند الوصول.
 *
 * اتفاقية توزيع ذهب القافلة (ثغرة في العقد: لا حقل لذهب كل جندي):
 * تُوزع الحصص عند إنشاء القافلة بالتساوي مع باقٍ يذهب للأول فالأول،
 * وتُشتق الحصة من (goldCarried, ترتيب الجنود) حتى تبقى قابلة للحفظ.
 */
import type {
  ArmyComposition,
  ArmyTarget,
  BattleLossEntry,
  BattleResolvedEvent,
  Convoy,
  ConvoyDepartedEvent,
  GameEvent,
  GameState,
  GoldDroppedEvent,
  Soldier,
  SoldierDiedEvent,
  Team,
  TeamId,
} from '@/contracts/types';
import {
  cloneState,
  currentTeam,
  getTeam,
  isTeamProtected,
  makeId,
  noChange,
  pushLog,
  stamp,
  teamIndexOf,
  type LogicResult,
} from './state';
import { regarrison, syncOutsidePile } from './economy';
import { castlePosition } from './geometry';
import { promoteSoldier } from './soldiers';
import type { RNG } from '../rng';

// ─────────────────────────────────────────────
// سحب القوة والضرر المتدفق
// ─────────────────────────────────────────────

export interface RolledSoldier {
  soldier: Soldier;
  power: number;
}

/** سحب قوة القتال عشوائيًا داخل نطاق الرتبة — عند كل معركة — §4 */
export function rollPower(state: GameState, soldier: Soldier, rng: RNG): number {
  const [min, max] = state.settings.combat.rankPowerRanges[soldier.rank];
  return rng.int(min, max);
}

export function rollPowers(state: GameState, soldiers: Soldier[], rng: RNG): RolledSoldier[] {
  return soldiers.map((soldier) => ({ soldier, power: rollPower(state, soldier, rng) }));
}

/**
 * خسائر الفائز بالضرر المتدفق: يُقتل الأضعف (بقوته المسحوبة) فالأضعف
 * بما يعادل مجموع قوة الخاسر؛ الضرر الزائد عن قتل جندي ينتقل لمن يليه،
 * ومن بقي ضرر أقل من قوته ينجو كاملًا — §6.5.
 */
export function flowingLosses(winners: RolledSoldier[], loserPowerSum: number): RolledSoldier[] {
  const weakestFirst = winners.slice().sort((a, b) => a.power - b.power);
  const dead: RolledSoldier[] = [];
  let pool = loserPowerSum;
  for (const w of weakestFirst) {
    if (pool >= w.power && pool > 0) {
      pool -= w.power;
      dead.push(w);
    } else {
      break; // الضرر المتبقي لا يكفي لقتل التالي — ينجو الباقون
    }
  }
  return dead;
}

// ─────────────────────────────────────────────
// نسب الفوز/الخسارة — مشتقة من حدث المعركة نفسه
// ─────────────────────────────────────────────

/**
 * معرّف الفريق الفائز بالمعركة — مُشتق حتميًا من الحدث نفسه.
 * قاعدة الإفناء (§6.4/§7): الفائز لا يُفنى أبدًا (الضرر المتدفق يستهلك من
 * مجموع قوة الخاسر فقط)، لذا attackerWon=true ⇒ إفناء المدافعين،
 * وfalse ⇒ إفناء المهاجمين. لا تعتمد على state.turnIndex إطلاقًا: بطاقة
 * النتائج مؤجلة حتى نهاية عنقود المعركة وقد يتقدّم الدور قبل ظهورها.
 */
export function battleWinnerTeamId(
  ev: Pick<BattleResolvedEvent, 'attackerWon' | 'attackerTeamId' | 'defenderTeamId'>,
): TeamId {
  return ev.attackerWon ? ev.attackerTeamId : ev.defenderTeamId;
}

/** هل فازت مجموعةٌ ما بهذه المعركة؟ صحيحة حتى لو تقدّم الدور قبل عرض النتيجة */
export function didTeamWinBattle(
  ev: Pick<BattleResolvedEvent, 'attackerWon' | 'attackerTeamId' | 'defenderTeamId'>,
  teamId: TeamId,
): boolean {
  return battleWinnerTeamId(ev) === teamId;
}

/**
 * جهة جندي قتيل في معركة: 'attacker' إن كان من جنود المهاجم، 'defender' إن
 * كان من جنود المدافع/القافلة، وnull إن لم يكن طرفًا (قصف منجنيق مثلًا).
 */
export function battleDeathSide(
  battle: Pick<BattleResolvedEvent, 'attackerTeamId' | 'defenderTeamId'>,
  victimTeamId: TeamId,
): 'attacker' | 'defender' | null {
  if (victimTeamId === battle.attackerTeamId) return 'attacker';
  if (victimTeamId === battle.defenderTeamId) return 'defender';
  return null;
}

// ─────────────────────────────────────────────
// اختيار المهاجمين من التشكيلة
// ─────────────────────────────────────────────

/** جنود المجموعة المتاحون للإرسال (داخل/خارج القلعة — ليسوا في قوافل) */
export function availableSoldiers(team: Team): Soldier[] {
  return team.soldiers.filter((s) => s.state === 'inside' || s.state === 'outside');
}

/** اختيار جنود فعليين مطابقين لتشكيلة الإرسال؛ null إن كانت غير ممكنة */
export function pickAttackers(team: Team, composition: ArmyComposition): Soldier[] | null {
  const chosen: Soldier[] = [];
  for (const rank of ['novice', 'soldier', 'expert'] as const) {
    const want = Math.max(0, Math.floor(composition[rank]));
    const pool = availableSoldiers(team).filter((s) => s.rank === rank);
    if (want > pool.length) return null;
    chosen.push(...pool.slice(0, want));
  }
  return chosen.length > 0 ? chosen : null;
}

// ─────────────────────────────────────────────
// حصص ذهب القافلة (الاتفاقية الحتمية)
// ─────────────────────────────────────────────

/** حصة الجندي صاحب الفهرس i من ذهب القافلة — حتمية من الحالة */
export function convoyGoldShare(convoy: Convoy, soldierIndex: number): number {
  const n = convoy.soldiers.length;
  if (n <= 0) return 0;
  const base = Math.floor(convoy.goldCarried / n);
  const remainder = convoy.goldCarried % n;
  return base + (soldierIndex < remainder ? 1 : 0);
}

// ─────────────────────────────────────────────
// إنشاء قافلة العودة
// ─────────────────────────────────────────────

function createConvoy(
  state: GameState,
  ownerTeamId: TeamId,
  fromTeamId: TeamId,
  soldiers: Soldier[],
  gold: number,
  rng: RNG,
  events: GameEvent[],
): Convoy {
  const convoy: Convoy = {
    id: makeId('cnv', rng),
    teamId: ownerTeamId,
    fromTeamId,
    soldiers,
    goldCarried: gold,
    progress: 0,
    // تبدأ من قلعة الهدف (الجهة المسروقة/الملتقطة من عندها)
    position: castlePosition(Math.max(0, teamIndexOf(state, fromTeamId)), state.teams.length),
  };
  for (const s of soldiers) {
    s.state = 'convoy';
    s.convoyId = convoy.id;
  }
  state.convoys.push(convoy);
  events.push(stamp<ConvoyDepartedEvent>(rng, { type: 'convoy-departed', convoy }));
  return convoy;
}

/** تسجيل موت جندي. إن كان يحمل ذهبًا يمرّر dropGold/dropPosition لتوثيقه في الحدث */
function killSoldier(
  state: GameState,
  ownerTeamId: TeamId,
  soldier: Soldier,
  rng: RNG,
  events: GameEvent[],
  dropGold = 0,
  dropPosition?: { x: number; y: number; z: number },
): void {
  const team = getTeam(state, ownerTeamId);
  team.soldiers = team.soldiers.filter((x) => x.id !== soldier.id);
  events.push(
    stamp<SoldierDiedEvent>(rng, {
      type: 'soldier-died',
      teamId: ownerTeamId,
      soldierId: soldier.id,
      droppedGold: dropGold > 0 ? dropGold : undefined,
      dropPosition,
    }),
  );
}

/** إنشاء كومة ذهب ساقطة على الطريق + حدثها — §7 */
function dropGoldPile(
  s: GameState,
  amount: number,
  position: { x: number; y: number; z: number },
  rng: RNG,
  events: GameEvent[],
): void {
  const pile = { id: makeId('pile', rng), amount, position: { ...position }, kind: 'dropped' as const };
  s.piles.push(pile);
  events.push(stamp<GoldDroppedEvent>(rng, { type: 'gold-dropped', pileId: pile.id, amount, position: pile.position }));
}

// ─────────────────────────────────────────────
// غزو قلعة — §6
// ─────────────────────────────────────────────

function raidCastle(
  s: GameState,
  attackerTeam: Team,
  defenderTeam: Team,
  attackers: Soldier[],
  rng: RNG,
  events: GameEvent[],
): void {
  const defenders = defenderTeam.soldiers.filter((x) => x.state === 'inside');
  const attRolled = rollPowers(s, attackers, rng);

  // قلعة بلا جنود داخلها = سرقة بلا قتال — §6.7
  if (defenders.length === 0) {
    const loot = lootGold(attRolled, defenderTeam);
    const owner = attackerTeam;
    for (const r of attRolled) {
      r.soldier.pendingPromotion = false; // لا معركة = لا ترقية
    }
    createConvoy(s, owner.id, defenderTeam.id, attackers, loot, rng, events);
    syncOutsidePile(s, defenderTeam, rng);
    pushLog(s, `${owner.name} سرقت خزنة ${defenderTeam.name} بلا قتال (${loot} ذهب)`, owner.id);
    return;
  }

  const defRolled = rollPowers(s, defenders, rng);
  const attackPower = attRolled.reduce((a, r) => a + r.power, 0);
  const defensePower = defRolled.reduce((a, r) => a + r.power, 0);
  // المهاجم يفوز فقط إن كان أعلى بوضوح — التعادل فشل غزو — §6.4
  const attackerWon = attackPower > defensePower;

  const winnerRolled = attackerWon ? attRolled : defRolled;
  const loserPowerSum = attackerWon ? defensePower : attackPower;
  const winnerDead = flowingLosses(winnerRolled, loserPowerSum);
  const winnerDeadIds = new Set(winnerDead.map((r) => r.soldier.id));
  const winnerSurvivors = winnerRolled.filter((r) => !winnerDeadIds.has(r.soldier.id));

  // أحداث المعركة تُجمَّع في سلتين ثم تُرتَّب: battle-resolved أولًا (يحمل
  // كل بيانات بطاقة النتائج)، ثم سقوط الجنود، ثم القوافل/الترقيات —
  // حتى يسبق أنيميشن المسير/القتال إشعارات الموت.
  const deathEvents: GameEvent[] = [];
  const followEvents: GameEvent[] = [];
  const attackerLosses: string[] = [];
  const defenderLosses: string[] = [];
  const attackerLossDetails: BattleLossEntry[] = [];
  const defenderLossDetails: BattleLossEntry[] = [];
  let lootGoldAmount = 0;
  let convoyId: string | undefined;

  // خسائر الفائز (الأضعف أولًا)
  for (const r of winnerDead) {
    killSoldier(s, attackerWon ? attackerTeam.id : defenderTeam.id, r.soldier, rng, deathEvents);
  }

  if (attackerWon) {
    // يموت كل المدافعين — §6.4
    for (const d of defenders) {
      killSoldier(s, defenderTeam.id, d, rng, deathEvents);
      defenderLosses.push(d.id);
      defenderLossDetails.push({ soldierId: d.id, rank: d.rank });
    }
    for (const r of winnerDead) {
      attackerLosses.push(r.soldier.id);
      attackerLossDetails.push({ soldierId: r.soldier.id, rank: r.soldier.rank });
    }
    // الغنيمة: كل ناجٍ يحمل بمقدار قوته — §6.6
    const survivors = winnerSurvivors.map((r) => r);
    const loot = lootGold(survivors, defenderTeam);
    const survivorSoldiers = survivors.map((r) => r.soldier);
    for (const r of survivors) r.soldier.pendingPromotion = true; // ناجون منتصرون — ترقية عند الوصول
    if (survivorSoldiers.length > 0) {
      const convoy = createConvoy(s, attackerTeam.id, defenderTeam.id, survivorSoldiers, loot, rng, followEvents);
      convoyId = convoy.id;
      lootGoldAmount = loot;
    } else if (loot > 0) {
      // حافة نادرة: فاز المهاجم ولم ينجُ أحد — الذهب المسحوب يبقى في خزنة العدو
      defenderTeam.goldInside += loot;
    }
    pushLog(s, `${attackerTeam.name} غزت قلعة ${defenderTeam.name} وغنمت ${loot} ذهب`, attackerTeam.id);
  } else {
    // فشل الغزو: يموت كل المهاجمين — §6.4
    for (const r of attRolled) {
      killSoldier(s, attackerTeam.id, r.soldier, rng, deathEvents);
      attackerLosses.push(r.soldier.id);
      attackerLossDetails.push({ soldierId: r.soldier.id, rank: r.soldier.rank });
    }
    for (const r of winnerDead) {
      defenderLosses.push(r.soldier.id);
      defenderLossDetails.push({ soldierId: r.soldier.id, rank: r.soldier.rank });
    }
    // المدافعون الناجون المنتصرون يترقون فورًا (هم في قلعتهم — لا قافلة)
    for (const r of winnerSurvivors) {
      promoteSoldier(s, defenderTeam.id, r.soldier, rng, followEvents);
    }
    pushLog(s, `${defenderTeam.name} صدّت غزو ${attackerTeam.name}`, defenderTeam.id);
  }

  regarrison(s, defenderTeam);
  regarrison(s, attackerTeam);
  syncOutsidePile(s, defenderTeam, rng);

  // الترتيب المطلوب: نتيجة المعركة ← سقوط الجنود ← القافلة/الترقيات
  events.push(
    stamp<BattleResolvedEvent>(rng, {
      type: 'battle-resolved',
      battleKind: 'castle',
      attackerTeamId: attackerTeam.id,
      defenderTeamId: defenderTeam.id,
      attackPower,
      defensePower,
      attackerWon,
      attackerLosses,
      defenderLosses,
      attackerLossDetails,
      defenderLossDetails,
      lootGold: lootGoldAmount,
      convoyId,
    }),
    ...deathEvents,
    ...followEvents,
  );
}

/** كل ناجٍ يحمل ذهبًا بمقدار قوته من خزنة العدو الداخلية — §6.6 */
function lootGold(survivors: RolledSoldier[], defenderTeam: Team): number {
  let loot = 0;
  for (const r of survivors) {
    const take = Math.min(r.power, defenderTeam.goldInside);
    defenderTeam.goldInside -= take;
    loot += take;
    if (defenderTeam.goldInside <= 0) break;
  }
  return loot;
}

// ─────────────────────────────────────────────
// اعتراض قافلة — §7
// ─────────────────────────────────────────────

function interceptConvoy(
  s: GameState,
  attackerTeam: Team,
  convoy: Convoy,
  attackers: Soldier[],
  rng: RNG,
  events: GameEvent[],
): void {
  const attRolled = rollPowers(s, attackers, rng);
  const defRolled = rollPowers(s, convoy.soldiers, rng);
  const attackPower = attRolled.reduce((a, r) => a + r.power, 0);
  const defensePower = defRolled.reduce((a, r) => a + r.power, 0);
  const attackerWon = attackPower > defensePower;
  const convoyOwner = getTeam(s, convoy.teamId);

  const winnerRolled = attackerWon ? attRolled : defRolled;
  const loserPowerSum = attackerWon ? defensePower : attackPower;
  const winnerDead = flowingLosses(winnerRolled, loserPowerSum);
  const winnerDeadIds = new Set(winnerDead.map((r) => r.soldier.id));
  const winnerSurvivors = winnerRolled.filter((r) => !winnerDeadIds.has(r.soldier.id));

  // نفس اتفاقية الترتيب: battle-resolved أولًا ثم سقوط الجنود ثم القوافل
  const deathEvents: GameEvent[] = [];
  const followEvents: GameEvent[] = [];
  const attackerLosses: string[] = [];
  const defenderLosses: string[] = [];
  const attackerLossDetails: BattleLossEntry[] = [];
  const defenderLossDetails: BattleLossEntry[] = [];
  let lootGoldAmount = 0;
  let newConvoyId: string | undefined;

  if (attackerWon) {
    // يموت كل جنود القافلة، والفائز يأخذ الذهب ويبدأ عودته — §7
    for (const d of convoy.soldiers) {
      killSoldier(s, convoyOwner.id, d, rng, deathEvents);
      defenderLosses.push(d.id);
      defenderLossDetails.push({ soldierId: d.id, rank: d.rank });
    }
    for (const r of winnerDead) {
      killSoldier(s, attackerTeam.id, r.soldier, rng, deathEvents);
      attackerLosses.push(r.soldier.id);
      attackerLossDetails.push({ soldierId: r.soldier.id, rank: r.soldier.rank });
    }
    // الحمل بمقدار قوة كل ناجٍ؛ ما تبقى يسقط كومة على الطريق
    let carried = 0;
    for (const r of winnerSurvivors) {
      const take = Math.min(r.power, convoy.goldCarried - carried);
      carried += Math.max(0, take);
      r.soldier.pendingPromotion = true;
    }
    const leftover = convoy.goldCarried - carried;
    s.convoys = s.convoys.filter((c) => c.id !== convoy.id);
    if (leftover > 0) dropGoldPile(s, leftover, convoy.position, rng, followEvents);
    const survivors = winnerSurvivors.map((r) => r.soldier);
    if (survivors.length > 0) {
      const created = createConvoy(s, attackerTeam.id, convoy.teamId, survivors, carried, rng, followEvents);
      // القافلة الجديدة تبدأ من موقع الاعتراض وليس من قلعة الهدف
      created.position = { ...convoy.position };
      newConvoyId = created.id;
      lootGoldAmount = carried;
    }
    pushLog(s, `${attackerTeam.name} اعترضت قافلة ${convoyOwner.name} وأخذت ${carried} ذهب`, attackerTeam.id);
  } else {
    // صدّت القافلة الاعتراض: يموت كل المهاجمين، والقافلة تكمل طريقها
    for (const r of attRolled) {
      killSoldier(s, attackerTeam.id, r.soldier, rng, deathEvents);
      attackerLosses.push(r.soldier.id);
      attackerLossDetails.push({ soldierId: r.soldier.id, rank: r.soldier.rank });
    }
    // قتلى القافلة من الضرر المتدفق يسقطون ذهبهم مكانهم — §7
    for (const r of winnerDead) {
      const idx = convoy.soldiers.findIndex((x) => x.id === r.soldier.id);
      const share = idx >= 0 ? convoyGoldShare(convoy, idx) : 0;
      convoy.goldCarried -= share;
      convoy.soldiers = convoy.soldiers.filter((x) => x.id !== r.soldier.id);
      killSoldier(s, convoyOwner.id, r.soldier, rng, deathEvents, share, convoy.position);
      defenderLosses.push(r.soldier.id);
      defenderLossDetails.push({ soldierId: r.soldier.id, rank: r.soldier.rank });
      if (share > 0) dropGoldPile(s, share, convoy.position, rng, followEvents);
    }
    // ناجو القافلة المنتصرون مستحقون للترقية عند الوصول
    for (const r of winnerSurvivors) r.soldier.pendingPromotion = true;
    pushLog(s, `قافلة ${convoyOwner.name} صدّت اعتراض ${attackerTeam.name}`, convoyOwner.id);
  }

  regarrison(s, attackerTeam);
  events.push(
    stamp<BattleResolvedEvent>(rng, {
      type: 'battle-resolved',
      battleKind: 'convoy',
      attackerTeamId: attackerTeam.id,
      defenderTeamId: convoyOwner.id,
      attackPower,
      defensePower,
      attackerWon,
      attackerLosses,
      defenderLosses,
      attackerLossDetails,
      defenderLossDetails,
      lootGold: lootGoldAmount,
      convoyId: newConvoyId,
    }),
    ...deathEvents,
    ...followEvents,
  );
}

// ─────────────────────────────────────────────
// التقاط كومة ذهب (خارجية/ساقطة) — بلا قتال — §5، §7
// ─────────────────────────────────────────────

function pickupPile(
  s: GameState,
  attackerTeam: Team,
  pileId: string,
  attackers: Soldier[],
  rng: RNG,
  events: GameEvent[],
): void {
  const pile = s.piles.find((p) => p.id === pileId);
  if (!pile || pile.amount <= 0) return;
  const attRolled = rollPowers(s, attackers, rng);
  let carried = 0;
  for (const r of attRolled) {
    const take = Math.min(r.power, pile.amount - carried);
    carried += Math.max(0, take);
    r.soldier.pendingPromotion = false; // التقاط بلا قتال = لا ترقية
    if (carried >= pile.amount) break;
  }
  pile.amount -= carried;
  // إن كانت كومة خارجية لمجموعة، خصم من رصيدها الخارجي
  if (pile.kind === 'outside' && pile.ownerTeamId) {
    const owner = getTeam(s, pile.ownerTeamId);
    owner.goldOutside = pile.amount;
  }
  if (pile.amount <= 0) s.piles = s.piles.filter((p) => p.id !== pile.id);
  createConvoy(s, attackerTeam.id, pile.ownerTeamId ?? attackerTeam.id, attackers, carried, rng, events);
  // الالتقاط يحدث من موقع الكومة
  s.convoys[s.convoys.length - 1].position = { ...pile.position };
  pushLog(s, `${attackerTeam.name} التقطت ${carried} ذهب من كومة مكشوفة`, attackerTeam.id);
}

// ─────────────────────────────────────────────
// نقطة الدخول: تنفيذ إرسال الجيش — §11
// ─────────────────────────────────────────────

export function dispatchArmy(
  state: GameState,
  teamId: TeamId,
  target: ArmyTarget,
  composition: ArmyComposition,
  rng: RNG,
): LogicResult {
  const s = cloneState(state);
  const attackerTeam = getTeam(s, teamId);
  if (attackerTeam.id !== currentTeam(s).id) return noChange(state); // الإرسال في جولة صاحبها فقط

  const attackers = pickAttackers(attackerTeam, composition);
  if (!attackers) return noChange(state);

  const events: GameEvent[] = [];

  switch (target.kind) {
    case 'castle': {
      const defenderTeam = getTeam(s, target.teamId);
      if (defenderTeam.id === attackerTeam.id) return noChange(state);
      if (isTeamProtected(s, defenderTeam.id)) return noChange(state); // §17 حماية
      raidCastle(s, attackerTeam, defenderTeam, attackers, rng, events);
      break;
    }
    case 'convoy': {
      const convoy = s.convoys.find((c) => c.id === target.convoyId);
      if (!convoy || convoy.soldiers.length === 0) return noChange(state);
      if (convoy.teamId === attackerTeam.id) return noChange(state);
      if (isTeamProtected(s, convoy.teamId)) return noChange(state);
      interceptConvoy(s, attackerTeam, convoy, attackers, rng, events);
      break;
    }
    case 'gold-pile': {
      const pile = s.piles.find((p) => p.id === target.pileId);
      if (!pile || pile.amount <= 0) return noChange(state);
      // كومة المجموعة الخارجية لا تُلتقط من صاحبها (هي ملكه أصلًا)
      if (pile.kind === 'outside' && pile.ownerTeamId === attackerTeam.id) return noChange(state);
      if (pile.kind === 'outside' && pile.ownerTeamId && isTeamProtected(s, pile.ownerTeamId)) return noChange(state);
      pickupPile(s, attackerTeam, target.pileId, attackers, rng, events);
      break;
    }
  }

  return events.length > 0 ? { state: s, events } : noChange(state);
}
