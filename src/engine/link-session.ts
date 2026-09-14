/**
 * جلسة الربط بالنظام التعليمي — «موسم مرتبط».
 *
 * عند اختيار (صف، أسبوع) من شاشة العنوان تُنشأ جلسة تربط كل فريق في اللعبة
 * بـ groupId من تعريفات مجموعات ذلك الصف، وتدير مزامنتين مستقلتين:
 *
 * 1) مزامنة الذهب اللحظية: بعد كل commit يُحسب إجمالي ذهب كل فريق
 *    (teamTotalGold: داخل القلعة + خارجها + ذهب قوافله العائدة)، وإن تغيّر عن
 *    آخر قيمة مرفوعة يُرفع (upsert) إلى صف marks `grp:<CLASS>:<groupId>`
 *    للأسبوع المختار — مع debounce ‏800ms لكل فريق.
 *
 * 2) حفظ التقدم والأحداث: بعد كل commit يُجمّع سجل الأحداث وتُرفع لقطة الحالة
 *    كاملة إلى qalaa_saves (class_key, week) — debounce ‏1.5s. التخزين مستقل
 *    لكل (صف، أسبوع) ولا يعمّم.
 *
 * الحفظ المحلي localStorage يبقى دائمًا الاحتياطي، وأي فشل شبكة لا يكسر اللعب
 * (يتحول المؤشر للأحمر وتُعاد المحاولة مع التغيّر التالي).
 */
import type { GameEvent, GameState, TeamId } from '@/contracts/types';
import type { SyncStatus } from '@/contracts/storage';
import { teamTotalGold } from './logic/season';
import { SupabaseProvider } from './storage/supabase-provider';

/** بيانات جلسة مرتبطة نشطة */
export interface LinkSession {
  classKey: string;
  week: number;
  /** teamId (team-1…) → groupId من تعريفات الصف */
  groupIdByTeamId: Record<TeamId, number>;
}

const LINK_SESSION_KEY = 'qalaa-almamlaka:link-session';
const GOLD_DEBOUNCE_MS = 800;
const PROGRESS_DEBOUNCE_MS = 1500;
const GOLD_POLL_INTERVAL_MS = 5000;
/** مهلة حارس سباق الاستطلاع: تجاهل قراءة قد تكون سبقت كتابة جارية */
const POLL_WRITE_GUARD_MS = 2500;

const provider = new SupabaseProvider();

let session: LinkSession | null = null;
let status: Extract<SyncStatus, 'syncing' | 'synced' | 'error'> = 'synced';
let statusListener: ((s: SyncStatus) => void) | null = null;

const goldTimers = new Map<TeamId, ReturnType<typeof setTimeout>>();
const lastPushedGold = new Map<TeamId, number>();
const goldChains = new Map<TeamId, Promise<void>>();
const goldInFlight = new Set<TeamId>();
/** آخر نشاط كتابة ذهب (بدء/انتهاء) لكل فريق — حارس سباق الاستطلاع */
const lastGoldWriteAt = new Map<TeamId, number>();
let progressTimer: ReturnType<typeof setTimeout> | null = null;
let accumulatedEvents: GameEvent[] = [];
let pendingState: GameState | null = null;

function setStatus(s: typeof status): void {
  status = s;
  statusListener?.(s);
}

/** تسجيل مستمع تغيّر حالة المزامنة (يربطه المتجر بمؤشر الواجهة) */
export function onLinkStatusChange(fn: ((s: SyncStatus) => void) | null): void {
  statusListener = fn;
}

/** الجلسة النشطة حاليًا (أو null في الوضع المحلي) */
export function getLinkSession(): LinkSession | null {
  return session;
}

/** حالة مزامنة الجلسة الحالية */
export function getLinkStatus(): SyncStatus {
  return session ? status : 'unconfigured';
}

/** تفعيل جلسة مرتبطة جديدة + تخزينها محليًا للاستعادة بعد إعادة التحميل */
export function setLinkSession(s: LinkSession): void {
  session = s;
  lastPushedGold.clear();
  goldInFlight.clear();
  lastGoldWriteAt.clear();
  accumulatedEvents = [];
  pendingState = null;
  for (const t of goldTimers.values()) clearTimeout(t);
  goldTimers.clear();
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = null;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LINK_SESSION_KEY, JSON.stringify(s));
    }
  } catch {
    /* بيئة بلا localStorage */
  }
  setStatus('synced');
  startGoldPolling();
}

/** استعادة جلسة محفوظة محليًا (بعد إعادة تحميل الصفحة + استئناف محلي) */
export function restoreLinkSession(): LinkSession | null {
  if (session) return session;
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LINK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LinkSession;
    if (parsed?.classKey && typeof parsed.week === 'number' && parsed.groupIdByTeamId) {
      session = parsed;
      setStatus('synced');
      startGoldPolling();
      return session;
    }
  } catch {
    /* تجاهل */
  }
  return null;
}

/** إنهاء الجلسة المرتبطة (العودة للوضع المحلي) */
export function clearLinkSession(): void {
  session = null;
  lastPushedGold.clear();
  goldInFlight.clear();
  lastGoldWriteAt.clear();
  accumulatedEvents = [];
  pendingState = null;
  stopGoldPolling();
  for (const t of goldTimers.values()) clearTimeout(t);
  goldTimers.clear();
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = null;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LINK_SESSION_KEY);
  } catch {
    /* تجاهل */
  }
}

// ─────────────────────────────────────────────
// مزامنة الذهب (لكل فريق، debounce)
// ─────────────────────────────────────────────
//
// ضمانات الإصدار الحالي:
// - lastPushedGold لا يُحدَّث إلا بعد نجاح الرفع فعليًا (كان يُضبط قبل
//   الاكتمال، فإن فشل الرفع بصمت بقيت القاعدة على القيمة القديمة بلا محاولة).
// - الرفعات لكل فريق متسلسلة (سلسلة وعود): دفعتان متداخلتان كانتا قد تصلان
//   بترتيب معكوس فتبقى القيمة الأقدم في القاعدة للأبد.
// - أي فشل يُسجَّل في console ويُعاد جدولته تلقائيًا.

/** رفع واحد فعلي (لا يُستدعى إلا عبر enqueueGoldPush لضمان التسلسل) */
async function pushGoldOnce(teamId: TeamId, gold: number): Promise<void> {
  const s = session;
  if (!s) return;
  const groupId = s.groupIdByTeamId[teamId];
  if (typeof groupId !== 'number') return;
  goldInFlight.add(teamId);
  lastGoldWriteAt.set(teamId, Date.now());
  setStatus('syncing');
  const ok = await provider.pushGroupGold(s.classKey, groupId, s.week, gold);
  lastGoldWriteAt.set(teamId, Date.now());
  goldInFlight.delete(teamId);
  if (ok) {
    lastPushedGold.set(teamId, gold);
    setStatus('synced');
  } else {
    setStatus('error');
    console.warn(`[link] فشل رفع ذهب ${teamId} (المجموعة ${groupId}) = ${gold} — ستُعاد المحاولة`);
    // فشل الشبكة: أعد الجدولة لمحاولة لاحقة تلقائية (أحدث قيمة تفوز عبر debounce)
    scheduleGoldSync(teamId, gold, GOLD_DEBOUNCE_MS * 4);
  }
}

/** سلسلة رفعات لكل فريق — يمنع وصول دفعتين متداخلتين بترتيب معكوس */
function enqueueGoldPush(teamId: TeamId, gold: number): void {
  const prev = goldChains.get(teamId) ?? Promise.resolve();
  const next = prev.then(() => pushGoldOnce(teamId, gold));
  goldChains.set(
    teamId,
    next.catch(() => undefined),
  );
}

function scheduleGoldSync(teamId: TeamId, gold: number, delay = GOLD_DEBOUNCE_MS): void {
  const prev = goldTimers.get(teamId);
  if (prev) clearTimeout(prev);
  goldTimers.set(
    teamId,
    setTimeout(() => {
      goldTimers.delete(teamId);
      enqueueGoldPush(teamId, gold);
    }, delay),
  );
}

// ─────────────────────────────────────────────
// حفظ التقدم والأحداث (debounce مجمّع)
// ─────────────────────────────────────────────

async function flushProgress(): Promise<void> {
  const s = session;
  if (!s || !pendingState) return;
  const stateToSave = pendingState;
  const eventsToSave = accumulatedEvents;
  setStatus('syncing');
  // نضمّن خريطة groupId داخل لقطة الحالة حتى يستعيد الاستئناف الربط الكامل
  const stateWithLink = { ...stateToSave, linkGroupIds: s.groupIdByTeamId } as GameState & {
    linkGroupIds: Record<TeamId, number>;
  };
  const ok = await provider.saveSave(s.classKey, s.week, stateWithLink, eventsToSave);
  setStatus(ok ? 'synced' : 'error');
  if (!ok && session) {
    // فشل: أعد الجدولة بنفس البيانات المعلّقة
    if (progressTimer) clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      progressTimer = null;
      void flushProgress();
    }, PROGRESS_DEBOUNCE_MS * 4);
  }
}

function scheduleProgressSync(state: GameState, events: GameEvent[]): void {
  pendingState = state;
  accumulatedEvents = [...accumulatedEvents, ...events];
  // حد أقصى معقول لسجل الأحداث المرفوع حتى لا يتضخم الحفظ السحابي
  if (accumulatedEvents.length > 1000) {
    accumulatedEvents = accumulatedEvents.slice(-1000);
  }
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = setTimeout(() => {
    progressTimer = null;
    void flushProgress();
  }, PROGRESS_DEBOUNCE_MS);
}

// ─────────────────────────────────────────────
// نقطة الاستدعاء الوحيدة من المتجر (بعد كل commit)
// ─────────────────────────────────────────────

/**
 * يُستدعى من store.commit بعد كل تغيير حالة: يرفع ذهب الفرق المتغيّرة
 * ويجدول حفظ التقدم/الأحداث. لا يفعل شيئًا في الوضع المحلي أو التوتوريال.
 */
export function notifyLinkedCommit(state: GameState, events: GameEvent[]): void {
  const s = session;
  if (!s) return;
  if (state.phase === 'title' || state.phase === 'tutorial') return;
  for (const team of state.teams) {
    const groupId = s.groupIdByTeamId[team.id];
    if (typeof groupId !== 'number') continue;
    const total = teamTotalGold(state, team.id);
    if (lastPushedGold.get(team.id) !== total && !goldTimers.has(team.id)) {
      scheduleGoldSync(team.id, total);
    } else if (lastPushedGold.get(team.id) !== total) {
      scheduleGoldSync(team.id, total); // أحدث قيمة تفوز
    }
  }
  scheduleProgressSync(state, events);
}

/** دفع فوري (بلا debounce) — يُستخدم عند بدء موسم مرتبط جديد لتثبيت الدرجات */
export async function flushLinkedNow(state: GameState): Promise<void> {
  const s = session;
  if (!s) return;
  for (const team of state.teams) {
    const groupId = s.groupIdByTeamId[team.id];
    if (typeof groupId !== 'number') continue;
    const total = teamTotalGold(state, team.id);
    const ok = await provider.pushGroupGold(s.classKey, groupId, s.week, total);
    if (ok) {
      // لا يُسجَّل «آخر قيمة مرفوعة» إلا بعد نجاح فعلي — وإلا بقيت القاعدة
      // على القيمة القديمة بينما يظن المحرك أنها رُفعت فلا يعيد الرفع أبدًا
      lastPushedGold.set(team.id, total);
    } else {
      console.warn(`[link] فشل التثبيت الأولي لذهب ${team.id} = ${total} — إعادة جدولة`);
      setStatus('error');
      scheduleGoldSync(team.id, total, GOLD_DEBOUNCE_MS * 4);
    }
  }
  pendingState = state;
  accumulatedEvents = [];
  await flushProgress();
}

/** استخراج خريطة groupId من لقطة محمّلة سحابيًا (إن وُجدت) */
export function extractLinkGroupIds(state: GameState): Record<TeamId, number> | null {
  const extra = (state as GameState & { linkGroupIds?: Record<TeamId, number> }).linkGroupIds;
  return extra && typeof extra === 'object' ? extra : null;
}

/** إزالة الحقول الإضافية من لقطة سحابية قبل حقنها في المحرك */
export function stripLinkExtras(state: GameState): GameState {
  const clone = { ...state } as GameState & { linkGroupIds?: unknown };
  delete clone.linkGroupIds;
  return clone;
}

// ─────────────────────────────────────────────
// استطلاع القاعدة ← اللعبة (درجات المعلم تنعكس مباشرة)
// ─────────────────────────────────────────────
//
// أثناء موسم مرتبط يجري استطلاع كل GOLD_POLL_INTERVAL_MS: تُقرأ درجات
// الأسبوع المرتبط، وأي مجموعة تختلف درجتها عن «آخر قيمة معروفة»
// (ما رفعناه بنجاح أو طبّقناه خارجيًا) تُطبَّق فروقاتها داخل اللعبة عبر
// ردّ نداء يسجّله المتجر (applyTeacherAdjustment — احتفال/جزاء مرئي).
//
// منع الارتداد بثلاثة حراس:
// 1) القيمة المساوية لآخر قيمة معروفة تُتجاهل (هي غالبًا ما رفعناه للتو).
// 2) فريق عليه رفع مجدول (debounce) أو جارٍ الآن يُتخطى في هذه الدورة.
// 3) قراءة بدأت قبل/أثناء نشاط كتابة حديث للفريق (ضمن POLL_WRITE_GUARD_MS)
//    قد تكون قديمة (سباق قراءة/كتابة) فتُتخطى لهذه الدورة.
// والمتجر يستدعي markTeamGoldKnown قبل/بعد تطبيق الفرق حتى لا يُعاد رفع
// التحديث الخارجي كأنه تغيّر داخلي.

/** رد نداء تطبيق درجة خارجية: (teamId، الإجمالي الجديد في القاعدة) */
type ExternalGoldApplier = (teamId: TeamId, remoteTotal: number) => void;

let externalGoldApplier: ExternalGoldApplier | null = null;
let activityGate: (() => boolean) | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;

/** المتجر يسجّل من يطبّق فروقات الدرجات الخارجية داخل اللعبة */
export function onExternalGoldChange(fn: ExternalGoldApplier | null): void {
  externalGoldApplier = fn;
}

/**
 * بوابة نشاط الاستطلاع: المتجر يعيد false خارج اللعب الفعلي
 * (شاشة العنوان/التوتوريال/شاشة الفوز) فيتوقف الاستطلاع عمليًا.
 */
export function setLinkActivityGate(fn: (() => boolean) | null): void {
  activityGate = fn;
}

/**
 * تثبيت «آخر قيمة معروفة» لفريق دون رفع — يستدعيه المتجر قبل/بعد تطبيق
 * تعديل خارجي حتى لا يرتدّ كرفع داخلي، ويلغي أي رفع مجدول بقيمة أقدم.
 */
export function markTeamGoldKnown(teamId: TeamId, gold: number): void {
  const pending = goldTimers.get(teamId);
  if (pending) {
    clearTimeout(pending);
    goldTimers.delete(teamId);
  }
  lastPushedGold.set(teamId, gold);
}

function startGoldPolling(): void {
  stopGoldPolling();
  if (typeof setInterval === 'undefined') return;
  pollTimer = setInterval(() => {
    void pollRemoteScores();
  }, GOLD_POLL_INTERVAL_MS);
}

function stopGoldPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  pollInFlight = false;
}

/** دورة استطلاع واحدة: قراءة درجات الأسبوع وتطبيق الفروقات الخارجية */
async function pollRemoteScores(): Promise<void> {
  const s = session;
  if (!s || pollInFlight) return;
  if (activityGate && !activityGate()) return; // عنوان/توتوريال/فوز/وضع محلي
  pollInFlight = true;
  const fetchStart = Date.now();
  try {
    const scores = await provider.groupScores(s.classKey, s.week);
    if (session !== s) return; // الجلسة أُنهيت/تبدّلت أثناء الجلب
    for (const teamId of Object.keys(s.groupIdByTeamId) as TeamId[]) {
      const groupId = s.groupIdByTeamId[teamId];
      const remote = scores[groupId];
      if (typeof remote !== 'number') continue;
      if (lastPushedGold.get(teamId) === remote) continue; // لا تغيّر خارجي
      if (goldTimers.has(teamId) || goldInFlight.has(teamId)) continue; // رفع جارٍ — لا ندهسه
      const wroteAt = lastGoldWriteAt.get(teamId) ?? 0;
      if (wroteAt >= fetchStart || Date.now() - wroteAt < POLL_WRITE_GUARD_MS) continue; // سباق قراءة/كتابة
      // تغيّر خارجي موثوق: ثبّت القيمة المعروفة ثم طبّق الفرق داخل اللعبة
      markTeamGoldKnown(teamId, remote);
      externalGoldApplier?.(teamId, remote);
    }
  } finally {
    pollInFlight = false;
  }
}
