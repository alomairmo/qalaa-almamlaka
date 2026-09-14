/**
 * اختبارات الجولات والأسئلة والعدل والشفاء — §12، §13، §15، §17، §18.
 */
import { describe, expect, it } from 'vitest';
import { startTurn, resolveAnswer, endTurn } from '../logic/rounds';
import { parseQuestionBank, pickQuestionForTeam, buildQuestionView } from '../logic/questions';
import { dispatchArmy } from '../logic/combat';
import { declareWinner, resetGame, updateSettings } from '../logic/season';
import { applyTeacherAdjustment } from '../logic/teacher';
import { cloneState, getTeam } from '../logic/state';
import { makeState, addSoldier, give, scriptedRng } from './helpers';
import type { Question } from '@/contracts/types';

describe('الجولات — §12', () => {
  it('عجلة الأدوار الثابتة ورفع رقم الجولة بعد دورة كاملة', () => {
    let s = makeState();
    expect(s.turnIndex).toBe(0);
    s.phase = 'action';
    s = endTurn(s).state;
    expect(s.turnIndex).toBe(1);
    expect(s.roundNumber).toBe(1);
    s = { ...endTurn({ ...s, phase: 'action' }).state, phase: 'action' };
    s = { ...endTurn(s).state, phase: 'action' };
    s = endTurn(s).state; // نهاية المجموعة الرابعة
    expect(s.turnIndex).toBe(0);
    expect(s.roundNumber).toBe(2); // اكتملت الدورة
  });

  it('الإجابة الصحيحة تكسب 10 ذهب + 5 حجارة وتفتح طور التصرف', () => {
    const s = makeState();
    const started = startTurn(s, scriptedRng()); // بنك فارغ ← طور تصرف مباشر
    expect(started.state.phase).toBe('action');
    // أعد للسؤال لاختبار resolveAnswer
    const q = { ...started.state, phase: 'question' as const, currentQuestionId: 'q-x' };
    const res = resolveAnswer(q, true, scriptedRng());
    expect(res.state.phase).toBe('action');
    expect(getTeam(res.state, 'team-1').goldInside).toBe(10);
    expect(getTeam(res.state, 'team-1').stonesOutside).toBe(5);
    expect(res.events.map((e) => e.type)).toEqual(['correct-answer', 'resources-gained']);
  });

  it('الإجابة الخاطئة تنهي الجولة فورًا', () => {
    const s = makeState();
    const q = { ...cloneState(s), phase: 'question' as const, currentQuestionId: 'q-x' };
    const res = resolveAnswer(q, false, scriptedRng());
    expect(res.state.phase).toBe('idle');
    expect(res.state.turnIndex).toBe(1); // انتقل الدور
    expect(res.events[0].type).toBe('wrong-answer');
  });
});

describe('الأسئلة — §13', () => {
  it('تحليل البنك النصي: كل 4 أسطر = سؤال', () => {
    const text = 'ما ناتج 2+2؟\n4\n3\n5\nعاصمة مصر؟\nالقاهرة\nجدة\nدبي\nسؤال ناقص\nصحيح';
    const qs = parseQuestionBank(text, scriptedRng());
    expect(qs).toHaveLength(2); // السؤال الناقص يُتجاهل
    expect(qs[0].correct).toBe('4');
    expect(qs[1].wrong2).toBe('دبي');
  });

  it('العدالة: لا تكرار سؤال لنفس المجموعة قبل استنفاد البنك', () => {
    const s = makeState();
    const bank: Question[] = [
      { id: 'q1', text: 'س1', correct: 'ج', wrong1: 'خ1', wrong2: 'خ2' },
      { id: 'q2', text: 'س2', correct: 'ج', wrong1: 'خ1', wrong2: 'خ2' },
    ];
    s.questionBank = bank;
    const rng = scriptedRng();
    const seen: string[] = [];
    let used: string[] = [];
    for (let i = 0; i < 5; i++) {
      const tmp = cloneState(s);
      tmp.usedQuestionsPerTeam['team-1'] = used;
      const { question, usedIds } = pickQuestionForTeam(tmp, 'team-1', rng);
      used = usedIds;
      seen.push(question!.id);
    }
    // أول سؤالين مختلفان، ثم يُعاد التدوير بعد الاستنفاد
    expect(new Set(seen.slice(0, 2)).size).toBe(2);
    expect(seen[2]).toBe('q1'); // استُنفد البنك وصُفّر السجل (ترتيب ثابت)
  });

  it('خلط الخيارات عند كل عرض مع تتبع مؤشر الصحيحة', () => {
    const q: Question = { id: 'q', text: 'س', correct: 'الصحيحة', wrong1: 'خ1', wrong2: 'خ2' };
    const view = buildQuestionView(q, scriptedRng());
    expect(view.options).toContain('الصحيحة');
    expect(view.options[view.correctIndex]).toBe('الصحيحة');
  });
});

describe('قواعد العدل — §17', () => {
  it('حماية الجولة الأولى تمنع الهجوم والقصف عند تفعيلها', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'expert', 'inside');
    give(s, 'team-1', 0, 5);
    s.settings.general.firstRoundProtection = true;
    s.roundNumber = 1;

    const attack = dispatchArmy(
      s, 'team-1', { kind: 'castle', teamId: 'team-2' },
      { novice: 0, soldier: 0, expert: 1 }, scriptedRng([7, 3]),
    );
    expect(attack.events).toHaveLength(0); // ممنوع
    expect(attack.state).toBe(s);

    // الجولة الثانية: مسموح
    const s2 = cloneState(s);
    s2.roundNumber = 2;
    addSoldier(s2, 'team-2', 'novice', 'inside');
    const attack2 = dispatchArmy(
      s2, 'team-1', { kind: 'castle', teamId: 'team-2' },
      { novice: 0, soldier: 0, expert: 1 }, scriptedRng([7, 3]),
    );
    expect(attack2.events.length).toBeGreaterThan(0);
  });

  it('إعانة إعادة الإعمار تمنع الهجوم أثناء الحماية', () => {
    const s = makeState();
    s.turnIndex = 0;
    addSoldier(s, 'team-1', 'expert', 'inside');
    s.protectionRoundsLeft['team-2'] = 1;
    const attack = dispatchArmy(
      s, 'team-1', { kind: 'castle', teamId: 'team-2' },
      { novice: 0, soldier: 0, expert: 1 }, scriptedRng([7]),
    );
    expect(attack.events).toHaveLength(0);
  });
});

describe('شفاء الجنود — §15 د-2', () => {
  it('معطّل افتراضيًا: الجروح تبقى', () => {
    const s = makeState();
    s.turnIndex = 0;
    const wounded = addSoldier(s, 'team-1', 'soldier', 'inside', 2);
    const { state } = startTurn(s, scriptedRng());
    const after = getTeam(state, 'team-1').soldiers.find((x) => x.id === wounded.id);
    expect(after?.hp).toBe(2); // بلا شفاء
  });

  it('عند التفعيل: شفاء كل جولة بالمقدار المحدد', () => {
    const s = makeState();
    s.turnIndex = 0;
    const wounded = addSoldier(s, 'team-1', 'soldier', 'inside', 2);
    s.settings.healing.enabled = true;
    s.settings.healing.inside = { enabled: true, timing: { everyTurns: 1 }, amount: { kind: 'points', points: 2 } };
    const { state, events } = startTurn(s, scriptedRng());
    const after = getTeam(state, 'team-1').soldiers.find((x) => x.id === wounded.id);
    expect(after?.hp).toBe(4);
    expect(events.some((e) => e.type === 'soldier-healed')).toBe(true);
  });
});

describe('منحة/جزاء المعلم — §15 تبويب 2', () => {
  it('المنحة تضيف بأحداث متتابعة (مال ثم جنود ثم طوابق)', () => {
    const s = makeState();
    const { state, events } = applyTeacherAdjustment(
      s, 'team-1', { gold: 5, stones: 5, soldiers: 1, floors: 1 }, scriptedRng(),
    );
    expect(events[0].type).toBe('teacher-grant');
    const team = getTeam(state, 'team-1');
    expect(team.goldInside).toBe(5);
    expect(team.stonesOutside).toBe(5);
    expect(team.soldiers).toHaveLength(1);
    expect(team.castle.floors).toHaveLength(1);
    // الترتيب: resources-gained قبل soldier-recruited قبل floor-built
    const order = events.map((e) => e.type);
    expect(order.indexOf('resources-gained')).toBeLessThan(order.indexOf('soldier-recruited'));
    expect(order.indexOf('soldier-recruited')).toBeLessThan(order.indexOf('floor-built'));
  });

  it('الجزاء يخصم ويطلق حدث قصف السماء', () => {
    const s = makeState();
    give(s, 'team-1', 8, 0);
    addSoldier(s, 'team-1', 'novice', 'inside');
    const { state, events } = applyTeacherAdjustment(s, 'team-1', { gold: -5, soldiers: -1 }, scriptedRng());
    expect(events[0].type).toBe('teacher-penalty');
    expect(getTeam(state, 'team-1').goldInside).toBe(3);
    expect(getTeam(state, 'team-1').soldiers).toHaveLength(0);
  });
});

describe('نهاية الموسم — §18', () => {
  it('declareWinner يحسب الذهب الكلي (داخل + خارج + في الطريق)', () => {
    const s = makeState();
    give(s, 'team-1', 10, 0);
    getTeam(s, 'team-1').goldOutside = 5;
    // قافلة في الطريق لـ team-1
    const convoyGold = 7;
    s.convoys.push({
      id: 'c1', teamId: 'team-1', fromTeamId: 'team-2',
      soldiers: [], goldCarried: convoyGold, progress: 0.5, position: { x: 0, y: 0, z: 0 },
    });
    give(s, 'team-2', 20, 0);
    const { state, events } = declareWinner(s, scriptedRng());
    const ev = events[0];
    expect(ev.type).toBe('victory-declared');
    if (ev.type === 'victory-declared') {
      expect(ev.totals['team-1']).toBe(22); // 10 + 5 + 7
      expect(ev.totals['team-2']).toBe(20);
      expect(ev.winnerTeamId).toBe('team-1');
    }
    expect(state.phase).toBe('victory');
  });

  it('resetGame يعيد الحالة الأولية مع الإبقاء على الإعدادات', () => {
    let s = makeState();
    give(s, 'team-1', 50, 30);
    s = updateSettings(s, { economy: { ...s.settings.economy, soldierCost: 7 } }, scriptedRng()).state;
    const { state, events } = resetGame(s, scriptedRng());
    expect(events[0].type).toBe('game-reset');
    expect(state.teams).toHaveLength(4);
    expect(state.teams.every((t) => t.goldInside === 0 && t.soldiers.length === 0)).toBe(true);
    expect(state.roundNumber).toBe(1);
    expect(state.settings.economy.soldierCost).toBe(7); // الإعدادات بقيت
  });
});

describe('النمط الشفهي مع بنك فارغ — §13.2 (B1)', () => {
  it('startTurn يدخل طور السؤال دائمًا في النمط الشفهي حتى بلا بنك', () => {
    const s = makeState();
    s.settings.round.questionMode = 'oral';
    expect(s.questionBank).toHaveLength(0);
    const started = startTurn(s, scriptedRng());
    expect(started.state.phase).toBe('question'); // لا قفز إلى طور التصرف
    expect(started.state.currentQuestionId).toBeUndefined();
    expect(started.events.map((e) => e.type)).toContain('turn-changed');
  });

  it('judgeOralAnswer(true) بعد بنك فارغ يمنح 10 ذهب + 5 حجارة وينتقل لطور التصرف', () => {
    const s = makeState();
    s.settings.round.questionMode = 'oral';
    const started = startTurn(s, scriptedRng());
    const judged = resolveAnswer(started.state, true, scriptedRng());
    expect(judged.state.phase).toBe('action');
    expect(getTeam(judged.state, 'team-1').goldInside).toBe(10);
    expect(getTeam(judged.state, 'team-1').stonesOutside).toBe(5);
    expect(judged.events.map((e) => e.type)).toEqual(['correct-answer', 'resources-gained']);
  });

  it('الحكم بالخطأ في النمط الشفهي مع بنك فارغ ينهي الجولة', () => {
    const s = makeState();
    s.settings.round.questionMode = 'oral';
    const started = startTurn(s, scriptedRng());
    const judged = resolveAnswer(started.state, false, scriptedRng());
    expect(judged.state.phase).toBe('idle');
    expect(judged.state.turnIndex).toBe(1);
    expect(getTeam(judged.state, 'team-1').goldInside).toBe(0);
  });
});
