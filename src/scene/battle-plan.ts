/**
 * اشتقاق خطة مشهد المعركة من حدث battle-resolved + الحالة بعده (دوال نقية،
 * مفصولة عن مكوّن BattleScene حتى يبقى الملف الأخير «مكوّنات فقط» لـ fast-refresh).
 *
 * الطابور يُشغَّل بعد تحديث الحالة، لذا نشتق من الحالة *بعد* المعركة:
 * - فوز المهاجم: آخر قافلة teamId=المهاجم fromTeamId=المدافع أنشأتها هذه
 *   المعركة — جنودها = الناجون، وموقعها = موقع المعركة (قلعة المدافع في
 *   الغزو، نقطة الاعتراض في اعتراض القافلة).
 * - هزيمة المهاجم: كل مهاجميه ماتوا (attackerLosses)، والموقع قلعة المدافع
 *   أو قافلته إن كانت ما تزال في الطريق (اعتراض صُدّ).
 */
import type { BattleResolvedEvent, GameState, Rank, Soldier, TeamColor, Vec3 } from '@/contracts/types';
import { castleGatePos, pileScenePosition, teamCastlePos } from './layout';

/** سقف المجسمات المعروضة لكل جانب — ما زاد يوحى به بهالة ذهبية فوق الرتل */
export const MAX_SHOWN_SOLDIERS = 8;
const MAX_SHOWN_DEAD = 3;

export interface BattlePlan {
  eventId: string;
  attackerTeamId: string;
  defenderTeamId: string;
  /** بوابة قلعة المهاجم (نقطة الانطلاق) */
  origin: Vec3;
  /**
   * موقع المعركة — في غزو القلاع: **بوابة قلعة المدافع** (جهة النوافذ/
   * الكاميرا عند القاعدة) حيث يقف المهاجمون ويخرج إليهم المدافعون؛
   * في اعتراض القوافل: موقع القافلة على الطريق.
   */
  site: Vec3;
  /** نوع الموقع: بوابة قلعة (خروج مدافعين + قتال عند الباب) / ميدان مفتوح */
  siteKind: 'castle-gate' | 'field';
  /** مركز قلعة المدافع (يخرج منها المدافعون نحو البوابة) — = site في الميدان */
  defCastle: Vec3;
  attackerColor: TeamColor;
  defenderColor: TeamColor;
  /** إجمالي المهاجمين الفعلي (يُعرض منه MAX_SHOWN_SOLDIERS كحد أقصى) */
  attackerCount: number;
  /** رتب العرض بطول attackerCount */
  attackerRanks: Rank[];
  /** الناجون المهاجمون (إن فاز المهاجم) */
  survivorCount: number;
  attackerWon: boolean;
  attackPower: number;
  defensePower: number;
  /** الغنيمة التي حملها الناجون (لعرضها في الاحتفال) */
  lootGold: number;
  /** قتلى يُعرضون ساقطين في الخاتمة */
  attackerDeadShown: number;
  defenderDeadShown: number;
  marchMs: number;
  fightMs: number;
  returnMs: number;
  fadeMs: number;
  totalMs: number;
}

export function prefersReducedMotionNow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** اشتقاق خطة المشهد من حدث المعركة + الحالة بعدها (دالة نقية — قابلة للاختبار) */
export function planBattle(ev: BattleResolvedEvent, state: GameState, reduced = prefersReducedMotionNow()): BattlePlan {
  const attCastle = teamCastlePos(state, ev.attackerTeamId);
  const defCastle = teamCastlePos(state, ev.defenderTeamId);
  const attackerColor = state.teams.find((t) => t.id === ev.attackerTeamId)?.color ?? 'emerald';
  const defenderColor = state.teams.find((t) => t.id === ev.defenderTeamId)?.color ?? 'ruby';

  // ناجو المهاجم: قافلة الغنائم التي أنشأتها هذه المعركة (فوز فقط)
  let survivors: { rank: Rank }[] = [];
  let site: Vec3 = { ...defCastle };
  if (ev.attackerWon) {
    const convoy = [...state.convoys]
      .reverse()
      .find((c) => c.teamId === ev.attackerTeamId && c.fromTeamId === ev.defenderTeamId);
    if (convoy) {
      survivors = convoy.soldiers;
      site = { x: convoy.position.x, y: 0, z: convoy.position.z };
    }
  } else if (ev.battleKind === 'convoy') {
    // اعتراض صُدّ: قافلة المدافع ما تزال في الطريق بعيدًا عن قلعته
    const convoy = [...state.convoys]
      .reverse()
      .find((c) => c.teamId === ev.defenderTeamId && Math.hypot(c.position.x - defCastle.x, c.position.z - defCastle.z) > 6);
    if (convoy) site = { x: convoy.position.x, y: 0, z: convoy.position.z };
  }

  // غزو قلعة: المعركة تدور عند **بوابة** قلعة المدافع (جهة النوافذ/الكاميرا)
  // — المهاجمون يمشون إلى الباب ويقفون عنده، والمدافعون يخرجون منه.
  const isCastleBattle = ev.battleKind === 'castle';
  const defGate = castleGatePos(defCastle);
  if (isCastleBattle) site = { ...defGate };

  const attackerCount = Math.max(1, ev.attackerLosses.length + survivors.length);
  const attackerRanks: Rank[] = [];
  for (let i = 0; i < attackerCount; i++) {
    attackerRanks.push(survivors[i]?.rank ?? (i % 3 === 2 ? 'novice' : 'soldier'));
  }

  // نقطة الانطلاق: بوابة القلعة في جهة الهدف (خارج نصف قطر القاعدة ~6.4)
  const dx = site.x - attCastle.x;
  const dz = site.z - attCastle.z;
  const len = Math.hypot(dx, dz) || 1;
  const origin: Vec3 = { x: attCastle.x + (dx / len) * 7, y: 0, z: attCastle.z + (dz / len) * 7 };

  const dist = Math.hypot(site.x - origin.x, site.z - origin.z);
  const k = reduced ? 0.28 : 1; // تقليل الحركة: مشهد مقصوص بشدة
  const marchMs = Math.min(2500, Math.max(1500, (dist / 24) * 1000)) * k;
  const fightMs = 1800 * k;
  const returnMs = (ev.attackerWon ? 1000 : 800) * k;
  const fadeMs = 350 * k;

  return {
    eventId: ev.id,
    attackerTeamId: ev.attackerTeamId,
    defenderTeamId: ev.defenderTeamId,
    origin,
    site,
    siteKind: isCastleBattle ? 'castle-gate' : 'field',
    defCastle,
    attackerColor,
    defenderColor,
    attackerCount,
    attackerRanks,
    survivorCount: ev.attackerWon ? survivors.length : 0,
    attackerWon: ev.attackerWon,
    attackPower: ev.attackPower,
    defensePower: ev.defensePower,
    lootGold: ev.lootGold,
    attackerDeadShown: Math.min(MAX_SHOWN_DEAD, ev.attackerLosses.length),
    defenderDeadShown: Math.min(MAX_SHOWN_DEAD, ev.defenderLosses.length),
    marchMs,
    fightMs,
    returnMs,
    fadeMs,
    totalMs: marchMs + fightMs + returnMs + fadeMs,
  };
}

// ─── مشاهد النهب بلا قتال (قلعة فارغة / كومة ذهب) ───

/**
 * إرسال بلا معركة (لا يصدر عنه battle-resolved): المحرك يبث convoy-departed
 * فقط. نبني منه مشهد: مسير نحو الهدف ← دخول القلعة الفارغة/التقاط الكومة
 * ← خروج بأكياس الذهب ← احتفال مستمر حتى تأكيد البطاقة الثابتة.
 */
export interface LootPlan {
  eventId: string;
  teamId: string;
  color: TeamColor;
  /** بوابة قلعة المهاجم (نقطة الانطلاق) */
  origin: Vec3;
  /** موقع النهب: بوابة القلعة الفارغة أو موضع عرض الكومة */
  site: Vec3;
  siteKind: 'castle' | 'pile';
  /** مركز القلعة المنهوبة (يدخلها المهاجمون) — null لكومة */
  lootCastle: Vec3 | null;
  soldierRanks: Rank[];
  lootGold: number;
  marchMs: number;
  /** مدة الدخول/الالتقاط قبل الاحتفال */
  pickupMs: number;
  returnMs: number;
  fadeMs: number;
  /** الأطوار الزمنية فقط (الاحتفال يمتد حتى التأكيد — لا يدخل في المجموع) */
  totalMs: number;
}

/**
 * يشتق خطة نهب من حدث convoy-departed، أو null إن كانت القافلة ثمرة
 * معركة (لها battle-resolved يغطيها) — يُمرَّر hasBattle من مشغّل الأحداث.
 */
export function planLoot(
  convoy: { id: string; teamId: string; fromTeamId: string; position: Vec3; soldiers: Soldier[]; goldCarried: number },
  eventId: string,
  state: GameState,
  reduced = prefersReducedMotionNow(),
): LootPlan {
  const attCastle = teamCastlePos(state, convoy.teamId);
  const color = state.teams.find((t) => t.id === convoy.teamId)?.color ?? 'emerald';

  // هل انطلقت من قلعة (نهب قلعة فارغة) أم من كومة على الطريق؟
  const fromCastle = teamCastlePos(state, convoy.fromTeamId);
  const nearCastle = Math.hypot(convoy.position.x - fromCastle.x, convoy.position.z - fromCastle.z) < 7.5;
  let siteKind: 'castle' | 'pile' = nearCastle ? 'castle' : 'pile';
  let site: Vec3;
  let lootCastle: Vec3 | null = null;
  if (nearCastle) {
    site = castleGatePos(fromCastle); // يقفون عند الباب ثم يدخلون
    lootCastle = { ...fromCastle };
  } else {
    // كومة: اعرض موضعها المرئي إن بقيت في الحالة، وإلا موضع الانطلاق نفسه
    const pile = state.piles.find(
      (p) => Math.hypot(p.position.x - convoy.position.x, p.position.z - convoy.position.z) < 2.5,
    );
    site = pile ? { ...pileScenePosition(state, pile) } : { x: convoy.position.x, y: 0, z: convoy.position.z };
    siteKind = 'pile';
  }

  // نقطة الانطلاق: بوابة قلعة المهاجم بجهة الهدف
  const dx = site.x - attCastle.x;
  const dz = site.z - attCastle.z;
  const len = Math.hypot(dx, dz) || 1;
  const origin: Vec3 = { x: attCastle.x + (dx / len) * 7, y: 0, z: attCastle.z + (dz / len) * 7 };

  const dist = Math.hypot(site.x - origin.x, site.z - origin.z);
  const k = reduced ? 0.28 : 1;
  const marchMs = Math.min(2500, Math.max(1400, (dist / 24) * 1000)) * k;
  const pickupMs = (siteKind === 'castle' ? 1600 : 1000) * k;
  const returnMs = 800 * k;
  const fadeMs = 350 * k;

  return {
    eventId,
    teamId: convoy.teamId,
    color,
    origin,
    site,
    siteKind,
    lootCastle,
    soldierRanks: convoy.soldiers.map((s) => s.rank),
    lootGold: convoy.goldCarried,
    marchMs,
    pickupMs,
    returnMs,
    fadeMs,
    totalMs: marchMs + pickupMs + returnMs + fadeMs,
  };
}
