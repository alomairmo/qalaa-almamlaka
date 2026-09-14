/**
 * أدوات الحالة الأساسية: إنشاء الحالة الابتدائية، النسخ العميق،
 * صناعة الأحداث، السجل النصي، ومساعدات البحث عن المجموعات.
 * كل دوال المنطق نقية: تستقبل GameState وترجع نسخة جديدة + أحداثًا.
 */
import type { GameEvent, GameSettings, GameState, Team, TeamId } from '@/contracts/types';
import { DEFAULT_CATAPULT_POWER, DEFAULT_SETTINGS, TEAM_COLOR_ORDER, TEAM_DEFAULT_NAMES } from '@/contracts/defaults';
import type { RNG } from '../rng';

export interface LogicResult {
  state: GameState;
  events: GameEvent[];
}

/** نتيجة «لا شيء حدث» (فشل شرط مسبق) */
export function noChange(state: GameState): LogicResult {
  return { state, events: [] };
}

/** نسخة عميقة من الحالة (الحالة بيانات خام JSON فقط) */
export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

let eventCounter = 0;

/** Omit توزيعي (يحافظ على اتحاد الأنواع) */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** ختم حدث موحّد (id فريد + توقيت) */
export function stamp<T extends GameEvent>(rng: RNG, e: DistributiveOmit<T, 'id' | 'at'>): T {
  eventCounter += 1;
  return {
    ...e,
    id: `ev-${Date.now().toString(36)}-${eventCounter}-${Math.floor(rng.next() * 1e6).toString(36)}`,
    at: Date.now(),
  } as T;
}

/** معرّف فريد لكيانات اللعبة (جنود، طوابق، قوافل، أكوام) */
export function makeId(prefix: string, rng: RNG): string {
  eventCounter += 1;
  return `${prefix}-${eventCounter}-${Math.floor(rng.next() * 1e9).toString(36)}`;
}

/** إضافة سطر لسجل الأحداث النصي داخل الحالة المنسوخة */
export function pushLog(state: GameState, text: string, teamId?: TeamId): void {
  state.log.push({
    id: `log-${state.log.length + 1}-${Date.now().toString(36)}`,
    at: Date.now(),
    roundNumber: state.roundNumber,
    teamId,
    text,
  });
  // حد أقصى معقول للسجل حتى لا يتضخم الحفظ
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
}

/** إنشاء مجموعة جديدة بالقيم الابتدائية (لا موارد ابتدائية في الوثيقة) */
export function createTeam(index: number, settings: GameSettings): Team {
  return {
    id: `team-${index + 1}`,
    name: TEAM_DEFAULT_NAMES[index] ?? `المجموعة ${index + 1}`,
    color: TEAM_COLOR_ORDER[index % TEAM_COLOR_ORDER.length],
    goldInside: 0,
    goldOutside: 0,
    stonesOutside: 0,
    soldiers: [],
    castle: {
      floors: [],
      baseHp: settings.combat.floorHp,
      baseMaxHp: settings.combat.floorHp,
      catapultReady: true,
    },
  };
}

/** الحالة الابتدائية الكاملة لموسم جديد */
export function createInitialState(settings?: Partial<GameSettings>, questionBank: GameState['questionBank'] = []): GameState {
  const merged: GameSettings = {
    ...structuredClone(DEFAULT_SETTINGS),
    ...structuredClone(settings ?? {}),
  };
  const teamCount = Math.min(6, Math.max(2, Math.round(merged.general.teamCount)));
  merged.general.teamCount = teamCount;
  const teams = Array.from({ length: teamCount }, (_, i) => createTeam(i, merged));
  const protectionRoundsLeft: Record<TeamId, number> = {};
  const usedQuestionsPerTeam: Record<TeamId, string[]> = {};
  const catapultPowerByTeam: Record<TeamId, number> = {};
  for (const t of teams) {
    protectionRoundsLeft[t.id] = 0;
    usedQuestionsPerTeam[t.id] = [];
    catapultPowerByTeam[t.id] = DEFAULT_CATAPULT_POWER;
  }
  return {
    schemaVersion: 1,
    teams,
    convoys: [],
    piles: [],
    turnIndex: 0,
    roundNumber: 1,
    phase: 'idle',
    settings: merged,
    questionBank,
    usedQuestionsPerTeam,
    protectionRoundsLeft,
    catapultPowerByTeam,
    log: [],
    seasonStartedAt: Date.now(),
  };
}

/** إيجاد مجموعة بالمعرّف (يرمي خطأً إن لم توجد — خطأ برمجي وليس حالة لعب) */
export function getTeam(state: GameState, teamId: TeamId): Team {
  const t = state.teams.find((x) => x.id === teamId);
  if (!t) throw new Error(`team not found: ${teamId}`);
  return t;
}

/** فهرس المجموعة داخل teams[] */
export function teamIndexOf(state: GameState, teamId: TeamId): number {
  return state.teams.findIndex((x) => x.id === teamId);
}

/** المجموعة صاحبة الدور الحالي */
export function currentTeam(state: GameState): Team {
  return state.teams[state.turnIndex];
}

/** هل المجموعة محمية حاليًا من الهجوم/القصف؟ — §17 */
export function isTeamProtected(state: GameState, teamId: TeamId): boolean {
  // حماية الجولة الأولى الافتتاحية (إن فُعّلت من الإعدادات)
  if (state.settings.general.firstRoundProtection && state.roundNumber === 1) return true;
  // حماية إعانة إعادة الإعمار (عداد جولات لكل مجموعة)
  return (state.protectionRoundsLeft[teamId] ?? 0) > 0;
}
