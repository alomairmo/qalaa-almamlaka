/**
 * اختبارات حُرّاس NaN/الفساد في مسار الموسم المرتبط — بلاغ «الشاشة البنية»
 * عند بدء/استئناف موسم من القاعدة:
 * - startLinkedSeason: درجة فاسدة (NaN) من القاعدة كانت تتسلل عبر
 *   Math.max(0, Math.round(NaN)) = NaN إلى goldInside فتسمّم الحسابات.
 * - normalizeLoadedState: JSON يحوّل NaN إلى null، وحفظ موسم بعدد فرق مختلف
 *   يترك turnIndex خارج النطاق — كلاهما يكسر مسارات الكاميرا/الواجهة بصمت.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, setEngineSeed, startLinkedSeason, unlinkSeason, normalizeLoadedState } from '../store';
import { createInitialState, finiteOr } from '../logic/state';
import { teamTotalGold } from '../logic/season';
import type { GameState } from '@/contracts/types';

const fetchMock = vi.fn();

beforeEach(() => {
  setEngineSeed(1);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => [] }));
  vi.stubGlobal('fetch', fetchMock);
  useGameStore.setState({
    state: { ...createInitialState(), phase: 'title' },
    eventQueue: [],
    questionView: null,
    timer: null,
    tutorialActive: false,
    tutorialStepIndex: 0,
    tutorialSnapshot: null,
  });
});

afterEach(() => {
  unlinkSeason();
  vi.unstubAllGlobals();
});

describe('finiteOr — حارس الأعداد المنتهية', () => {
  it('يمرّر الأعداد المنتهية ويردّ غير المنتهية بالبديل', () => {
    expect(finiteOr(5, 0)).toBe(5);
    expect(finiteOr(-3.5, 0)).toBe(-3.5);
    expect(finiteOr(NaN, 7)).toBe(7);
    expect(finiteOr(Infinity, 7)).toBe(7);
    expect(finiteOr(null, 7)).toBe(7); // JSON يحوّل NaN إلى null
    expect(finiteOr(undefined, 7)).toBe(7);
    expect(finiteOr('12', 7)).toBe(7); // نص لا يُقبل — البديل
  });
});

describe('startLinkedSeason — حارس ذهب البداية من القاعدة', () => {
  const defs = [
    { id: 1, name: 'أ' },
    { id: 2, name: 'ب' },
    { id: 3, name: 'ج' },
  ];

  it('درجة NaN/مفقودة لا تسمّم goldInside', () => {
    // محاكاة صفّ درجات فاسد وصل عبر مسار غير متوقع (scores مفروضة نظيفة
    // عبر parseScore، لكن الحارس يحمي من أي تسرّب مستقبلي)
    const scores = { 1: NaN, 2: 42 } as unknown as Record<number, number>;
    startLinkedSeason('_guard', 3, defs, scores);
    const s = useGameStore.getState().state;
    expect(s.teams).toHaveLength(3);
    for (const t of s.teams) {
      expect(Number.isFinite(t.goldInside)).toBe(true);
      expect(t.goldInside).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(teamTotalGold(s, t.id))).toBe(true);
    }
    expect(s.teams[0].goldInside).toBe(0); // NaN ⇒ 0
    expect(s.teams[1].goldInside).toBe(42);
    expect(s.teams[2].goldInside).toBe(0); // مفقودة ⇒ 0
  });

  it('السلوك الطبيعي لم يتغير (درجات صحيحة تُقرأ كما هي)', () => {
    startLinkedSeason('_guard', 3, defs, { 1: 100, 2: 60, 3: 20 });
    const s = useGameStore.getState().state;
    expect(s.teams.map((t) => t.goldInside)).toEqual([100, 60, 20]);
    expect(s.phase).toBe('idle');
  });
});

describe('normalizeLoadedState — تعقيم الحفظ السحابي الفاسد', () => {
  it('موارد null/NaN (JSON حوّلها) تعود أصفارًا منتهية', () => {
    const saved = createInitialState() as GameState;
    const corrupt = JSON.parse(JSON.stringify(saved)) as GameState;
    corrupt.teams[0].goldInside = null as unknown as number;
    corrupt.teams[1].goldOutside = undefined as unknown as number;
    corrupt.teams[2].stonesOutside = NaN as unknown as number;
    const s = normalizeLoadedState(corrupt);
    for (const t of s.teams) {
      expect(Number.isFinite(t.goldInside)).toBe(true);
      expect(Number.isFinite(t.goldOutside)).toBe(true);
      expect(Number.isFinite(t.stonesOutside)).toBe(true);
      expect(teamTotalGold(s, t.id)).toBeGreaterThanOrEqual(0);
    }
  });

  it('turnIndex خارج النطاق (حفظ موسم بعدد فرق أكبر) يُثبَّت ضمن الفرق', () => {
    const corrupt = createInitialState();
    corrupt.turnIndex = 99;
    expect(normalizeLoadedState(corrupt).turnIndex).toBe(corrupt.teams.length - 1);
    corrupt.turnIndex = NaN;
    expect(normalizeLoadedState(corrupt).turnIndex).toBe(0);
    corrupt.turnIndex = -4;
    expect(normalizeLoadedState(corrupt).turnIndex).toBe(0);
  });

  it('بنية قلعة ناقصة/فاسدة تُستعاد بقيم صالحة', () => {
    const corrupt = createInitialState();
    corrupt.teams[0].castle = null as unknown as GameState['teams'][0]['castle'];
    corrupt.teams[1].castle.floors = null as unknown as [];
    corrupt.teams[2].castle.baseHp = NaN;
    const s = normalizeLoadedState(corrupt);
    expect(Array.isArray(s.teams[0].castle.floors)).toBe(true);
    expect(s.teams[0].castle.baseMaxHp).toBeGreaterThan(0);
    expect(Array.isArray(s.teams[1].castle.floors)).toBe(true);
    expect(Number.isFinite(s.teams[2].castle.baseHp)).toBe(true);
  });

  it('قوائم الحالة الناقصة تُستعاد وقوة المنجنيق تُملأ', () => {
    const corrupt = createInitialState() as GameState;
    corrupt.convoys = null as unknown as [];
    corrupt.piles = undefined as unknown as [];
    corrupt.catapultPowerByTeam = null as unknown as Record<string, number>;
    const s = normalizeLoadedState(corrupt);
    expect(s.convoys).toEqual([]);
    expect(s.piles).toEqual([]);
    for (const t of s.teams) {
      expect(typeof s.catapultPowerByTeam[t.id]).toBe('number');
    }
  });

  it('حالة سليمة تمر دون تغيير جوهري', () => {
    const good = createInitialState();
    good.teams[0].goldInside = 55;
    const s = normalizeLoadedState(good);
    expect(s.teams[0].goldInside).toBe(55);
    expect(s.turnIndex).toBe(0);
    expect(s.teams).toHaveLength(good.teams.length);
  });
});
