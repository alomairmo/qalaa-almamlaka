/**
 * اختبارات متجر المحرك: عزل التوتوريال، طابور الأحداث، تدفق الجولة عبر engineApi.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useGameStore, engineApi, ackEvents, clearEvents, tutorialNext, setEngineSeed } from '../store';
import { TUTORIAL_STEPS } from '../tutorial-script';
import { createInitialState } from '../logic/state';

function freshStore(): void {
  clearEvents();
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

describe('متجر المحرك', () => {
  beforeEach(freshStore);

  it('تدفق جولة كامل: بدء ← إجابة صحيحة ← تصرف ← إنهاء مبكر', () => {
    setEngineSeed(42);
    // بنك فارغ: startTurn ينتقل مباشرة لطور التصرف
    const events = engineApi.startTurn();
    expect(events.some((e) => e.type === 'turn-changed')).toBe(true);
    let s = engineApi.getState();
    expect(s.phase).toBe('action');
    // عداد التصرف بدأ
    expect(useGameStore.getState().timer?.kind).toBe('action');

    // منحة ذهب ثم تجنيد عبر واجهة المتجر
    engineApi.applyTeacherAdjustment('team-1', { gold: 10 });
    const rec = engineApi.recruitSoldier();
    expect(rec.some((e) => e.type === 'soldier-recruited')).toBe(true);
    s = engineApi.getState();
    expect(s.teams[0].soldiers).toHaveLength(1);

    engineApi.endTurnEarly();
    s = engineApi.getState();
    expect(s.turnIndex).toBe(1);
    expect(useGameStore.getState().timer).toBeNull();
  });

  it('طابور الأحداث يتراكم ويُؤكد استهلاكه بـ ack/clear', () => {
    engineApi.startTurn();
    engineApi.applyTeacherAdjustment('team-1', { gold: 5 });
    const q = useGameStore.getState().eventQueue;
    expect(q.length).toBeGreaterThan(1);
    ackEvents(q[0].id);
    expect(useGameStore.getState().eventQueue.length).toBe(q.length - 1);
    clearEvents();
    expect(useGameStore.getState().eventQueue).toHaveLength(0);
  });

  it('الإعدادات توقف العدادات وتستعاد عند العودة', () => {
    engineApi.startTurn();
    expect(useGameStore.getState().timer).not.toBeNull();
    engineApi.openSettings();
    expect(engineApi.getState().phase).toBe('settings');
    engineApi.closeSettings();
    expect(engineApi.getState().phase).toBe('action');
  });

  it('التوتوريال معزول تمامًا: يُستعاد الحال كما كان عند الخروج', () => {
    setEngineSeed(7);
    engineApi.applyTeacherAdjustment('team-1', { gold: 33 });
    const before = engineApi.getState();
    const goldBefore = before.teams[0].goldInside;

    engineApi.startTutorial();
    expect(engineApi.getState().phase).toBe('tutorial');
    expect(useGameStore.getState().tutorialActive).toBe(true);

    // تنفيذ كل خطوات المحاكاة (بناء/تجنيد/منجنيق/هجمات على كل الأهداف)
    for (let i = 1; i < TUTORIAL_STEPS.length; i++) tutorialNext();
    tutorialNext(); // تجاوز آخر خطوة = خروج تلقائي
    expect(useGameStore.getState().tutorialActive).toBe(false);

    const after = engineApi.getState();
    expect(after.teams[0].goldInside).toBe(goldBefore);
    expect(after.teams).toHaveLength(before.teams.length);
    expect(after.phase).not.toBe('tutorial');
  });

  it('خطوات التوتوريال تغطي المحاكاة المطلوبة وتنتج أحداثًا', () => {
    setEngineSeed(3);
    engineApi.startTutorial();
    const allEvents: string[] = [];
    for (let i = 1; i < TUTORIAL_STEPS.length; i++) {
      for (const ev of tutorialNext()) allEvents.push(ev.type);
    }
    // بناء + تجنيد + إطلاق منجنيق + معارك/التقاطات
    expect(allEvents).toContain('resources-gained');
    expect(allEvents).toContain('floor-built');
    expect(allEvents).toContain('soldier-recruited');
    expect(allEvents).toContain('catapult-fired');
  });

  it('العداد يستمر في طور المنجنيق وانتهاؤه ينظف الوضع الفرعي وينهي الجولة', async () => {
    setEngineSeed(11);
    engineApi.startTurn(); // بنك فارغ → طور التصرف مباشرة
    expect(engineApi.getState().phase).toBe('action');
    expect(useGameStore.getState().timer?.kind).toBe('action');

    engineApi.applyTeacherAdjustment('team-1', { stones: 3 });
    engineApi.enterCatapultMode();
    expect(engineApi.getState().phase).toBe('catapult');

    // العداد لا يتوقف أثناء طور المنجنيق
    const before = useGameStore.getState().timer?.remaining ?? 0;
    await new Promise((r) => setTimeout(r, 700)); // حلقة العداد تتكتك كل 250ms
    const duringCatapult = useGameStore.getState().timer;
    expect(duringCatapult).not.toBeNull();
    expect(duringCatapult!.remaining).toBeLessThan(before);

    // اقتراب الوقت من الصفر: الانتهاء يخرج من وضع المنجنيق وينهي الجولة
    useGameStore.setState({ timer: { ...duringCatapult!, remaining: 0.3 } });
    await new Promise((r) => setTimeout(r, 900));
    const s = engineApi.getState();
    expect(s.phase).toBe('idle');
    expect(s.turnIndex).toBe(1);
    expect(useGameStore.getState().timer).toBeNull();
  });

  it('العداد يستمر في طور الجيش وانتهاؤه ينهي الجولة، وendTurnEarly يعمل من الأوضاع الفرعية', async () => {
    setEngineSeed(12);
    engineApi.startTurn();
    engineApi.enterArmyMode();
    expect(engineApi.getState().phase).toBe('army');

    // endTurnEarly من وضع الجيش: إلغاء بلا خصم + إنهاء الجولة
    engineApi.endTurnEarly();
    let s = engineApi.getState();
    expect(s.phase).toBe('idle');
    expect(s.turnIndex).toBe(1);

    // انتهاء العداد من وضع الجيش ينظف الوضع وينهي الجولة
    engineApi.startTurn();
    engineApi.enterArmyMode();
    expect(engineApi.getState().phase).toBe('army');
    const timer = useGameStore.getState().timer;
    expect(timer?.kind).toBe('action');
    useGameStore.setState({ timer: { ...timer!, remaining: 0.3 } });
    await new Promise((r) => setTimeout(r, 900));
    s = engineApi.getState();
    expect(s.phase).toBe('idle');
    expect(s.turnIndex).toBe(2);
    expect(useGameStore.getState().timer).toBeNull();
  });

  it('ذاكرة قوة المقبض لكل مجموعة: افتراضي 50، تُحفظ يدويًا وتُحدَّث عند الإطلاق', () => {
    setEngineSeed(21);
    // الافتراضي 50 لكل مجموعة
    expect(engineApi.getCatapultPower('team-1')).toBe(50);
    expect(engineApi.getCatapultPower('team-2')).toBe(50);

    // حفظ يدوي (تحريك المقبض ثم إلغاء) مع تثبيت ضمن 0–100
    engineApi.setCatapultPower('team-2', 87.6);
    expect(engineApi.getCatapultPower('team-2')).toBe(88);
    engineApi.setCatapultPower('team-2', 250);
    expect(engineApi.getCatapultPower('team-2')).toBe(100);

    // الإطلاق يحدّث الذاكرة تلقائيًا (power 0..1 ← 0–100)
    engineApi.startTurn(); // طور التصرف (بنك فارغ)
    engineApi.applyTeacherAdjustment('team-1', { stones: 2 });
    engineApi.enterCatapultMode();
    expect(engineApi.getState().phase).toBe('catapult');
    engineApi.fireCatapult({ kind: 'ground', position: { x: 0, y: 0, z: 0 } }, 0.3);
    expect(engineApi.getCatapultPower('team-1')).toBe(30);
    expect(engineApi.getState().phase).toBe('action');
    // تُحفظ داخل GameState (تُحفَظ مع اللعبة)
    expect(engineApi.getState().catapultPowerByTeam['team-1']).toBe(30);
  });

  it('نمط القوة يقبل gesture ويبقى hold افتراضيًا', () => {
    const s0 = engineApi.getState();
    expect(s0.settings.catapult.powerMode).toBe('hold');
    engineApi.updateSettings({ catapult: { ...s0.settings.catapult, powerMode: 'gesture' } });
    expect(engineApi.getState().settings.catapult.powerMode).toBe('gesture');
    // مقابض السبلاش/الارتداد موجودة بالافتراضيات
    const cs = engineApi.getState().settings.catapult;
    expect(cs.splashRadius).toBe(3.5);
    expect(cs.bounceEnabled).toBe(true);
    expect(cs.bounceDamageFactor).toBe(0.5);
    expect(cs.bounceDistance).toEqual([3, 6]);
  });
});
