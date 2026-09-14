/**
 * اختبارات القلعة والسعة والفيض — §3، §4 (الأثمن أولًا)، §8 (هدم وفيض فوري).
 */
import { describe, expect, it } from 'vitest';
import { depositGold, goldCapacity, regarrison, soldierCapacity } from '../logic/economy';
import { buildFloor, repairFloor } from '../logic/castle';
import { fireCatapult } from '../logic/catapult';
import { makeState, addSoldier, give, scriptedRng } from './helpers';
import { cloneState, getTeam } from '../logic/state';
import type { FloorDestroyedEvent } from '@/contracts/types';

describe('السعة والفيض — §3', () => {
  it('سعة القاعدة 10 ذهب + جنديان، وكل طابق +10/+2', () => {
    const s = makeState();
    const team = getTeam(s, 'team-1');
    expect(goldCapacity(team, s)).toBe(10);
    expect(soldierCapacity(team, s)).toBe(2);
    team.castle.floors.push({ id: 'f1', hp: 10, maxHp: 10 });
    expect(goldCapacity(team, s)).toBe(20);
    expect(soldierCapacity(team, s)).toBe(4);
  });

  it('ما زاد عن سعة الذهب يفيض لكومة خارجية مكشوفة', () => {
    const s = makeState();
    const cs = cloneState(s);
    const team = getTeam(cs, 'team-1');
    const spilled = depositGold(cs, team, 25, scriptedRng());
    expect(spilled).toBe(15);
    expect(team.goldInside).toBe(10);
    expect(team.goldOutside).toBe(15);
    const pile = cs.piles.find((p) => p.kind === 'outside' && p.ownerTeamId === 'team-1');
    expect(pile?.amount).toBe(15); // كومة مكشوفة مكتوب عليها مقدارها
  });

  it('بناء طابق يكلف 5 حجارة ويرفع السعة', () => {
    const s = makeState();
    give(s, 'team-1', 0, 5);
    const { state, events } = buildFloor(s, 'team-1', scriptedRng());
    const team = getTeam(state, 'team-1');
    expect(team.stonesOutside).toBe(0);
    expect(team.castle.floors).toHaveLength(1);
    expect(events[0].type).toBe('floor-built');
    // الفشل بلا رصيد
    const fail = buildFloor(state, 'team-1', scriptedRng());
    expect(fail.events).toHaveLength(0);
  });

  it('الإصلاح: حجر = نقطتا صحة ولا يتجاوز السقف', () => {
    const s = makeState();
    give(s, 'team-1', 0, 10);
    const built = buildFloor(s, 'team-1', scriptedRng()).state;
    getTeam(built, 'team-1').castle.floors[0].hp = 4; // نقص 6
    const { state } = repairFloor(built, 'team-1', getTeam(built, 'team-1').castle.floors[0].id, 10, scriptedRng());
    const floor = getTeam(state, 'team-1').castle.floors[0];
    expect(floor.hp).toBe(10);
    // صُرف 3 حجارة فقط (6 صحة ÷ 2) رغم طلب 10
    expect(getTeam(state, 'team-1').stonesOutside).toBe(2);
  });
});

describe('التعبئة «الأثمن يُحفظ أولًا» — §4', () => {
  it('الأعلى رتبة يدخل القلعة أولًا', () => {
    const s = makeState();
    const team = getTeam(s, 'team-1');
    team.castle.floors.push({ id: 'f1', hp: 10, maxHp: 10 }); // سعة 4
    // خبيران + 4 جنود + مبتدئان (كلهم خارجون مبدئيًا)
    addSoldier(s, 'team-1', 'novice', 'outside');
    addSoldier(s, 'team-1', 'soldier', 'outside');
    addSoldier(s, 'team-1', 'expert', 'outside');
    addSoldier(s, 'team-1', 'soldier', 'outside');
    addSoldier(s, 'team-1', 'expert', 'outside');
    addSoldier(s, 'team-1', 'soldier', 'outside');
    addSoldier(s, 'team-1', 'novice', 'outside');
    addSoldier(s, 'team-1', 'soldier', 'outside');

    regarrison(s, team);
    const inside = team.soldiers.filter((x) => x.state === 'inside');
    const outside = team.soldiers.filter((x) => x.state === 'outside');
    expect(inside.map((x) => x.rank).sort()).toEqual(['expert', 'expert', 'soldier', 'soldier']);
    expect(outside.map((x) => x.rank).sort()).toEqual(['novice', 'novice', 'soldier', 'soldier']);
  });
});

describe('هدم الطابق والفيض الفوري — §8', () => {
  it('تدمير طابق يخفض السعة ويفيض الزائد فورًا', () => {
    const s = makeState();
    s.turnIndex = 0;
    // هذا الاختبار يقيس الفيض/السعة فقط — نعطّل الارتداد حتى لا يحرق الكومة الخارجية
    s.settings.catapult.bounceEnabled = false;
    give(s, 'team-1', 0, 5); // ذخيرة المنجنيق
    const defender = getTeam(s, 'team-2');
    defender.castle.floors.push({ id: 'f-target', hp: 6, maxHp: 10 });
    defender.goldInside = 15; // سعة مع الطابق = 20
    // 4 جنود داخل (سعة 4 مع الطابق)
    addSoldier(s, 'team-2', 'expert', 'inside');
    addSoldier(s, 'team-2', 'soldier', 'inside');
    addSoldier(s, 'team-2', 'novice', 'inside');
    addSoldier(s, 'team-2', 'novice', 'inside');

    // ضرر 6 يهدم الطابق (صحته 6)
    const { state, events } = fireCatapult(
      s,
      'team-1',
      { kind: 'floor', teamId: 'team-2', floorId: 'f-target' },
      0.8,
      scriptedRng([6]),
    );

    const team = getTeam(state, 'team-2');
    expect(team.castle.floors).toHaveLength(0);
    const destroyed = events.find((e) => e.type === 'floor-destroyed') as FloorDestroyedEvent;
    expect(destroyed).toBeDefined();
    // السعة الجديدة 10 ذهب: فاض 5 للخارج
    expect(destroyed.spilledGold).toBe(5);
    expect(team.goldInside).toBe(10);
    expect(team.goldOutside).toBe(15); // 5 فاضت + 10 إعانة إعادة الإعمار (الداخل ممتلئ)
    // سعة الجنود الجديدة 2: خرج الأضعف (مبتدئان)
    expect(destroyed.spilledSoldierIds).toHaveLength(2);
    expect(team.soldiers.filter((x) => x.state === 'inside').map((x) => x.rank).sort()).toEqual(['expert', 'soldier']);
    // إعانة إعادة الإعمار انطلقت (فقد كل طوابقه) — §17.3
    expect(state.protectionRoundsLeft['team-2']).toBe(1);
    expect(team.goldInside + team.goldOutside).toBe(15 + 10); // +10 إعانة
  });

  it('القاعدة الأرضية لا تُهدم أبدًا (حد أدنى 1)', () => {
    const s = makeState();
    s.turnIndex = 0;
    give(s, 'team-1', 0, 3);
    let cur = s;
    for (let i = 0; i < 3; i++) {
      cur = fireCatapult(cur, 'team-1', { kind: 'base', teamId: 'team-2' }, 0.5, scriptedRng([6])).state;
    }
    expect(getTeam(cur, 'team-2').castle.baseHp).toBe(1);
  });
});
