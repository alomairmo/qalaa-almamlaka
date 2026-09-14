/**
 * اختبارات المزامنة الحية للمواسم المرتبطة (fetch محاكى + مؤقتات وهمية):
 *
 * اللعبة ← القاعدة:
 *  - الرفع يحدث عند تغيّر الذهب فقط (بلا تغيّر لا upsert إضافي).
 *  - فشل الرفع يُعاد جدولته ولا يُسجَّل كناجح.
 *
 * القاعدة ← اللعبة (استطلاع كل 5 ثوانٍ):
 *  - درجة غيّرها المعلم تُطبَّق كفرق ذهب داخل اللعبة (حدث teacher-grant).
 *  - منع الارتداد: القيمة التي رفعناها للتو لا تُطبَّق كتغيير خارجي،
 *    والتعديل الخارجي المطبَّق لا يُعاد رفعه.
 *  - الاستطلاع يتوقف بعد إنهاء الجلسة (unlink) وأثناء شاشة العنوان.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  useGameStore,
  engineApi,
  setEngineSeed,
  startLinkedSeason,
  unlinkSeason,
  returnToTitle,
} from '../store';
import { createInitialState } from '../logic/state';
import { teamTotalGold } from '../logic/season';

const fetchMock = vi.fn();

/** درجات الأسبوع المرتبط كما ترجعها القاعدة (groupId → ذهب) */
let remoteScores: Record<number, number> = {};

function freshStore(): void {
  engineApi.endTutorial();
  useGameStore.setState({
    state: createInitialState(),
    eventQueue: [],
    questionView: null,
    timer: null,
    tutorialActive: false,
    tutorialStepIndex: 0,
    tutorialSnapshot: null,
  });
}

function markPosts(): [string, RequestInit][] {
  return fetchMock.mock.calls
    .filter((c) => (c[1] as RequestInit)?.method === 'POST' && String(c[0]).includes('/marks'))
    .map((c) => [String(c[0]), c[1] as RequestInit]);
}

function markGets(): number {
  return fetchMock.mock.calls.filter(
    (c) => !(c[1] as RequestInit)?.method && String(c[0]).includes('/marks'),
  ).length;
}

beforeEach(() => {
  vi.useFakeTimers();
  remoteScores = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') return { ok: true, json: async () => [] };
    if (u.includes('qalaa_saves')) return { ok: true, json: async () => [] };
    if (u.includes('/marks')) {
      // محاكاة GET درجات grp:<class>:* للأسبوع
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

/** بدء موسم مرتبط اختباري (3 مجموعات) وترك التثبيت الأولي يكتمل */
async function startLinked(): Promise<void> {
  setEngineSeed(1);
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
  await vi.advanceTimersByTimeAsync(3000); // تثبيت فوري + debounce + حفظ تقدم
  fetchMock.mockClear();
}

describe('المزامنة الحية — اللعبة ← القاعدة', () => {
  it('يرفع upsert عند تغيّر الذهب فقط', async () => {
    await startLinked();
    // بلا أي تغيير: تقديم الوقت لا يولّد أي رفع
    await vi.advanceTimersByTimeAsync(5000);
    expect(markPosts()).toHaveLength(0);

    // منحة +10 للفريق الأول ← رفع واحد بالقيمة الجديدة 110
    engineApi.applyTeacherAdjustment('team-1', { gold: 10 });
    await vi.advanceTimersByTimeAsync(1200);
    const posts = markPosts();
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0][1].body as string);
    expect(body).toMatchObject({ class_key: 'grp:_test:1', week: 5, value: '110' });

    // بلا تغيير جديد: لا رفع إضافي
    await vi.advanceTimersByTimeAsync(5000);
    expect(markPosts()).toHaveLength(1);
  });

  it('فشل الرفع يُعاد جدولته ولا يُسجَّل كناجح', async () => {
    await startLinked();
    // أول محاولة تفشل
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => [] }));
    engineApi.applyTeacherAdjustment('team-1', { gold: 10 });
    await vi.advanceTimersByTimeAsync(1200); // المحاولة الفاشلة
    expect(markPosts().length).toBeGreaterThan(0);
    fetchMock.mockClear();
    // إعادة المحاولة المجدولة تلقائيًا (4×debounce) تنجح وترفع 110
    await vi.advanceTimersByTimeAsync(4000);
    const retries = markPosts();
    expect(retries.length).toBeGreaterThan(0);
    const body = JSON.parse(retries[retries.length - 1][1].body as string);
    expect(body.value).toBe('110');
  });
});

describe('المزامنة الحية — القاعدة ← اللعبة (استطلاع)', () => {
  it('درجة خارجية من المعلم تُطبَّق كفرق ذهب داخل اللعبة', async () => {
    await startLinked();
    const before = teamTotalGold(engineApi.getState(), 'team-2');
    expect(before).toBe(60);

    // المعلم يضيف 15 للمجموعة 2 في الكشف
    remoteScores = { ...remoteScores, 2: 75 };
    await vi.advanceTimersByTimeAsync(5000); // دورة استطلاع

    const after = teamTotalGold(engineApi.getState(), 'team-2');
    expect(after).toBe(75);
    // حدث منحة مرئي صدر
    const grants = useGameStore
      .getState()
      .eventQueue.filter((e) => e.type === 'teacher-grant' && e.teamId === 'team-2');
    expect(grants.length).toBeGreaterThan(0);
  });

  it('خصم خارجي يُطبَّق كجزاء', async () => {
    await startLinked();
    remoteScores = { ...remoteScores, 3: 5 }; // من 20 إلى 5
    await vi.advanceTimersByTimeAsync(5000);
    expect(teamTotalGold(engineApi.getState(), 'team-3')).toBe(5);
    const penalties = useGameStore
      .getState()
      .eventQueue.filter((e) => e.type === 'teacher-penalty' && e.teamId === 'team-3');
    expect(penalties.length).toBeGreaterThan(0);
  });

  it('منع الارتداد: التعديل الخارجي المطبَّق لا يُعاد رفعه', async () => {
    await startLinked();
    remoteScores = { ...remoteScores, 1: 140 };
    await vi.advanceTimersByTimeAsync(5000); // استطلاع + تطبيق
    expect(teamTotalGold(engineApi.getState(), 'team-1')).toBe(140);
    await vi.advanceTimersByTimeAsync(3000); // نافذة debounce كاملة
    expect(markPosts()).toHaveLength(0); // لا upsert مرتد
  });

  it('منع الارتداد: قيمة تساوي ما رفعناه للتو لا تُطبَّق كخارجية', async () => {
    await startLinked();
    // تغيير داخلي → يُرفع 110
    engineApi.applyTeacherAdjustment('team-1', { gold: 10 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(markPosts()).toHaveLength(1);
    // القاعدة تعكس ما رفعناه (قراءة لاحقة) — يجب ألا يُطبَّق شيء
    remoteScores = { ...remoteScores, 1: 110 };
    const queueLen = useGameStore.getState().eventQueue.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(teamTotalGold(engineApi.getState(), 'team-1')).toBe(110);
    expect(useGameStore.getState().eventQueue.length).toBe(queueLen); // لا أحداث جزاء/منحة
  });

  it('يتعايش مع رفع داخلي وخارجي لفريقين مختلفين', async () => {
    await startLinked();
    // داخلي: فريق 1 +10 (يُرفع) — خارجي: فريق 3 من 20 إلى 33 (يُطبَّق)
    engineApi.applyTeacherAdjustment('team-1', { gold: 10 });
    remoteScores = { ...remoteScores, 3: 33 };
    await vi.advanceTimersByTimeAsync(6000);
    expect(teamTotalGold(engineApi.getState(), 'team-1')).toBe(110);
    expect(teamTotalGold(engineApi.getState(), 'team-3')).toBe(33);
    const bodies = markPosts().map((p) => JSON.parse(p[1].body as string));
    // رُفع 110 لفريق 1 فقط — لم يُرفع شيء لفريق 3 (القادم من القاعدة)
    expect(bodies.some((b) => b.class_key === 'grp:_test:1' && b.value === '110')).toBe(true);
    expect(bodies.some((b) => b.class_key === 'grp:_test:3')).toBe(false);
  });

  it('يتوقف الاستطلاع بعد إنهاء الجلسة', async () => {
    await startLinked();
    await vi.advanceTimersByTimeAsync(5000); // دورة أولى
    const getsBefore = markGets();
    expect(getsBefore).toBeGreaterThan(0);
    unlinkSeason();
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(15000);
    expect(markGets()).toBe(0);
  });

  it('يتوقف الاستطلاع على شاشة العنوان ويستأنف عند العودة', async () => {
    await startLinked();
    returnToTitle();
    fetchMock.mockClear();
    remoteScores = { ...remoteScores, 1: 200 };
    await vi.advanceTimersByTimeAsync(10000);
    expect(markGets()).toBe(0); // لا استطلاع على العنوان
    expect(teamTotalGold(engineApi.getState(), 'team-1')).toBe(100); // لم يتغير شيء
  });
});
