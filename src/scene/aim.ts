/**
 * حلّ مسار قذيفة المنجنيق إلى هدف فعلي (تقريب مشهد — المحرك يطبق الضرر).
 *
 * الإصلاح الجذري لخلل «الإطلاق على طابق ثانٍ لا يسبب ضررًا»:
 * كان الحل القديم ينظر فقط إلى نقطة سقوط القذيفة على الأرض (y=0) ويخمّن
 * الطابق من زاوية التصويب. لكن القذيفة التي تعبر الطابق الثاني بصريًا
 * تواصل قوسها وتهبط على الأرض *خلف* القلعة بـ 13-22 وحدة (خارج نافذة
 * الالتقاط d<9)، فيُحلّ الهدف إلى «أرض فارغة» ولا يحدث أي ضرر.
 *
 * الحل: نفحص نقاط المسار نفسها — أول نقطة تدخل اسطوانة برج قلعة معادية
 * تحدد الإصابة، والطابق يُشتق من *ارتفاع* نقطة التقاطع (لا من زاوية
 * التصويب): تحت BASE_HEIGHT = قاعدة، وإلا floors[(y-BASE)/FLOOR_H].
 * السقوط الأرضي القريب يبقى احتياطًا (قاعدة/جنود/أكوام/حجارة/قوافل).
 */
import type { CatapultTarget, GameState, Vec3 } from '@/contracts/types';
import { BASE_HEIGHT, FLOOR_HEIGHT } from '@/engine/logic/geometry';
import { convoySoldierOffset, outsideSoldierPosition, pileScenePosition, stonesPosition, teamCastlePos } from './layout';

/** نصف قطر اسطوانة البرج للالتقاط (نصف عرض الطابق 3.7 + هامش تسامح) */
const TOWER_RADIUS = 4.4;
/** نصف قطر وجه البرج المرئي عند الطوابق (نصف عرض الطابق 3.7 + هامش الحجر) */
export const TOWER_FACE_RADIUS = 3.95;
/** نصف قطر وجه القاعدة المرئي (نصف عرض القاعدة 4.5 + هامش الحجر) */
export const BASE_FACE_RADIUS = 4.75;
/** سقوط أرضي ضمن هذه المسافة من مركز القلعة = إصابة قاعدة (التراس 8.5) */
const BASE_LANDING_RADIUS = 7.5;

/** هل الفريق مستهدف صالح للقصف حاليًا؟ (ليس صاحب الدور ولا محميًا) */
function isAttackable(state: GameState, teamId: string): boolean {
  const me = state.teams[state.turnIndex];
  if (teamId === me?.id) return false;
  return (state.protectionRoundsLeft[teamId] ?? 0) <= 0;
}

/**
 * أول تقاطع للمسار مع برج قلعة معادية. يتجاهل النقاط التي تمر *فوق* سطح
 * القلعة (قوس يعلو القبة ويكمل خلفها) حتى لا تُحسب تحليقًا إصابةً.
 * عند تداخل عدة قلاع (نظريًا) يفوز الأبكر على المسار.
 */
export function towerIntersection(state: GameState, points: Vec3[]): CatapultTarget | null {
  let best: { pathIndex: number; target: CatapultTarget } | null = null;
  for (const team of state.teams) {
    if (!isAttackable(state, team.id)) continue;
    const c = teamCastlePos(state, team.id);
    const floors = team.castle.floors;
    const roofY = BASE_HEIGHT + floors.length * FLOOR_HEIGHT + 0.8; // + غطاء القبة
    for (let i = 0; i < points.length; i++) {
      if (best && best.pathIndex <= i) break; // وجدنا إصابة أبكر على المسار
      const p = points[i];
      if (Math.hypot(p.x - c.x, p.z - c.z) > TOWER_RADIUS) continue;
      if (p.y > roofY) continue; // تحليق فوق القبة — ليس اختراقًا للبرج
      if (p.y < BASE_HEIGHT || floors.length === 0) {
        best = { pathIndex: i, target: { kind: 'base', teamId: team.id } };
      } else {
        const fi = Math.min(floors.length - 1, Math.max(0, Math.floor((p.y - BASE_HEIGHT) / FLOOR_HEIGHT)));
        best = { pathIndex: i, target: { kind: 'floor', teamId: team.id, floorId: floors[fi].id } };
      }
      break; // أول دخول لهذه القلعة يكفي
    }
  }
  return best ? best.target : null;
}

/** إصابة سطح برج مرئية: نقطة الارتطام على وجه البرج + الهدف المشتق منها */
export interface TowerSurfaceHit {
  /** نقطة الارتطام على وجه البرج (مُسقطة على نصف قطر الجدار لا داخله) */
  point: Vec3;
  /** فهرس نقطة المسار التي دخلت اسطوانة البرج أولًا (لاقتطاع المسار المرئي) */
  pathIndex: number;
  teamId: GameState['teams'][number]['id'];
  /** فهرس الطابق المصاب (0-based) أو null للقاعدة */
  floorIndex: number | null;
  target: CatapultTarget;
}

/**
 * أول ارتطام للمسار بسطح برج قلعة معادية — نسخة تحمل **النقطة** (لا الهدف
 * فقط كما في towerIntersection) حتى ينتهي المسار المرئي للقذيفة على وجه
 * البرج بدل اختراقه شبحًا نحو الأرض. النقطة تُسقَط أفقيًا على نصف قطر
 * الجدار الفعلي (TOWER_FACE_RADIUS للطوابق / BASE_FACE_RADIUS للقاعدة)
 * مع الإبقاء على ارتفاع نقطة الدخول.
 */
export function towerSurfaceHit(state: GameState, points: Vec3[]): TowerSurfaceHit | null {
  for (const team of state.teams) {
    if (!isAttackable(state, team.id)) continue;
    const c = teamCastlePos(state, team.id);
    const floors = team.castle.floors;
    const roofY = BASE_HEIGHT + floors.length * FLOOR_HEIGHT + 0.8;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > TOWER_RADIUS) continue;
      if (p.y > roofY) continue; // تحليق فوق القبة
      const isBase = p.y < BASE_HEIGHT || floors.length === 0;
      const faceR = isBase ? BASE_FACE_RADIUS : TOWER_FACE_RADIUS;
      // الإسقاط على الوجه: شعاعيًا من المحور عادةً؛ وإن كانت نقطة الدخول على
      // المحور نفسه (d≈0) نستشف جهة الاقتراب من النقطة السابقة على المسار
      let ux = dx;
      let uz = dz;
      if (d <= 1e-6) {
        const prev = points[Math.max(0, i - 1)];
        const tx = p.x - prev.x;
        const tz = p.z - prev.z;
        const tl = Math.hypot(tx, tz) || 1;
        ux = -tx / tl; // الوجه في جهة قدوم القذيفة
        uz = -tz / tl;
      } else {
        ux = dx / d;
        uz = dz / d;
      }
      const point: Vec3 = { x: c.x + ux * faceR, y: Math.max(0.6, p.y), z: c.z + uz * faceR };
      if (isBase) {
        return { point, pathIndex: i, teamId: team.id, floorIndex: null, target: { kind: 'base', teamId: team.id } };
      }
      const fi = Math.min(floors.length - 1, Math.max(0, Math.floor((p.y - BASE_HEIGHT) / FLOOR_HEIGHT)));
      return {
        point,
        pathIndex: i,
        teamId: team.id,
        floorIndex: fi,
        target: { kind: 'floor', teamId: team.id, floorId: floors[fi].id },
      };
    }
  }
  return null;
}

/**
 * يحلّ مسار القذيفة إلى هدف: أولوية لاختراق برج قلعة (إصابة طابق بعينه
 * أو قاعدته حسب ارتفاع التقاطع)، ثم قرب نقطة السقوط من الأهداف الأرضية.
 */
export function resolveAimTarget(state: GameState, landing: Vec3, points: Vec3[]): CatapultTarget {
  const tower = towerIntersection(state, points);
  if (tower) return tower;

  let best: { d: number; t: CatapultTarget } | null = null;
  const consider = (pos: Vec3, t: CatapultTarget, radius: number) => {
    const d = Math.hypot(pos.x - landing.x, pos.z - landing.z);
    if (d < radius && (!best || d < best.d)) best = { d, t };
  };
  // موضع العرض المكشوف للكومة (layout) لا الموضع المنطقي — يطابق ما يراه اللاعب
  for (const pile of state.piles) consider(pileScenePosition(state, pile), { kind: 'gold-pile', pileId: pile.id }, 3.2);
  for (const team of state.teams) {
    if (!isAttackable(state, team.id)) continue;
    consider(stonesPosition(state, team.id), { kind: 'stones', teamId: team.id }, 3);
    const outside = team.soldiers.filter((x) => x.state === 'outside');
    outside.forEach((sol, i) => {
      consider(outsideSoldierPosition(state, team.id, i, Math.max(1, outside.length)), { kind: 'soldier', teamId: team.id, soldierId: sol.id }, 2.4);
    });
    // سقوط داخل تراس القلعة دون اختراق البرج = إصابة القاعدة
    const c = teamCastlePos(state, team.id);
    consider({ x: c.x, y: 0, z: c.z }, { kind: 'base', teamId: team.id }, BASE_LANDING_RADIUS);
  }
  for (const convoy of state.convoys) {
    const me = state.teams[state.turnIndex];
    if (convoy.teamId === me?.id) continue;
    convoy.soldiers.forEach((sol, i) => {
      const off = convoySoldierOffset(i);
      consider(
        { x: convoy.position.x + off.x, y: 0, z: convoy.position.z + off.z },
        { kind: 'convoy', convoyId: convoy.id, soldierId: sol.id },
        2.4,
      );
    });
  }
  return best ? (best as { d: number; t: CatapultTarget }).t : { kind: 'ground', position: { ...landing } };
}
