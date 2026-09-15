/**
 * اختبارات نموذج «القاعدة + الفرق» (sheetBase + delta) — بلاغ: نقاط أضافها
 * المعلم في كشف marks قبل دخول اللعبة كانت تُمحى عند الاستئناف لكل المجموعات
 * عدا الأولى (سباق توقيت)، لأن flushLinkedNow كان يدفع إجمالي الحفظ القديم
 * دون قراءة الكشف أولًا ويسجّله كـ lastPushedGold فيتجاهله الاستطلاع.
 *
 * - استئناف مع زيادة خارجية لثلاث مجموعات: كل الفرق تستلم فرقها ويُرفع
 *   الإجمالي المدموج (نقاط المعلم + فرق اللعبة) للكشف.
 * - استئناف بلا تغيّر خارجي: لا كتابة زائدة ولا تغيّر ذهب.
 * - حفظ قديم بلا sheetBase: الكشف يفوز (delta=0) دون محو فرق غير موجود.
 * - استطلاع مع فرق داخلي معلّق (debounce): لا يُفقد الفرق الداخلي.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  useGameStore,
  engineApi,
  setEngineSeed,
  startLinkedSeason,
  resumeLinkedSeason,
  unlinkSeason,
  currentLinkSession,
} from '../store';
import { createInitialState } from '../logic/state';
import { teamTotalGold } from '../logic/season';
import type { GameState, TeamId } from '@/contracts/types';

const fetchMock = vi.fn();

/** درجات الأسبوع المرتبط كما ترجعها القاعدة (groupId → ذهب) */
let remoteScores: Record<number, number> = {};
/** صف الحفظ السحابي الذي ترجعه qalaa_saves (أو null = لا حفظ) */
let savedRow: { state: unknown; events: unknown[]; updated_at: string } | null = null;

function freshStore(): void {
  engineApi.endTutorial();
  useGameStore.setState({
    state: { ...createInitialState(), phase: 'title' },
    eventQueue: [],
    questionView: null,
    timer: null,
    tutorialActive: false,
    tutorialStepIndex: 0,
    tutorialSnapshot: null,
  });
}

/** upsertات marks فقط (لا حفظ qalaa_saves) */
function markPosts(): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter((c) => (c[1] as RequestInit)?.method === 'POST' && String(c[0]).includes('/marks'))
    .map((c) => JSON.parse((c[1] as RequestInit).body as string) as Record<string, unknown>);
}

/** ترك سلاسل وعود fetch/الدمج تكتمل (بلا مؤقتات في مسار النجاح) */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(50);
}

/** حالة حفظ سحابي لثلاث مجموعات مع إضافات الربط (groupIds وربما sheetBase) */
function buildSavedState(sheetBase: Record<TeamId, number> | null): GameState {
  const s = createInitialState({ general: { teamCount: 3 } } as never);
  s.phase = 'idle';
  s.teams[0].goldInside = 100;
  s.teams[1].goldInside = 60;
  s.teams[2].goldInside = 20;
  return {
    ...s,
    linkGroupIds: { 'team-1': 1, 'team-2': 2, 'team-3': 3 },
    ...(sheetBase ? { linkSheetBaseByTeamId: sheetBase } : {}),
  } as GameState;
}

beforeEach(() => {
  vi.useFakeTimers();
  setEngineSeed(1);
  remoteScores = {};
  savedRow = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') return { ok: true, json: async () => [] };
    if (u.includes('qalaa_saves')) return { ok: true, json: async () => (savedRow ? [savedRow] : []) };
    if (u.includes('/marks')) {
      const rows = Object.entries(remoteScores).map(([gid, v]) => ({
        class_key: `grp:_test:${gid}`,
        value: String(v),
      }));
      return { ok: true, json: async () => rows };
    }
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  freshStore();
});

afterEach(() => {
  unlinkSeason();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('استئناف موسم مرتبط — نموذج «القاعدة + الفرق»', () => {
  it('زيادة خارجية لثلاث مجموعات: كل الفرق تستلم فرقها ويُرفع الإجمالي المدموج', async () => {
    // حفظ سحابي: الإجمالي 100/60/20، القاعدة 90/50/10 ⇒ فرق لعبة معلّق +10 لكل فريق
    savedRow = {
      state: buildSavedState({ 'team-1': 90, 'team-2': 50, 'team-3': 10 }),
      events: [],
      updated_at: null as unknown as string,
    };
    // المعلم أضاف قبل الدخول: +30 للأولى، +25 للثانية، +25 للثالثة (فوق القاعدة)
    remoteScores = { 1: 120, 2: 75, 3: 35 };

    const ok = await resumeLinkedSeason('_test', 5);
    expect(ok).toBe(true);
    fetchMock.mockClear(); // تجاهل قراءات التحميل — نراقب الكتابات فقط
    await settle();

    // كل الفرق (لا الأول فقط) استلمت فرق معلمها: الإجمالي = R + فرق اللعبة
    const s = engineApi.getState();
    expect(teamTotalGold(s, 'team-1')).toBe(130); // 120 + 10
    expect(teamTotalGold(s, 'team-2')).toBe(85); // 75 + 10
    expect(teamTotalGold(s, 'team-3')).toBe(45); // 35 + 10

    // منح مرئية لكل فريق بمقدار فرق المعلم
    const grants = useGameStore.getState().eventQueue.filter((e) => e.type === 'teacher-grant');
    expect(grants.map((e) => [e.teamId, (e as { delta: { gold?: number } }).delta.gold])).toEqual([
      ['team-1', 30],
      ['team-2', 25],
      ['team-3', 25],
    ]);

    // الإجمالي المدموج رُفع للكشف لكل مجموعة (نقاط المعلم لم تُدهس)
    const bodies = markPosts();
    expect(bodies).toHaveLength(3);
    expect(bodies).toContainEqual(expect.objectContaining({ class_key: 'grp:_test:1', value: '130' }));
    expect(bodies).toContainEqual(expect.objectContaining({ class_key: 'grp:_test:2', value: '85' }));
    expect(bodies).toContainEqual(expect.objectContaining({ class_key: 'grp:_test:3', value: '45' }));

    // sheetBase حُدّث وخُزّن في الجلسة (استمرارية نموذج القاعدة + الفرق)
    expect(currentLinkSession()?.sheetBaseByTeamId).toEqual({
      'team-1': 130,
      'team-2': 85,
      'team-3': 45,
    });
  });

  it('استئناف بلا تغيّر خارجي: لا كتابة زائدة ولا تغيّر ذهب', async () => {
    // الإجمالي = القاعدة = الكشف — لا فرق معلّم ولا فرق لعبة
    savedRow = {
      state: buildSavedState({ 'team-1': 100, 'team-2': 60, 'team-3': 20 }),
      events: [],
      updated_at: null as unknown as string,
    };
    remoteScores = { 1: 100, 2: 60, 3: 20 };

    await resumeLinkedSeason('_test', 5);
    fetchMock.mockClear();
    await settle();

    const s = engineApi.getState();
    expect(teamTotalGold(s, 'team-1')).toBe(100);
    expect(teamTotalGold(s, 'team-2')).toBe(60);
    expect(teamTotalGold(s, 'team-3')).toBe(20);
    expect(markPosts()).toHaveLength(0); // الكشف يعكس الإجمالي أصلًا — لا upsert
    const adjustments = useGameStore
      .getState()
      .eventQueue.filter((e) => e.type === 'teacher-grant' || e.type === 'teacher-penalty');
    expect(adjustments).toHaveLength(0);
  });

  it('حفظ قديم بلا sheetBase: الكشف يفوز (delta=0) دون اختراع فرق', async () => {
    // حفظ بصيغة قديمة: linkGroupIds فقط بلا linkSheetBaseByTeamId
    savedRow = {
      state: buildSavedState(null),
      events: [],
      updated_at: null as unknown as string,
    };
    remoteScores = { 1: 130, 2: 60, 3: 5 };

    await resumeLinkedSeason('_test', 5);
    fetchMock.mockClear();
    await settle();

    // الإجمالي يصبح = درجة الكشف لكل مجموعة (الكشف يفوز)
    const s = engineApi.getState();
    expect(teamTotalGold(s, 'team-1')).toBe(130);
    expect(teamTotalGold(s, 'team-2')).toBe(60);
    expect(teamTotalGold(s, 'team-3')).toBe(5);
    // المدموج = الكشف أصلًا: لا كتابة زائدة، لكن القاعدة تُثبَّت للاستطلاع
    expect(markPosts()).toHaveLength(0);
    expect(currentLinkSession()?.sheetBaseByTeamId).toEqual({
      'team-1': 130,
      'team-2': 60,
      'team-3': 5,
    });
  });
});

describe('الاستطلاع — الفرق يُقاس من sheetBase', () => {
  it('فرق داخلي معلّق (debounce) لا يُفقد عند ورود فرق خارجي', async () => {
    // موسم مرتبط مستقر: القاعدة = الكشف = الإجمالي
    startLinkedSeason(
      '_test',
      5,
      [
        { id: 1, name: 'أ' },
        { id: 2, name: 'ب' },
        { id: 3, name: 'ج' },
      ],
      { 1: 100, 2: 60, 3: 20 },
    );
    remoteScores = { 1: 100, 2: 60, 3: 20 };
    await vi.advanceTimersByTimeAsync(3000); // تثبيت أولي
    fetchMock.mockClear();

    // فرق داخلي +10 للفريق الأول (رفع مجدول بـ debounce)
    engineApi.applyTeacherAdjustment('team-1', { gold: 10 });
    expect(teamTotalGold(engineApi.getState(), 'team-1')).toBe(110);
    // المعلم يضيف +30 في الكشف قبل أن يكتمل الـ debounce
    remoteScores = { ...remoteScores, 1: 130 };

    // t=800ms: يُرفع الفرق الداخلي (110). t=5000ms: استطلاع — لكنه داخل
    // نافذة حارس الكتابة (POLL_WRITE_GUARD_MS) فيُتخطى الفريق دون دهس شيء.
    await vi.advanceTimersByTimeAsync(5000);
    expect(teamTotalGold(engineApi.getState(), 'team-1')).toBe(110); // الداخلي محفوظ
    // t=10000ms: استطلاع خارج النافذة — الفرق الخارجي يُقاس من القاعدة
    // (130 − 110 = 20) لا من إجمالي اللعبة، فينضاف فوق الداخلي بلا فقدان.
    await vi.advanceTimersByTimeAsync(5000);
    expect(teamTotalGold(engineApi.getState(), 'team-1')).toBe(130); // 100 + 10 + 30

    // رُفع 110 (الداخلي) ولم يُرفع 130 مرتدًا بعد تطبيق الفرق الخارجي
    const bodies = markPosts();
    expect(bodies).toContainEqual(expect.objectContaining({ class_key: 'grp:_test:1', value: '110' }));
    expect(bodies.some((b) => b.value === '130')).toBe(false);
    // ولم يُدهس الكشف بقيمة قديمة (100) في أي لحظة
    expect(bodies.some((b) => b.class_key === 'grp:_test:1' && b.value === '100')).toBe(false);
  });
});
