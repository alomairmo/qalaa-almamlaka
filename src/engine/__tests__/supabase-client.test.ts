/**
 * اختبارات عميل Supabase REST (بمحاكاة fetch) + محلّلات grpdef/الدرجات
 * + ربط groupId بكل فريق في مزامنة الذهب (link-session).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchGroupDefs,
  fetchGroupScores,
  listLinkedClasses,
  listLinkedWeeks,
  loadCloudSave,
  parseGroupDefs,
  parseGroupIdFromKey,
  parseScore,
  upsertGroupScore,
  writeCloudSave,
} from '../storage/supabase-client';
import {
  clearLinkSession,
  getLinkSession,
  notifyLinkedCommit,
  setLinkSession,
} from '../link-session';
import { createInitialState } from '../logic/state';

/** ردّ JSON ناجح */
function okJson(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  clearLinkSession();
});

// ─────────────────────────────────────────────
// المحلّلات النقية
// ─────────────────────────────────────────────

describe('parseGroupDefs', () => {
  it('يحلّل JSON نصي إلى تعريفات مجموعات', () => {
    const value = JSON.stringify([
      { id: 1787814266137, name: '1', leader: 2, members: [1, 2, 3] },
      { id: 5, name: '2' },
    ]);
    const defs = parseGroupDefs(value);
    expect(defs).toHaveLength(2);
    expect(defs[0]).toMatchObject({ id: 1787814266137, name: '1', leader: 2 });
    expect(defs[1]).toMatchObject({ id: 5, name: '2' });
  });

  it('يرفض القيم المعطوبة بأمان', () => {
    expect(parseGroupDefs('not json')).toEqual([]);
    expect(parseGroupDefs('{"a":1}')).toEqual([]);
    expect(parseGroupDefs([{ id: 'x', name: 3 }])).toEqual([]);
    expect(parseGroupDefs(null)).toEqual([]);
  });
});

describe('parseScore', () => {
  it('يحوّل الدرجة النصية إلى رقم', () => {
    expect(parseScore('65')).toBe(65);
    expect(parseScore(20)).toBe(20);
    expect(parseScore(' 7 ')).toBe(7);
  });
  it('يعيد null لغير الرقمية', () => {
    expect(parseScore('abc')).toBeNull();
    expect(parseScore(undefined)).toBeNull();
  });
});

describe('parseGroupIdFromKey', () => {
  it('يستخرج groupId من grp:<CLASS>:<id>', () => {
    expect(parseGroupIdFromKey('grp:g4:1787814266137', 'g4')).toBe(1787814266137);
    expect(parseGroupIdFromKey('grpdef:g4', 'g4')).toBeNull();
    expect(parseGroupIdFromKey('grp:g5:3', 'g4')).toBeNull();
  });
});

// ─────────────────────────────────────────────
// طلبات REST (fetch محاكى)
// ─────────────────────────────────────────────

describe('REST client', () => {
  it('listLinkedClasses يجلب grpdef:* ويزيل البادئة', async () => {
    fetchMock.mockResolvedValue(okJson([{ class_key: 'grpdef:g4' }, { class_key: 'grpdef:g5' }]));
    const classes = await listLinkedClasses();
    expect(classes).toEqual(['g4', 'g5']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/rest/v1/marks?select=class_key&class_key=like.grpdef:*');
    expect((init.headers as Record<string, string>).apikey).toBeTruthy();
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
  });

  it('listLinkedWeeks يعيد أسابيع distinct مرتبة', async () => {
    fetchMock.mockResolvedValue(okJson([{ week: 2 }, { week: 1 }, { week: 2 }, { week: 4 }]));
    expect(await listLinkedWeeks('g4')).toEqual([1, 2, 4]);
    expect(fetchMock.mock.calls[0][0]).toContain('class_key=like.grp:g4:*');
  });

  it('fetchGroupDefs يحلّل value لصف grpdef', async () => {
    fetchMock.mockResolvedValue(
      okJson([{ value: '[{"id":11,"name":"1","leader":2,"members":[]}]' }]),
    );
    const defs = await fetchGroupDefs('g4');
    expect(defs).toEqual([{ id: 11, name: '1', leader: 2, members: [] }]);
  });

  it('fetchGroupScores يربط groupId بالدرجة', async () => {
    fetchMock.mockResolvedValue(
      okJson([
        { class_key: 'grp:g4:11', value: '20' },
        { class_key: 'grp:g4:22', value: '65' },
      ]),
    );
    const scores = await fetchGroupScores('g4', 3);
    expect(scores).toEqual({ 11: 20, 22: 65 });
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('week=eq.3');
    expect(url).toContain('student_idx=eq.0');
    expect(url).toContain('criterion_idx=eq.0');
  });

  it('upsertGroupScore يكتب POST upsert بالقيمة كنص', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const ok = await upsertGroupScore('g4', 11, 2, 42.6);
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/rest/v1/marks');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Prefer).toContain('resolution=merge-duplicates');
    expect(JSON.parse(init.body as string)).toEqual({
      class_key: 'grp:g4:11',
      week: 2,
      student_idx: 0,
      criterion_idx: 0,
      value: '43',
    });
  });

  it('writeCloudSave/loadCloudSave على qalaa_saves', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    const state = { schemaVersion: 1 } as never;
    expect(await writeCloudSave('g4', 1, state, [])).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain('/rest/v1/qalaa_saves');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      class_key: 'g4',
      week: 1,
    });

    fetchMock.mockResolvedValueOnce(
      okJson([{ state: { schemaVersion: 1 }, events: [], updated_at: '2026-01-01' }]),
    );
    const save = await loadCloudSave('g4', 1);
    expect(save?.state).toEqual({ schemaVersion: 1 });
    fetchMock.mockResolvedValueOnce(okJson([]));
    expect(await loadCloudSave('g4', 9)).toBeNull();
  });

  it('الفشل محصّن: رفض الشبكة → null/false بلا رمي', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    expect(await listLinkedClasses()).toEqual([]);
    expect(await fetchGroupDefs('g4')).toEqual([]);
    expect(await upsertGroupScore('g4', 1, 1, 5)).toBe(false);
    expect(await loadCloudSave('g4', 1)).toBeNull();
  });
});

// ─────────────────────────────────────────────
// ربط groupId بكل فريق + مزامنة الذهب
// ─────────────────────────────────────────────

describe('link-session gold sync', () => {
  it('يرفع إجمالي ذهب كل فريق إلى grp:<CLASS>:<groupId> بعد تغيّره', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: true } as Response);

    const state = createInitialState({ general: { teamCount: 2 } } as never);
    state.phase = 'action';
    const [t1, t2] = state.teams;
    setLinkSession({
      classKey: 'g4',
      week: 2,
      groupIdByTeamId: { [t1.id]: 111, [t2.id]: 222 },
    });
    expect(getLinkSession()?.groupIdByTeamId[t1.id]).toBe(111);

    t1.goldInside = 30; // تغيّر ذهب الفريق الأول
    t2.goldInside = 0;
    notifyLinkedCommit(state, []);
    await vi.advanceTimersByTimeAsync(900);

    const markCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/rest/v1/marks'),
    );
    // أول commit بعد بدء الجلسة يرفع إجمالي كل الفرق المرتبطة (تثبيت مبدئي)
    expect(markCalls.length).toBe(2);
    const bodies = markCalls.map((c) => JSON.parse(c[1].body as string));
    const t1Push = bodies.find((b) => b.class_key === 'grp:g4:111');
    expect(t1Push).toMatchObject({ week: 2, value: '30' });
    expect(bodies.find((b) => b.class_key === 'grp:g4:222')).toMatchObject({ value: '0' });

    // تغيّر جديد بعد الـ debounce يرفع ذلك الفريق فقط مرة أخرى
    t1.goldInside = 55;
    notifyLinkedCommit(state, []);
    await vi.advanceTimersByTimeAsync(900);
    const allMarks = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/rest/v1/marks'),
    );
    expect(allMarks.length).toBe(3);
    expect(JSON.parse(allMarks[2][1].body as string)).toMatchObject({
      class_key: 'grp:g4:111',
      value: '55',
    });
  });

  it('لا يرفع شيئًا في الوضع المحلي (بلا جلسة)', async () => {
    vi.useFakeTimers();
    const state = createInitialState();
    state.phase = 'action';
    state.teams[0].goldInside = 99;
    notifyLinkedCommit(state, []);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('فشل الشبكة يعيد المحاولة تلقائيًا', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('down'));
    const state = createInitialState({ general: { teamCount: 2 } } as never);
    state.phase = 'action';
    const t1 = state.teams[0];
    setLinkSession({ classKey: 'g4', week: 1, groupIdByTeamId: { [t1.id]: 111 } });
    t1.goldInside = 10;
    notifyLinkedCommit(state, []);
    await vi.advanceTimersByTimeAsync(900);
    expect(fetchMock).toHaveBeenCalled();
    const before = fetchMock.mock.calls.length;
    // بعد فشل الدفعة الأولى تُجدول إعادة محاولة (تأخير أطول)
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });
});
