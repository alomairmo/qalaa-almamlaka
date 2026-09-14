/**
 * اختبارات حُرّاس NaN — بلاغ «الشاشة البنية»: كيان محذوف/حالة عابرة كان
 * يُنتج إحداثيات NaN تتسرب للكاميرا فتكسر مصفوفة العرض نهائيًا بلا استثناء.
 * يغطي: castlePosition بلا مجموعات، صحة مهام الكاميرا، وثبات مواقع العرض
 * مع معرّفات مفقودة/قوائم فارغة.
 */
import { describe, expect, it } from 'vitest';
import { castlePosition } from '@/engine/logic/geometry';
import { makeState } from '@/engine/__tests__/helpers';
import { castleFrameSphere, frameDistance, pileScenePosition, resolveTargetPosition } from '../layout';
import { isCameraJobSane, setCameraJob, useSceneBridge, type CameraJob } from '../bridge';

const finite = (p: { x: number; y: number; z: number }) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

describe('castlePosition — حارس القسمة على صفر', () => {
  it('teamCount=0 (حالة عابرة أثناء إعادة الضبط/الاستئناف) يرجع موقعًا منتهيًا لا NaN', () => {
    const p = castlePosition(0, 0);
    expect(finite(p)).toBe(true);
    // البديل الآمن: موقع الشمال على حلقة القلاع
    expect(p.y).toBe(0);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(0);
  });

  it('فهرس غير منتهٍ لا يسمّم النتيجة', () => {
    expect(finite(castlePosition(NaN, 4))).toBe(true);
    expect(finite(castlePosition(Infinity, 4))).toBe(true);
  });

  it('السلوك الطبيعي لم يتغير (أربع مجموعات)', () => {
    const p = castlePosition(2, 4);
    expect(finite(p)).toBe(true);
    expect(p).toEqual(castlePosition(2, 4));
  });
});

describe('isCameraJobSane — صحة مهام الكاميرا', () => {
  const ok: CameraJob = { kind: 'focus-entity', points: [{ x: 1, y: 2, z: 3 }], radius: 3, startedAt: 10, durationMs: 1200 };

  it('يقبل مهمة سليمة', () => {
    expect(isCameraJobSane(ok)).toBe(true);
  });

  it('يرفض نقطة NaN/Infinity', () => {
    expect(isCameraJobSane({ ...ok, points: [{ x: NaN, y: 2, z: 3 }] })).toBe(false);
    expect(isCameraJobSane({ ...ok, points: [{ x: 1, y: Infinity, z: 3 }] })).toBe(false);
  });

  it('يرفض نقاطًا فارغة ونصف قطر/مدة غير صالحة', () => {
    expect(isCameraJobSane({ ...ok, points: [] })).toBe(false);
    expect(isCameraJobSane({ ...ok, radius: NaN })).toBe(false);
    expect(isCameraJobSane({ ...ok, radius: 0 })).toBe(false);
    expect(isCameraJobSane({ ...ok, durationMs: 0 })).toBe(false);
  });
});

describe('setCameraJob — لا يقبل المهام المسمومة', () => {
  it('يتجاهل مهمة بإحداثيات NaN ولا يغيّر حالة الجسر', () => {
    setCameraJob(null);
    const before = useSceneBridge.getState().cameraJob;
    setCameraJob({ kind: 'focus-entity', points: [{ x: NaN, y: 0, z: 0 }], startedAt: 1, durationMs: 1000 });
    expect(useSceneBridge.getState().cameraJob).toBe(before);
  });

  it('يقبل مهمة سليمة ويخزّنها', () => {
    const job: CameraJob = { kind: 'focus', points: [{ x: 5, y: 0, z: 5 }], startedAt: 1, durationMs: 1000 };
    setCameraJob(job);
    expect(useSceneBridge.getState().cameraJob).toBe(job);
    setCameraJob(null);
  });
});

describe('مواقع العرض مع معرّفات مفقودة/قوائم فارغة', () => {
  it('castleFrameSphere بفرق فارغة لا يُنتج NaN', () => {
    const s = makeState();
    s.teams = [];
    const f = castleFrameSphere(s, 'ghost-team');
    expect(finite(f.center)).toBe(true);
    expect(Number.isFinite(f.radius)).toBe(true);
    expect(f.radius).toBeGreaterThan(0);
  });

  it('frameDistance بنصف قطر كرة التأطير المحروس يبقى منتهيًا', () => {
    const s = makeState();
    s.teams = [];
    const f = castleFrameSphere(s, 'ghost');
    expect(Number.isFinite(frameDistance(f.radius, 40, 16 / 9))).toBe(true);
  });

  it('pileScenePosition لكومة outside بلا مالك معروف ترجع موضعًا منتهيًا', () => {
    const s = makeState();
    const p = pileScenePosition(s, { kind: 'outside', ownerTeamId: 'missing', position: { x: 1, y: 0, z: 1 } });
    expect(finite(p)).toBe(true);
  });

  it('resolveTargetPosition لأهداف محذوفة من الحالة يرجع بدائل منتهية', () => {
    const s = makeState();
    for (const target of [
      { kind: 'gold-pile', pileId: 'gone' },
      { kind: 'convoy', convoyId: 'gone', soldierId: 'gone' },
      { kind: 'soldier', teamId: 'team-1', soldierId: 'gone' },
      { kind: 'floor', teamId: 'team-1', floorId: 'gone' },
      { kind: 'castle', teamId: 'ghost' },
    ] as const) {
      expect(finite(resolveTargetPosition(s, target))).toBe(true);
    }
  });
});
