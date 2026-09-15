/**
 * متجر المحرك (zustand) — يطبّق GameEngineApi كاملًا من العقود المجمّدة.
 * - يستدعي دوال المنطق النقية من src/engine/logic ويخزّن النتائج.
 * - يدير الطور (GamePhase) والعدادات الزمنية (سؤال/تصرف) مع بثّ tick للواجهة.
 * - طابور أحداث (event queue) تستهلكه الواجهة/المشهد مع ack/clear.
 * - حفظ تلقائي محلي بعد كل حدث (مفتاح qalaa-almamlaka:game-save).
 * - التوتوريال معزول: لقطة تُحفظ قبل الدخول وتُستعاد كاملة عند الخروج،
 *   ولا يتم أي حفظ محلي أثناءه حتى لا يُلوَّث الحفظ الحقيقي.
 */
import { create } from 'zustand';
import type {
  ArmyComposition,
  ArmyTarget,
  CatapultTarget,
  GameEvent,
  GamePhase,
  GameSettings,
  GameState,
  Question,
  TeamAdjustment,
  TeamId,
} from '@/contracts/types';
import type { GameEngineApi } from '@/contracts/engine-api';
import type { SyncStatus } from '@/contracts/storage';
import { DEFAULT_CATAPULT, DEFAULT_CATAPULT_POWER } from '@/contracts/defaults';
import { createRng, type RNG } from './rng';
import { createInitialState, finiteOr, getTeam } from './logic/state';
import { startTurn as logicStartTurn, resolveAnswer, endTurn as logicEndTurn } from './logic/rounds';
import { buildFloor as logicBuildFloor, repairFloor as logicRepairFloor } from './logic/castle';
import { recruitSoldier as logicRecruitSoldier } from './logic/soldiers';
import { canUseCatapult, fireCatapult as logicFireCatapult, normalizeCatapultPower } from './logic/catapult';
import { dispatchArmy as logicDispatchArmy } from './logic/combat';
import { declareWinner as logicDeclareWinner, resetGame as logicResetGame, setQuestionBank as logicSetQuestionBank, updateSettings as logicUpdateSettings } from './logic/season';
import { applyTeacherAdjustment as logicTeacherAdjustment } from './logic/teacher';
import { buildQuestionView } from './logic/questions';
import { createTutorialState, TUTORIAL_STEPS } from './tutorial-script';
import { getActiveProvider, getSyncStatus } from './storage/sync-manager';
import type { LocalStorageProvider } from './storage/local-provider';
import { SupabaseProvider, type GroupDef } from './storage/supabase-provider';
import {
  clearLinkSession,
  extractLinkGroupIds,
  extractLinkSheetBase,
  flushLinkedNow,
  getLinkSession,
  getLinkStatus,
  notifyLinkedCommit,
  onExternalGoldChange,
  onLinkStatusChange,
  restoreLinkSession,
  setLinkActivityGate,
  setLinkSession,
  stripLinkExtras,
  type LinkSession,
} from './link-session';

/** مزوّد Supabase لعمليات المواسم المرتبطة (تحميل/مسح الحفظ السحابي) */
const linkedProvider = new SupabaseProvider();

// مؤشر المزامنة يتبع جلسة الربط فعليًا: برتقالي أثناء الرفع، أخضر متزامن، أحمر عند الفشل
onLinkStatusChange((s) => {
  useGameStore.setState({ syncStatus: s });
});

// استطلاع القاعدة ← اللعبة ودمج الاستئناف: فرق ذهب خارجي (من الكشف) يدخل
// اللعبة مباشرة كمنحة/جزاء مرئي (applyTeacherAdjustment). link-session
// يثبّت sheetBase عبر markTeamGoldKnown قبل استدعاء هذا الرد، فيمرّ
// الالتزام الناتج دون أن يُعاد رفعه كتغيّر داخلي (منع ارتداد).
onExternalGoldChange((teamId, delta) => {
  const data = useGameStore.getState();
  if (data.tutorialActive) return;
  if (['title', 'tutorial', 'victory'].includes(data.state.phase)) return;
  const gold = Math.round(delta);
  if (gold !== 0) {
    engineApi.applyTeacherAdjustment(teamId, { gold });
  }
});

// الاستطلاع يتوقف عمليًا خارج اللعب الفعلي (عنوان/توتوريال/فوز)
setLinkActivityGate(() => {
  const data = useGameStore.getState();
  if (data.tutorialActive) return false;
  return !['title', 'tutorial', 'victory'].includes(data.state.phase);
});

/** مولّد العشوائية الوحيد للمحرك (يُزرع في الاختبارات عبر setEngineSeed) */
let rng: RNG = createRng();

/** لاختبارات قابلة للتكرار: زرع المولّد */
export function setEngineSeed(seed: number): void {
  rng = createRng(seed);
}

/** عرض السؤال الجاري (خيارات مخلوطة) — يُبنى عند عرض السؤال */
export interface QuestionView {
  questionId: string;
  options: string[];
  correctIndex: number;
}

/** العداد الزمني الجاري (يبث tick للواجهة) */
export interface TimerState {
  kind: 'question' | 'action';
  remaining: number; // ثوانٍ
  total: number;
}

interface GameStoreData {
  state: GameState;
  /** طابور الأحداث المتراكمة — تستهلكه الواجهة/المشهد ثم تؤكده */
  eventQueue: GameEvent[];
  questionView: QuestionView | null;
  timer: TimerState | null;
  /** طور ما قبل فتح الإعدادات/الكاميرا الحرة (لاستعادته) */
  phaseBeforeOverlay: GamePhase | null;
  /** توتوريال */
  tutorialActive: boolean;
  tutorialStepIndex: number;
  tutorialSnapshot: GameState | null;
  /** إشارة تخطي الأنيميشن (تتزايد مع كل ضغطة «تخطي») */
  skipSignal: number;
  syncStatus: SyncStatus;
}

const initialData = (): GameStoreData => ({
  // اللعبة تقلع على شاشة العنوان (مدير الشاشات في App.tsx يقرأ phase)
  state: { ...createInitialState(), phase: 'title' },
  eventQueue: [],
  questionView: null,
  timer: null,
  phaseBeforeOverlay: null,
  tutorialActive: false,
  tutorialStepIndex: 0,
  tutorialSnapshot: null,
  skipSignal: 0,
  syncStatus: getSyncStatus(),
});

export const useGameStore = create<GameStoreData>(() => initialData());

// ─────────────────────────────────────────────
// أدوات داخلية
// ─────────────────────────────────────────────

function provider(): LocalStorageProvider {
  return getActiveProvider() as LocalStorageProvider;
}

/** حفظ تلقائي محلي بعد كل حدث + إلحاق الأحداث بالمجلد */
function persist(state: GameState, events: GameEvent[]): void {
  if (useGameStore.getState().tutorialActive) return; // العزلة الكاملة للتوتوريال
  // شاشة العنوان: لا جلسة نشطة — حفظ الحالة هنا سيمسح حفظ الموسم الحقيقي
  // (مثال: كتم الصوت من العنوان ينادي updateSettings). الإعدادات تبقى في
  // الذاكرة وتنتقل للموسم الجديد عبر newSeason/resetGame.
  if (state.phase === 'title') return;
  const p = provider();
  // في الموسم المرتبط نضمّن خريطة groupId وsheetBase في الحفظ المحلي أيضًا
  // لاستعادة الجلسة ونموذج «القاعدة + الفرق» بعد إعادة التحميل
  const sess = getLinkSession();
  const toSave = sess
    ? ({
        ...state,
        linkGroupIds: sess.groupIdByTeamId,
        linkSheetBaseByTeamId: { ...(sess.sheetBaseByTeamId ?? {}) },
      } as GameState)
    : state;
  void p.saveGame(toSave).catch(() => undefined);
  for (const ev of events) void p.appendEvent(ev).catch(() => undefined);
}

/** تطبيق نتيجة منطق نقي: حالة جديدة + أحداث للطابور + حفظ */
function commit(result: { state: GameState; events: GameEvent[] }, extra: Partial<GameStoreData> = {}): GameEvent[] {
  const prev = useGameStore.getState();
  useGameStore.setState({
    state: result.state,
    eventQueue: [...prev.eventQueue, ...result.events],
    ...extra,
  });
  persist(result.state, result.events);
  // مزامنة الموسم المرتبط: ذهب الفرق → marks، والتقدم/الأحداث → qalaa_saves
  if (!useGameStore.getState().tutorialActive) notifyLinkedCommit(result.state, result.events);
  return result.events;
}

/** هل العدادات متوقفة حاليًا؟ (إعدادات / كاميرا حرة / توتوريال / حدث)
 *  ملاحظة: طورا المنجنيق والجيش وضعان فرعيان لجولة التصرف — العداد يستمر فيهما. */
function timersPaused(data: GameStoreData): boolean {
  if (data.tutorialActive) return true;
  return ['settings', 'freeCamera', 'tutorial', 'event', 'title', 'victory'].includes(data.state.phase);
}

/**
 * إنهاء الجولة من أي طور: يخرج أولًا من الأوضاع الفرعية المفتوحة
 * (منجنيق/جيش — الإلغاء بلا خصم) ثم يطبّق endTurn المعتاد (phase !== 'action' ⇒ noChange).
 */
function endTurnFromAnyPhase(): { state: GameState; events: GameEvent[] } {
  let st = useGameStore.getState().state;
  if (st.phase === 'catapult' || st.phase === 'army') st = { ...st, phase: 'action' };
  return logicEndTurn(st);
}

function startTimer(kind: TimerState['kind'], seconds: number): void {
  useGameStore.setState({ timer: { kind, remaining: seconds, total: seconds } });
}

function stopTimer(): void {
  useGameStore.setState({ timer: null });
}

/** بدء عداد مناسب بعد دخول طور ما */
function armTimerForPhase(state: GameState): void {
  if (state.phase === 'question' && state.settings.round.questionTimerEnabled) {
    startTimer('question', state.settings.round.questionTimeSeconds);
  } else if (state.phase === 'action') {
    startTimer('action', state.settings.round.actionTurnSeconds);
  } else {
    stopTimer();
  }
}

// حلقة العداد (تتوقف فورًا عند الإعدادات/الكاميرا الحرة/التوتوريال)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const data = useGameStore.getState();
    if (!data.timer || timersPaused(data)) return;
    const remaining = Math.max(0, data.timer.remaining - 0.25);
    useGameStore.setState({ timer: { ...data.timer, remaining } });
    if (remaining <= 0) {
      // انتهى الوقت: السؤال بلا إجابة = خطأ، جولة التصرف تنتهي
      if (data.timer.kind === 'question') {
        const res = resolveAnswer(data.state, false, rng);
        commit(res, { questionView: null });
        stopTimer();
      } else {
        // انتهاء عداد التصرف: تنظيف أي وضع فرعي مفتوح (منجنيق/جيش) ثم إنهاء الجولة
        const res = endTurnFromAnyPhase();
        commit(res);
        stopTimer();
      }
    }
  }, 250);
}

// ─────────────────────────────────────────────
// تنفيذ GameEngineApi
// ─────────────────────────────────────────────

export const engineApi: GameEngineApi = {
  // ── دورة الموسم ──

  newSeason() {
    const prev = useGameStore.getState().state;
    // موسم جديد مع الإبقاء على الإعدادات وبنك الأسئلة إن وُجدا
    const result = logicResetGame(prev, rng);
    stopTimer();
    clearEvents();
    return commit(result, { questionView: null });
  },

  resumeSeason() {
    const saved = provider().loadGameSync();
    if (!saved) return null;
    stopTimer();
    const restored = normalizeLoadedState(stripLinkExtras(saved));
    // إن كان الموسم المحفوظ مرتبطًا بالنظام التعليمي نستعيد جلسته ونكمل المزامنة.
    // sheetBase يُستعاد من الحفظ أولًا ثم من الجلسة المخزّنة محليًا.
    const linkIds = extractLinkGroupIds(saved);
    const storedSession = restoreLinkSession();
    if (linkIds && storedSession) {
      setLinkSession({
        ...storedSession,
        groupIdByTeamId: linkIds,
        sheetBaseByTeamId: extractLinkSheetBase(saved) ?? storedSession.sheetBaseByTeamId,
      });
    }
    const nextState = { ...restored, phase: restored.phase === 'title' ? 'idle' : restored.phase };
    useGameStore.setState({
      state: nextState,
      eventQueue: [],
      questionView: null,
      timer: null,
    });
    // دمج «القاعدة + الفرق» قبل أي رفع حتى لا تُدهس إضافات المعلم في الكشف
    if (getLinkSession()) void flushLinkedNow(nextState);
    return [];
  },

  hasSavedSeason() {
    return provider().loadGameSync() !== null;
  },

  resetGame() {
    const result = logicResetGame(useGameStore.getState().state, rng);
    stopTimer();
    clearEvents();
    // التصفير يمسح الحفظ القديم ثم يحفظ الحالة الأولية الجديدة
    void provider().clearGame().catch(() => undefined);
    return commit(result, { questionView: null });
  },

  declareWinner() {
    stopTimer();
    return commit(logicDeclareWinner(useGameStore.getState().state, rng));
  },

  // ── تسلسل الجولة ──

  startTurn() {
    const data = useGameStore.getState();
    if (data.tutorialActive) return [];
    const result = logicStartTurn(data.state, rng);
    // بناء عرض السؤال المخلوط إن ظهر سؤال ونمط الأسئلة اختياري
    let questionView: QuestionView | null = null;
    const qid = result.state.currentQuestionId;
    if (qid && result.state.settings.round.questionMode === 'mcq') {
      const q = result.state.questionBank.find((x) => x.id === qid);
      if (q) questionView = { questionId: q.id, ...buildQuestionView(q, rng) };
    }
    const events = commit(result, { questionView });
    armTimerForPhase(result.state);
    return events;
  },

  submitAnswer(choiceIndex: number) {
    const data = useGameStore.getState();
    if (data.state.phase !== 'question') return [];
    const correct = data.questionView ? choiceIndex === data.questionView.correctIndex : false;
    const result = resolveAnswer(data.state, correct, rng);
    const events = commit(result, { questionView: null });
    armTimerForPhase(result.state);
    return events;
  },

  judgeOralAnswer(correct: boolean) {
    const data = useGameStore.getState();
    const result = resolveAnswer(data.state, correct, rng);
    const events = commit(result, { questionView: null });
    armTimerForPhase(result.state);
    return events;
  },

  endTurnEarly() {
    // يعمل أثناء الأوضاع الفرعية أيضًا: يُلغي منجنيقًا/جيشًا مفتوحًا بلا خصم ثم ينهي الجولة
    const result = endTurnFromAnyPhase();
    stopTimer();
    return commit(result, { questionView: null });
  },

  // ── أفعال التصرف الحر ──

  buildFloor() {
    const data = useGameStore.getState();
    const team = data.state.teams[data.state.turnIndex];
    return commit(logicBuildFloor(data.state, team.id, rng));
  },

  repairFloor(floorId: string, stonesToSpend: number) {
    const data = useGameStore.getState();
    const team = data.state.teams[data.state.turnIndex];
    return commit(logicRepairFloor(data.state, team.id, floorId, stonesToSpend, rng));
  },

  recruitSoldier() {
    const data = useGameStore.getState();
    const team = data.state.teams[data.state.turnIndex];
    return commit(logicRecruitSoldier(data.state, team.id, rng));
  },

  // ── المنجنيق ──

  enterCatapultMode() {
    const data = useGameStore.getState();
    if (data.state.phase !== 'action') return;
    const team = data.state.teams[data.state.turnIndex];
    if (!canUseCatapult(data.state, team.id)) return;
    setPhase('catapult');
  },

  cancelCatapult() {
    if (useGameStore.getState().state.phase === 'catapult') setPhase('action');
  },

  fireCatapult(target: CatapultTarget, power: number) {
    const data = useGameStore.getState();
    if (data.state.phase !== 'catapult') return [];
    const team = data.state.teams[data.state.turnIndex];
    const result = logicFireCatapult(data.state, team.id, target, power, rng);
    // بعد الإطلاق نعود لطور التصرف (الكاميرا تلاحق الحجر ثم تقرير الضرر — واجهة)
    const events = commit(result);
    if (result.events.length > 0) setPhase('action');
    return events;
  },

  getCatapultPower(teamId: TeamId) {
    const s = useGameStore.getState().state;
    const v = s.catapultPowerByTeam?.[teamId];
    return typeof v === 'number' ? v : DEFAULT_CATAPULT_POWER;
  },

  setCatapultPower(teamId: TeamId, power: number) {
    const data = useGameStore.getState();
    const next: GameState = {
      ...data.state,
      catapultPowerByTeam: {
        ...(data.state.catapultPowerByTeam ?? {}),
        [teamId]: normalizeCatapultPower(power),
      },
    };
    useGameStore.setState({ state: next });
    persist(next, []);
  },

  // ── الجيش ──

  enterArmyMode() {
    if (useGameStore.getState().state.phase === 'action') setPhase('army');
  },

  cancelArmy() {
    if (useGameStore.getState().state.phase === 'army') setPhase('action');
  },

  dispatchArmy(target: ArmyTarget, composition: ArmyComposition) {
    const data = useGameStore.getState();
    const team = data.state.teams[data.state.turnIndex];
    const result = logicDispatchArmy(data.state, team.id, target, composition, rng);
    const events = commit(result);
    if (result.events.length > 0 && data.state.phase === 'army') setPhase('action');
    return events;
  },

  // ── الإعدادات والمعلم ──

  updateSettings(patch: Partial<GameSettings>) {
    return commit(logicUpdateSettings(useGameStore.getState().state, patch, rng));
  },

  setQuestionBank(questions: Question[]) {
    const result = logicSetQuestionBank(useGameStore.getState().state, questions, rng);
    const events = commit(result);
    void provider().saveQuestions(questions).catch(() => undefined);
    return events;
  },

  applyTeacherAdjustment(teamId: TeamId, delta: TeamAdjustment) {
    return commit(logicTeacherAdjustment(useGameStore.getState().state, teamId, delta, rng));
  },

  // ── الأوضاع العامة ──

  openSettings() {
    const data = useGameStore.getState();
    if (data.state.phase === 'settings') return;
    useGameStore.setState({ phaseBeforeOverlay: data.state.phase });
    setPhase('settings'); // توقف العدادات فورًا (timersPaused)
  },

  closeSettings() {
    const data = useGameStore.getState();
    const back = data.phaseBeforeOverlay ?? 'idle';
    useGameStore.setState({ phaseBeforeOverlay: null });
    setPhase(back);
  },

  enterFreeCamera() {
    // إصلاح دمج: لا تمس phaseBeforeOverlay — تحتفظ بطور ما قبل الإعدادات
    // حتى يعيد closeSettings اللاعب إلى حيث كان (وليس إلى حلقة إعدادات مفرغة).
    setPhase('freeCamera');
  },

  exitFreeCamera() {
    setPhase('settings');
  },

  startTutorial() {
    const data = useGameStore.getState();
    if (data.tutorialActive) return;
    stopTimer();
    // نسخة معزولة تمامًا — اللقطة الحقيقية تُحفظ في الذاكرة وتُستعاد عند الخروج
    const sandbox = createTutorialState(rng);
    sandbox.phase = 'tutorial';
    useGameStore.setState({
      tutorialActive: true,
      tutorialStepIndex: 0,
      tutorialSnapshot: data.state,
      state: sandbox,
      questionView: null,
      timer: null,
    });
  },

  endTutorial() {
    const data = useGameStore.getState();
    if (!data.tutorialActive) return;
    const restored = data.tutorialSnapshot ?? createInitialState();
    restored.phase = restored.phase === 'tutorial' ? 'idle' : restored.phase;
    useGameStore.setState({
      tutorialActive: false,
      tutorialStepIndex: 0,
      tutorialSnapshot: null,
      state: restored,
      questionView: null,
      timer: null,
    });
  },

  skipEvent() {
    useGameStore.setState((d) => ({ skipSignal: d.skipSignal + 1 }));
  },

  // ── قراءة الحالة ──

  getState(): Readonly<GameState> {
    return useGameStore.getState().state;
  },
};

/** تغيير الطور داخل الحالة (إجراء داخلي) */
function setPhase(phase: GamePhase): void {
  const data = useGameStore.getState();
  useGameStore.setState({ state: { ...data.state, phase } });
}

/**
 * تطبيع حالة محمّلة من حفظ قديم/سحابي: الحقول التي أُضيفت لاحقًا
 * (catapultPowerByTeam، مقابض المنجنيق الجديدة) تُملأ بالافتراضيات
 * دون تغيير schemaVersion.
 *
 * حراس الفساد/NaN (بلاغ «الشاشة البنية» عند بدء/استئناف موسم مرتبط):
 * JSON يحوّل NaN إلى null فيُرجع الحفظ السحابي حقولًا غير مهيأة، وأي NaN
 * يتسرب إلى موارد فريق/فهرس دور/بنية قلعة يسمّم حسابات المشهد والكاميرا
 * بلا استثناء. نعقّم هنا: القوائم، فهرس الدور، موارد كل فريق، وبنية قلعته.
 */
export function normalizeLoadedState(saved: GameState): GameState {
  const s = structuredClone(saved);
  if (!Array.isArray(s.teams)) s.teams = [];
  if (!Array.isArray(s.convoys)) s.convoys = [];
  if (!Array.isArray(s.piles)) s.piles = [];
  if (!Array.isArray(s.log)) s.log = [];
  s.catapultPowerByTeam = s.catapultPowerByTeam ?? {};
  // فهرس دور خارج النطاق (حفظ موسم بعدد فرق مختلف) ⇒ teams[turnIndex] غير
  // معرّف في مسارات الكاميرا/الواجهة — نثبّته ضمن الفرق الموجودة
  s.turnIndex = s.teams.length
    ? Math.min(s.teams.length - 1, Math.max(0, Math.round(finiteOr(s.turnIndex, 0))))
    : 0;
  for (const t of s.teams) {
    t.goldInside = Math.max(0, Math.round(finiteOr(t.goldInside, 0)));
    t.goldOutside = Math.max(0, Math.round(finiteOr(t.goldOutside, 0)));
    t.stonesOutside = Math.max(0, Math.round(finiteOr(t.stonesOutside, 0)));
    if (!Array.isArray(t.soldiers)) t.soldiers = [];
    if (!t.castle || typeof t.castle !== 'object') {
      t.castle = {
        floors: [],
        baseHp: s.settings.combat.floorHp,
        baseMaxHp: s.settings.combat.floorHp,
        catapultReady: true,
      };
    } else {
      if (!Array.isArray(t.castle.floors)) t.castle.floors = [];
      t.castle.baseMaxHp = Math.max(1, Math.round(finiteOr(t.castle.baseMaxHp, s.settings.combat.floorHp)));
      t.castle.baseHp = Math.min(t.castle.baseMaxHp, Math.max(0, Math.round(finiteOr(t.castle.baseHp, t.castle.baseMaxHp))));
    }
    if (typeof s.catapultPowerByTeam[t.id] !== 'number') {
      s.catapultPowerByTeam[t.id] = DEFAULT_CATAPULT_POWER;
    }
  }
  s.settings = {
    ...s.settings,
    catapult: { ...DEFAULT_CATAPULT, ...s.settings.catapult },
  };
  return s;
}

// ─────────────────────────────────────────────
// طابور الأحداث (ack/clear) + التوتوريال + أدوات قراءة
// ─────────────────────────────────────────────

/** تأكيد استهلاك أحداث حتى معرّف معيّن (شاملًا إياه) */
export function ackEvents(upToEventId: string): void {
  const data = useGameStore.getState();
  const idx = data.eventQueue.findIndex((e) => e.id === upToEventId);
  if (idx < 0) return;
  useGameStore.setState({ eventQueue: data.eventQueue.slice(idx + 1) });
}

/** مسح طابور الأحداث كاملًا */
export function clearEvents(): void {
  useGameStore.setState({ eventQueue: [] });
}

/**
 * العودة لشاشة العنوان (من شاشة الفوز أو أي وضع) — إجراء دمج لمدير الشاشات.
 * يوقف العدادات ويمسح الطابور ويضبط الطور 'title'؛ الحفظ المحلي يبقى كما هو
 * (زر «استئناف الموسم» في شاشة العنوان يسترجعه).
 */
export function returnToTitle(): void {
  stopTimer();
  useGameStore.setState({
    state: { ...useGameStore.getState().state, phase: 'title' },
    eventQueue: [],
    questionView: null,
    phaseBeforeOverlay: null,
  });
}

/** الانتقال لخطوة التوتوريال التالية: ينفّذ محاكاتها على الحالة المعزولة */
export function tutorialNext(): GameEvent[] {
  const data = useGameStore.getState();
  if (!data.tutorialActive) return [];
  const nextIndex = data.tutorialStepIndex + 1;
  if (nextIndex >= TUTORIAL_STEPS.length) {
    engineApi.endTutorial();
    return [];
  }
  const step = TUTORIAL_STEPS[nextIndex];
  if (step.simulate) {
    const result = step.simulate(data.state, rng);
    useGameStore.setState({
      state: { ...result.state, phase: 'tutorial' },
      tutorialStepIndex: nextIndex,
      eventQueue: [...data.eventQueue, ...result.events],
      // لا persist — عزلة كاملة عن الحفظ الحقيقي
    });
    return result.events;
  }
  useGameStore.setState({ tutorialStepIndex: nextIndex });
  return [];
}

/** الخطوة الحالية من سيناريو التوتوريال */
export function currentTutorialStep() {
  const data = useGameStore.getState();
  return data.tutorialActive ? TUTORIAL_STEPS[data.tutorialStepIndex] : null;
}

/** معلومات الفريق الحالي (للواجهة) */
export function currentTeamId(): TeamId {
  const s = useGameStore.getState().state;
  return s.teams[s.turnIndex]?.id ?? '';
}

/** هل الفريق الحالي يملك حجرًا للمنجنيق؟ */
export function canFireCatapultNow(): boolean {
  const s = useGameStore.getState().state;
  const team = s.teams[s.turnIndex];
  return team ? canUseCatapult(s, team.id) : false;
}

/** آخر قوة إطلاق محفوظة للمجموعة (0–100) — اختصار مباشر خارج engineApi */
export function getCatapultPowerForTeam(teamId: TeamId): number {
  return engineApi.getCatapultPower(teamId);
}

/** حفظ قوة المقبض/الإيماء للمجموعة (0–100) دون إطلاق — اختصار مباشر */
export function setCatapultPowerForTeam(teamId: TeamId, power: number): void {
  engineApi.setCatapultPower(teamId, power);
}

/** إعادة ضبط حالة المزامنة المعروضة (تُستدعى بعد حفظ إعدادات السحابة) */
export function refreshSyncStatus(): void {
  // جلسة مرتبطة نشطة لها الأولوية (حالتها الحية من link-session)
  useGameStore.setState({ syncStatus: getLinkSession() ? getLinkStatus() : getSyncStatus() });
}

// ─────────────────────────────────────────────
// المواسم المرتبطة بالنظام التعليمي (صف + أسبوع)
// ─────────────────────────────────────────────

/**
 * بدء موسم مرتبط جديد: عدد الفرق = عدد مجموعات الصف (2–6)، أسماء الفرق
 * «المجموعة <name>»، ذهب البداية = درجة الأسبوع لكل مجموعة، وكل فريق
 * يُربط بـ groupId لمزامنة الذهب اللحظية. يمسح أي جلسة مرتبطة سابقة.
 */
export function startLinkedSeason(
  classKey: string,
  week: number,
  defs: GroupDef[],
  scores: Record<number, number>,
): void {
  const usable = defs.slice(0, 6);
  if (usable.length < 2) return; // لا موسم مرتبط بأقل من مجموعتين
  const prev = useGameStore.getState().state;
  const settings: GameSettings = {
    ...prev.settings,
    general: { ...prev.settings.general, teamCount: usable.length },
  };
  const s = createInitialState(settings, prev.questionBank);
  const groupIdByTeamId: Record<TeamId, number> = {};
  usable.forEach((d, i) => {
    const t = s.teams[i];
    t.name = `المجموعة ${d.name}`;
    // ذهب البداية = درجة الأسبوع — مع حارس NaN: درجة فاسدة/غير مهيأة من
    // القاعدة كانت تتسلل (Math.max(0, NaN) = NaN) فتسمّم حسابات الذهب والمشهد
    t.goldInside = Math.max(0, Math.round(finiteOr(scores[d.id], 0)));
    groupIdByTeamId[t.id] = d.id;
  });
  s.phase = 'idle';
  pushLogLinked(s, `موسم مرتبط: الصف ${classKey} — الأسبوع ${week}`);
  setLinkSession({ classKey, week, groupIdByTeamId });
  stopTimer();
  clearEvents();
  commit({ state: s, events: [] }, { questionView: null });
  // تثبيت فوري: رفع الدرجات الابتدائية + أول حفظ سحابي لهذا (صف، أسبوع)
  void flushLinkedNow(s);
}

function pushLogLinked(state: GameState, text: string): void {
  state.log.push({
    id: `log-${state.log.length + 1}-${Date.now().toString(36)}`,
    at: Date.now(),
    roundNumber: state.roundNumber,
    text,
  });
}

/** هل يوجد حفظ سحابي لهذا (صف، أسبوع)؟ */
export async function hasLinkedSave(classKey: string, week: number): Promise<boolean> {
  return (await linkedProvider.loadSave(classKey, week)) !== null;
}

/**
 * استئناف موسم مرتبط محفوظ سحابيًا: يحمّل الحالة + سجل الأحداث من
 * qalaa_saves ويعيد تفعيل الجلسة. يعيد false إن لم يوجد حفظ.
 */
export async function resumeLinkedSeason(classKey: string, week: number): Promise<boolean> {
  const save = await linkedProvider.loadSave(classKey, week);
  if (!save) return false;
  const linkIds = extractLinkGroupIds(save.state) ?? {};
  const sheetBase = extractLinkSheetBase(save.state) ?? undefined;
  const state = normalizeLoadedState(stripLinkExtras(save.state));
  state.phase = state.phase === 'title' ? 'idle' : state.phase;
  stopTimer();
  setLinkSession({
    classKey,
    week,
    groupIdByTeamId: linkIds,
    sheetBaseByTeamId: sheetBase,
  });
  useGameStore.setState({
    state,
    eventQueue: [],
    questionView: null,
    timer: null,
  });
  persist(state, []);
  // دمج «القاعدة + الفرق»: قراءة الكشف أولًا، تطبيق فرق المعلم على كل فريق،
  // ثم رفع الإجمالي المدموج — قبل أن يدهس أي رفع لاحق إضافات ما قبل الدخول
  void flushLinkedNow(state);
  return true;
}

/** بدء موسم مرتبط من جديد: يمسح الحفظ السحابي لهذا (صف، أسبوع) فقط ثم يبدأ */
export async function resetLinkedSeason(
  classKey: string,
  week: number,
  defs: GroupDef[],
  scores: Record<number, number>,
): Promise<void> {
  await linkedProvider.deleteSave(classKey, week); // مسح هذا الأسبوع فقط
  startLinkedSeason(classKey, week, defs, scores);
}

/** إنهاء الجلسة المرتبطة الحالية والعودة للوضع المحلي */
export function unlinkSeason(): void {
  clearLinkSession();
  refreshSyncStatus();
}

/** معلومات الجلسة المرتبطة الحالية (للواجهة) */
export function currentLinkSession(): LinkSession | null {
  return getLinkSession();
}

// getTeam مُعاد تصديره لتسهيل استهلاك الواجهة
export { getTeam };
