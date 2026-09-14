/**
 * الجولة التعريفية (التوتوريال) — §14.
 * سيناريو محاكاة معزول تمامًا: يعمل على نسخة sandbox منفصلة من الحالة،
 * ولا يلمس الأرصدة الحقيقية إطلاقًا (المتجر يحفظ لقطة ويعيدها عند الخروج).
 * كل خطوة: فقاعة عربية + محاكاة اختيارية تنفذ على الحالة المعزولة
 * وتنتج أحداثًا تعرضها الواجهة/المشهد كأي أحداث حقيقية.
 */
import type { GameEvent, GameState, Soldier } from '@/contracts/types';
import { createInitialState, makeId } from './logic/state';
import { syncOutsidePile } from './logic/economy';
import { castlePosition, lerpVec3 } from './logic/geometry';
import { resolveAnswer } from './logic/rounds';
import { buildFloor } from './logic/castle';
import { recruitSoldier } from './logic/soldiers';
import { fireCatapult } from './logic/catapult';
import { dispatchArmy } from './logic/combat';
import type { RNG } from './rng';

export interface TutorialStep {
  id: string;
  /** نص الفقاعة الإرشادية (عربي) */
  bubble: string;
  /** مفتاح العنصر المُضاء (للواجهة): زر جانبي / عنصر خريطة */
  highlight?: string;
  /** محاكاة تُنفذ عند الوصول لهذه الخطوة (تُرجع حالة sandbox جديدة + أحداثها) */
  simulate?: (state: GameState, rng: RNG) => { state: GameState; events: GameEvent[] };
}

/**
 * حالة sandbox ابتدائية مُعَدّة بعناية لتغطية كل أنواع الأهداف:
 * قلعة عدو عليها طابق وجنود داخل/خارج وذهب خارجي، قافلة عدو عائدة،
 * وكومة ذهب ساقطة على الطريق.
 */
export function createTutorialState(rng: RNG): GameState {
  const s = createInitialState();
  const [t1, t2, t3] = s.teams;

  // المجموعة الأولى (نجمة العرض): رصيد كافٍ للتجربة
  t1.goldInside = 30;
  t1.stonesOutside = 20;
  // جنديان مبدئيان داخل القلعة
  for (const rank of ['soldier', 'novice'] as const) {
    const hp = s.settings.combat.rankHp[rank];
    t1.soldiers.push({ id: makeId('sol', rng), rank, hp, maxHp: hp, state: 'inside' });
  }

  // المجموعة الثانية (الخصم): قلعة بطابق + حارس داخلي + جنود خارجيون + ذهب خارجي
  t2.goldInside = 18;
  t2.goldOutside = 8;
  t2.stonesOutside = 6;
  t2.castle.floors.push({ id: makeId('floor', rng), hp: 10, maxHp: 10 });
  const mkSoldier = (rank: 'novice' | 'soldier' | 'expert', state: 'inside' | 'outside'): Soldier => {
    const hp = s.settings.combat.rankHp[rank];
    return { id: makeId('sol', rng), rank, hp, maxHp: hp, state };
  };
  t2.soldiers.push(mkSoldier('novice', 'inside'));
  t2.soldiers.push(mkSoldier('soldier', 'outside'));
  t2.soldiers.push(mkSoldier('novice', 'outside'));
  syncOutsidePile(s, t2, rng);

  // قافلة عائدة للمجموعة الثالثة في منتصف الطريق (هدف للاعتراض)
  const cSoldiers = [mkSoldier('soldier', 'inside'), mkSoldier('novice', 'inside')];
  const convoyId = makeId('cnv', rng);
  for (const cs of cSoldiers) {
    cs.state = 'convoy';
    cs.convoyId = convoyId;
  }
  t3.soldiers.push(...cSoldiers);
  const fromPos = castlePosition(1, s.teams.length);
  const toPos = castlePosition(2, s.teams.length);
  s.convoys.push({
    id: convoyId,
    teamId: t3.id,
    fromTeamId: t2.id,
    soldiers: cSoldiers,
    goldCarried: 12,
    progress: 0.5,
    position: lerpVec3(fromPos, toPos, 0.5),
  });

  // كومة ذهب ساقطة على الطريق (من جندي قتيل سابقًا)
  s.piles.push({
    id: makeId('pile', rng),
    amount: 6,
    position: lerpVec3(castlePosition(0, s.teams.length), castlePosition(1, s.teams.length), 0.4),
    kind: 'dropped',
  });

  return s;
}

/** خطوات السيناريو — تُعرض فقاعة تلو الأخرى بزر «التالي» */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    bubble: 'أهلًا بكم في «قلاع المملكة»! كل مجموعة تملك قلعة، والذهب هو نقاط الفوز وعملة الإنفاق معًا. هيّا نتعلم بالتجربة!',
  },
  {
    id: 'answer',
    bubble: 'كل جولة تبدأ بسؤال. الإجابة الصحيحة تكسبك ذهبًا وحجارة (+10 ذهب و+5 حجارة افتراضيًا). شاهد الموارد تدخل خزنتك!',
    highlight: 'question-card',
    simulate: (state, rng) => resolveAnswer(state, true, rng),
  },
  {
    id: 'build',
    bubble: 'الحجارة تبني طوابق قلعتك (−5 حجارة للطابق). كل طابق يوسّع خزنتك (+10 ذهب وجنديان) ويرفع منجنيقك أعلى!',
    highlight: 'btn-build',
    simulate: (state, rng) => buildFloor(state, state.teams[0].id, rng),
  },
  {
    id: 'recruit',
    bubble: 'بالذهب تجنّد الجنود (−5 ذهب). رتبة كل جندي مفاجأة: مبتدئ 25% / جندي 50% / خبير 25%. الأعلى رتبة يدخل القلعة أولًا ليحميها!',
    highlight: 'btn-recruit',
    simulate: (state, rng) => recruitSoldier(state, state.teams[0].id, rng),
  },
  {
    id: 'catapult-floor',
    bubble: 'المنجنيق على سطح قلعتك! صوّب وأطلق (−1 حجر). القذيفة تدمّر طوابق العدو (ضرر 4–6) — شاهد إطلاقًا محاكى على طابق الخصم!',
    highlight: 'btn-catapult',
    simulate: (state, rng) => {
      const targetFloor = state.teams[1].castle.floors[0];
      if (!targetFloor) return { state, events: [] };
      return fireCatapult(
        state,
        state.teams[0].id,
        { kind: 'floor', teamId: state.teams[1].id, floorId: targetFloor.id },
        0.7,
        rng,
      );
    },
  },
  {
    id: 'catapult-soldier',
    bubble: 'الجنود خارج الأسوار أهداف مكشوفة للمنجنيق! الضرر يُخصم من صحة الجندي (4/6/8): المبتدئ يموت من ضربة، والخبير يحتاج ضربتين.',
    simulate: (state, rng) => {
      const outside = state.teams[1].soldiers.find((x) => x.state === 'outside');
      if (!outside) return { state, events: [] };
      return fireCatapult(
        state,
        state.teams[0].id,
        { kind: 'soldier', teamId: state.teams[1].id, soldierId: outside.id },
        0.55,
        rng,
      );
    },
  },
  {
    id: 'attack-castle',
    bubble: 'من وضع الجيش أرسل جنودك لغزو قلعة العدو! قوتهم تُسحب عشوائيًا عند كل معركة. إن فزت حمل كل ناجٍ ذهبًا بمقدار قوته وعاد في قافلة.',
    highlight: 'btn-army',
    simulate: (state, rng) => {
      const have = state.teams[0].soldiers.filter((x) => x.state === 'inside' || x.state === 'outside');
      const composition = {
        novice: have.filter((x) => x.rank === 'novice').length,
        soldier: have.filter((x) => x.rank === 'soldier').length,
        expert: have.filter((x) => x.rank === 'expert').length,
      };
      if (composition.novice + composition.soldier + composition.expert === 0) return { state, events: [] };
      return dispatchArmy(state, state.teams[0].id, { kind: 'castle', teamId: state.teams[1].id }, composition, rng);
    },
  },
  {
    id: 'attack-convoy',
    bubble: 'القوافل العائدة تسير على الطريق ظاهرة للجميع ومعها الذهب! يمكنك اعتراضها بجنودك — معركة ميدانية فورية والفائز يأخذ الغنيمة.',
    simulate: (state, rng) => {
      const convoy = state.convoys[0];
      const have = state.teams[0].soldiers.filter((x) => x.state === 'inside' || x.state === 'outside');
      if (!convoy || have.length === 0) return { state, events: [] };
      const composition = {
        novice: have.filter((x) => x.rank === 'novice').length,
        soldier: have.filter((x) => x.rank === 'soldier').length,
        expert: have.filter((x) => x.rank === 'expert').length,
      };
      return dispatchArmy(state, state.teams[0].id, { kind: 'convoy', convoyId: convoy.id }, composition, rng);
    },
  },
  {
    id: 'attack-outside-gold',
    bubble: 'الذهب الخارجي المكشوف لا يحميه أحد! أرسل جنديًا واحدًا ليلتقطه بلا قتال — وكل جندٍ يحمل بمقدار قوته.',
    simulate: (state, rng) => {
      const pile = state.piles.find((p) => p.kind === 'outside');
      const have = state.teams[0].soldiers.filter((x) => x.state === 'inside' || x.state === 'outside');
      if (!pile || have.length === 0) return { state, events: [] };
      const s0 = have[0];
      return dispatchArmy(
        state,
        state.teams[0].id,
        { kind: 'gold-pile', pileId: pile.id },
        { novice: s0.rank === 'novice' ? 1 : 0, soldier: s0.rank === 'soldier' ? 1 : 0, expert: s0.rank === 'expert' ? 1 : 0 },
        rng,
      );
    },
  },
  {
    id: 'attack-dropped-gold',
    bubble: 'الذهب الساقط من الجنود القتلى يبقى كومة على الطريق — أول من يرسل جنودًا يلتقطه، ويمكن أيضًا قصفه لإتلافه وإنكاره عن الجميع!',
    simulate: (state, rng) => {
      const pile = state.piles.find((p) => p.kind === 'dropped');
      const have = state.teams[0].soldiers.filter((x) => x.state === 'inside' || x.state === 'outside');
      if (!pile || have.length === 0) return { state, events: [] };
      const s0 = have[0];
      return dispatchArmy(
        state,
        state.teams[0].id,
        { kind: 'gold-pile', pileId: pile.id },
        { novice: s0.rank === 'novice' ? 1 : 0, soldier: s0.rank === 'soldier' ? 1 : 0, expert: s0.rank === 'expert' ? 1 : 0 },
        rng,
      );
    },
  },
  {
    id: 'convoy-return',
    bubble: 'الناجون لا يعودون فورًا: القافلة تقطع ثلث الطريق كل جولة، وتصل مع بداية جولتك التالية فيُضاف الذهب ويترقى المنتصرون!',
  },
  {
    id: 'end',
    bubble: 'هذا كل شيء! تذكّر: القلعة تحمي من الحجارة، والجنود يحمون من الجنود، والخارج لا يحميه أحد. بالتوفيق في موسمكم! 🏰',
  },
];

/** عدد الخطوات (لعدّاد الواجهة «٣/١٢») */
export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;
