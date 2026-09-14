/**
 * تخطيط مواقع المشهد المشتقة من حالة اللعبة.
 * المواقع الأساسية (القلاع/المسار) تأتي من engine/logic/geometry (لا تُعدَّل)،
 * وهنا نضيف مواقع «عرضية» ثابتة وحتمية: أكوام الحجارة، حلقة الجنود الخارجيين،
 * ارتفاعات الطوابق، اتجاه النوافذ نحو الكاميرا.
 */
import type { GameState, Team, TeamId, Vec3 } from '@/contracts/types';
import {
  castlePosition,
  castleTopHeight,
  CASTLE_RING_RADIUS,
  WINDOW_AZIMUTH,
  outsidePilePosition,
  outsideSoldierPosition as geometryOutsideSoldierPosition,
  stonesPilePosition,
} from '@/engine/logic/geometry';

export { CASTLE_RING_RADIUS };

/** اتجاه «الكاميرا العامة» في المشهد (قطر ثابت) — النوافذ والبوابات تواجهه */
export const CAMERA_AZIMUTH = WINDOW_AZIMUTH; // 45° — الكاميرا في ربع (+x,+z)

/** بعد بوابة القلعة عن مركزها (واجهة القاعدة 4.5 + هامش وقوف الموكب) */
export const CASTLE_GATE_DIST = 5.8;

/** موضع بوابة القلعة العالمي — عند قاعدة الواجهة (جهة النوافذ/الكاميرا) */
export function castleGatePos(castle: Vec3): Vec3 {
  return {
    x: castle.x + Math.cos(CAMERA_AZIMUTH) * CASTLE_GATE_DIST,
    y: 0,
    z: castle.z + Math.sin(CAMERA_AZIMUTH) * CASTLE_GATE_DIST,
  };
}

/** فهرس المجموعة داخل teams[] */
export function teamIndex(state: GameState, teamId: TeamId): number {
  const i = state.teams.findIndex((t) => t.id === teamId);
  return i >= 0 ? i : 0;
}

export function teamCastlePos(state: GameState, teamId: TeamId): Vec3 {
  return castlePosition(teamIndex(state, teamId), state.teams.length);
}

/** زاوية دوران القلعة حتى تواجه واجهتها (+Z المحلي) اتجاه الكاميرا العامة */
export function castleFacingYaw(pos: Vec3): number {
  return yawTowards(pos, {
    x: Math.cos(CAMERA_AZIMUTH) * 100,
    y: 0,
    z: Math.sin(CAMERA_AZIMUTH) * 100,
  });
}

/** زاوية Y التي تجعل +Z المحلي يشير من from نحو to */
export function yawTowards(from: Vec3, to: Vec3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** موقع أكوام الحجارة بجوار القلعة — جهة النوافذ (يطابق stonesPilePosition في المحرك) */
export function stonesPosition(state: GameState, teamId: TeamId): Vec3 {
  return stonesPilePosition(teamIndex(state, teamId), state.teams.length);
}

/**
 * موقع عرض كومة الذهب الخارجية — جهة النوافذ دائمًا (ظاهرة للكاميرا)،
 * يطابق outsidePilePosition في المحرك حتى يتطابق المرئي مع منطق
 * السبلاش/الارتداد. خارج قاعدة القلعة المدوّرة (~6.4) بهامش واضح.
 */
export function goldPileDisplayPosition(state: GameState, teamId: TeamId): Vec3 {
  return outsidePilePosition(teamIndex(state, teamId), state.teams.length);
}

/**
 * موقع الكومة في المشهد: أكوام 'outside' تُعرض عند goldPileDisplayPosition
 * (وليس موضعها المنطقي المدفون جزئيًا)، وأكوام 'dropped' تبقى حيث سقطت.
 * يجب أن تستخدمه كل طبقات المشهد (العرض، علامات الاستهداف، حلّ التصويب)
 * حتى يتطابق ما يراه اللاعب مع ما ينقره/يقصفه.
 */
export function pileScenePosition(state: GameState, pile: { kind: string; ownerTeamId?: TeamId; position: Vec3 }): Vec3 {
  if (pile.kind === 'outside' && pile.ownerTeamId) return goldPileDisplayPosition(state, pile.ownerTeamId);
  return { ...pile.position };
}

/** موقع جندي خارجي حسب ترتيبه — قوس جهة النوافذ (يطابق outsideSoldierPosition في المحرك) */
export function outsideSoldierPosition(state: GameState, teamId: TeamId, slot: number, _total: number): Vec3 {
  return geometryOutsideSoldierPosition(teamIndex(state, teamId), state.teams.length, slot);
}

/** موقع جندي قافلة حسب ترتيبه داخل القافلة */
export function convoySoldierOffset(slot: number): Vec3 {
  const row = Math.floor(slot / 2);
  const col = slot % 2;
  return { x: (col - 0.5) * 1.1, y: 0, z: row * -1.2 };
}

/** ارتفاع مركز الطابق i (0-based) فوق القاعدة */
export function floorCenterY(floorIndex: number): number {
  const BASE_HEIGHT = 4;
  const FLOOR_HEIGHT = 3;
  return BASE_HEIGHT + floorIndex * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
}

/** ارتفاع سطح القلعة (منصة المنجنيق) */
export function roofHeight(team: Team): number {
  return castleTopHeight(team);
}

// ─── منصة المنجنيق ───

/**
 * بعد منصة المنجنيق عن مركز القلعة (على السطح).
 * نصف عرض أعلى طابق 3.7 وقاعدة القبة نصف قطرها 2.9 — 3.1 يضع المنصة
 * أمام القبة مباشرة دون أن تتدلّى عن حافة السطح.
 */
export const CATAPULT_PLATFORM_DIST = 3.1;

/**
 * إزاحة منصة المنجنيق في الإطار المحلي للقلعة (قبل دوران castleFacingYaw).
 * المنصة دائمًا في جهة مركز الخريطة (جهة ساحة المعركة/اتجاه الإطلاق
 * الافتراضي) لكل القلاع مهما كان موقعها، فلا تقع القبة بين كاميرا
 * المنجنيق والأفق (إصلاح: «المنجنيق خلف القبة» في بعض القلاع).
 */
export function catapultPlatformLocal(castlePos: Vec3): { x: number; z: number } {
  const yaw = castleFacingYaw(castlePos);
  const len = Math.hypot(castlePos.x, castlePos.z) || 1;
  // اتجاه مركز الخريطة في الإطار العالمي
  const wx = -castlePos.x / len;
  const wz = -castlePos.z / len;
  // إلى الإطار المحلي: تدوير بـ -yaw حول Y (معكوس دوران مجموعة القلعة)
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = wx * c - wz * s;
  const lz = wx * s + wz * c;
  return { x: lx * CATAPULT_PLATFORM_DIST, z: lz * CATAPULT_PLATFORM_DIST };
}

/** موضع منصة المنجنيق العالمي (يجب أن يطابق إزاحة CatapultModel داخل Castle) */
export function catapultPlatformWorld(castlePos: Vec3, topY: number): Vec3 {
  const len = Math.hypot(castlePos.x, castlePos.z) || 1;
  return {
    x: castlePos.x - (castlePos.x / len) * CATAPULT_PLATFORM_DIST,
    y: topY + 0.3,
    z: castlePos.z - (castlePos.z / len) * CATAPULT_PLATFORM_DIST,
  };
}

// ─── التأطير الديناميكي لكاميرا الدور ───

/** هامش مريح حول المحتوى المؤطَّر (~15%) */
export const FRAME_MARGIN = 1.15;
/** نصف قطر حلقة الجنود الخارجيين حول القلعة (مطابق لـ outsideSoldierPosition) */
const SOLDIER_RING_RADIUS = 7;
/** ارتفاع إضافي فوق السطح: القبة + المنصة والمنجنيق + الراية */
const ROOF_EXTRAS = 4.4;

export interface FrameSphere {
  center: Vec3;
  radius: number;
}

/**
 * كرة محيطة (bounding sphere) بكل ما يجب أن تراه كاميرا الدور لقلعة مجموعة:
 * القلعة كاملة (قاعدة + طوابق + قبة ومنجنيق) + حلقة الجنود الخارجيين
 * + كومة الذهب الخارجية وكومة الحجارة المجاورتين.
 * تُحسب من الحالة مباشرة، فإن تغيّر الحجم (بناء طابق مثلًا) تغيّرت تلقائيًا.
 */
export function castleFrameSphere(state: GameState, teamId: TeamId): FrameSphere {
  const team = state.teams.find((t) => t.id === teamId);
  const idx = teamIndex(state, teamId);
  const n = state.teams.length;
  const c = castlePosition(idx, n);
  const topY = (team ? castleTopHeight(team) : 4) + ROOF_EXTRAS;

  // عيّنات النقاط المتطرفة (x/z/y دنيا وقصوى)
  const pts: Vec3[] = [
    { x: c.x, y: 0, z: c.z }, // قاعدة البوابة
    { x: c.x, y: topY, z: c.z }, // قمة القبة/المنجنيق
    // حلقة الجنود الخارجيين (أربع جهات)
    { x: c.x + SOLDIER_RING_RADIUS, y: 1, z: c.z },
    { x: c.x - SOLDIER_RING_RADIUS, y: 1, z: c.z },
    { x: c.x, y: 1, z: c.z + SOLDIER_RING_RADIUS },
    { x: c.x, y: 1, z: c.z - SOLDIER_RING_RADIUS },
  ];
  // كومة الذهب الخارجية (موضع العرض المكشوف) + كومة الحجارة
  const gold = goldPileDisplayPosition(state, teamId);
  pts.push({ x: gold.x, y: 1.5, z: gold.z });
  const stones = stonesPosition(state, teamId);
  pts.push({ x: stones.x, y: 1.5, z: stones.z });

  // المركز = منتصف الصندوق المحيط (bbox)
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const center: Vec3 = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  // نصف القطر = أبعد نقطة عن المركز + نصف عرض القاعدة (صناديق القلعة ليست نقطية)
  let radius = 0;
  for (const p of pts) {
    const d = Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z);
    if (d > radius) radius = d;
  }
  radius += 2.5; // غلاف صغير يغطي أحجام الشبكات نفسها (جندي/كومة/قبة)
  return { center, radius };
}

/**
 * المسافة اللازمة لتظهر كرة نصف قطرها radius كاملةً في كادر كاميرا
 * بفتحة fovDeg ونسبة aspect — القيد الأشد (عمودي/أفقي) يحسم، ثم هامش الأمان.
 */
export function frameDistance(radius: number, fovDeg: number, aspect: number, margin = FRAME_MARGIN): number {
  const tanV = Math.tan((fovDeg * Math.PI) / 360); // tan(FOV/2)
  const tanH = tanV * Math.max(0.5, aspect);
  return Math.max(radius / tanV, radius / tanH) * margin;
}

/** حلّ هدف قصف/هجوم إلى موقع عالمي (للكاميرا الملاحقة والانفجارات) */
export function resolveTargetPosition(
  state: GameState,
  target:
    | { kind: 'floor'; teamId: TeamId; floorId: string }
    | { kind: 'base'; teamId: TeamId }
    | { kind: 'gold-pile'; pileId: string }
    | { kind: 'stones'; teamId: TeamId }
    | { kind: 'soldier'; teamId: TeamId; soldierId: string }
    | { kind: 'convoy'; convoyId: string; soldierId: string }
    | { kind: 'ground'; position: Vec3 }
    | { kind: 'castle'; teamId: TeamId },
): Vec3 {
  switch (target.kind) {
    case 'ground':
      return { ...target.position };
    case 'gold-pile': {
      const p = state.piles.find((x) => x.id === target.pileId);
      return p ? { ...p.position } : { x: 0, y: 0, z: 0 };
    }
    case 'stones':
      return stonesPosition(state, target.teamId);
    case 'convoy': {
      const c = state.convoys.find((x) => x.id === target.convoyId);
      if (!c) return { x: 0, y: 0, z: 0 };
      const idx = Math.max(0, c.soldiers.findIndex((s) => s.id === target.soldierId));
      const off = convoySoldierOffset(idx);
      return { x: c.position.x + off.x, y: 0, z: c.position.z + off.z };
    }
    case 'soldier': {
      const team = state.teams.find((t) => t.id === target.teamId);
      if (!team) return { x: 0, y: 0, z: 0 };
      const outside = team.soldiers.filter((s) => s.state === 'outside');
      const idx = Math.max(0, outside.findIndex((s) => s.id === target.soldierId));
      const pos = outsideSoldierPosition(state, target.teamId, idx, Math.max(1, outside.length));
      return { x: pos.x, y: 0.8, z: pos.z };
    }
    case 'base': {
      const c = teamCastlePos(state, target.teamId);
      return { x: c.x, y: 2, z: c.z };
    }
    case 'castle': {
      const team = state.teams.find((t) => t.id === target.teamId);
      const c = teamCastlePos(state, target.teamId);
      return { x: c.x, y: team ? roofHeight(team) * 0.5 : 4, z: c.z };
    }
    case 'floor': {
      const team = state.teams.find((t) => t.id === target.teamId);
      const c = teamCastlePos(state, target.teamId);
      const idx = team ? team.castle.floors.findIndex((f) => f.id === target.floorId) : -1;
      const i = idx >= 0 ? idx : 0;
      return { x: c.x, y: floorCenterY(i), z: c.z };
    }
  }
}
