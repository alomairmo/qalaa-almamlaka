/**
 * EventLayer — طبقة الأحداث (battles-convoys.md + وثيقة §16).
 * تقرأ طابور GameEvent من المتجر حدثًا حدثًا (بلا تزامن — قاعدة «تأثير واحد ثقيل»)،
 * تعرض ReportCard/DamageFloat/Toast + الصوت المناسب، مع زر «تخطي ⏭»
 * (يكتم الصوت ويسرّع)، ثم تؤدّي ackEvents بعد العرض — الواجهة مسؤولة عن ack.
 * المشهد ثلاثي الأبعاد يقرأ الطابور نفسه بصمت حتى يُؤكَّد من هنا.
 *
 * البطاقات الثابتة (تجنيد/معركة/منجنيق/نهب) تُثبَّت كلها في عمود أيسر الشاشة
 * (الجهة المقابلة للأزرار الجانبية اليمنى) حتى يبقى وسط الشاشة فارغًا للمشهد،
 * وتنتظر «تأكيد ✓». عند عرضها يُعلَم المشهد عبر setStickyHold، وعند تأكيدها
 * يُنادى confirmSticky ثم setStickyHold(null) — كلها نداءات دفاعية (قد لا
 * توجد قبل دمج فرع المشهد). التوتوريال يغلقها عبر ui-store.stickyCloseSignal.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, engineApi, ackEvents, didTeamWinBattle, battleDeathSide } from '@/engine';
import type {
  BattleLossEntry,
  BattleResolvedEvent,
  CatapultBounceEvent,
  CatapultHit,
  ConvoyDepartedEvent,
  GameEvent,
  GameState,
  ProjectileImpactEvent,
  Rank,
  SoldierDiedEvent,
  SoldierRecruitedEvent,
  Team,
} from '@/contracts/types';
import { RANK_LABELS, TEAM_COLORS } from '@/contracts/defaults';
// قراءة فقط من المشهد: حالة أنيميشن المعركة (battleFx) — لا نستدعي أي أمر من هنا
import { useSceneBridge } from '@/scene/bridge';
import {
  confirmStickySafe,
  setStickyHoldSafe,
  useBridgeCatapultFx,
  type StickyHold,
  type StickyKind,
} from './scene-bridge-safe';
import { useSound, type SoundApi } from '@/audio';
import type { SoundHandle } from '@/audio/engine';
import GameButton from '@/components/game/GameButton';
import { useUiStore } from './ui-store';
import { ReportCard, WoodPanel } from './primitives/panels';
import { DamageFloatHost, RankBadge, SkipButton, ToastHost } from './primitives/widgets';

interface Plan {
  /** مدة العرض بالمللي ثانية (0 = ack فوري) */
  ms: number;
  /** بطاقة ثابتة تنتظر تأكيد المستخدم — لا تُغلق تلقائيًا ولا بالتخطي، وتوقف طابور الأحداث */
  sticky?: boolean;
  /** بطاقة تقرير مركزية اختيارية */
  report?: { big: string; label: string; accent: 'gold' | 'danger' | 'teal' | 'success' };
  /** وسام رتبة (تجنيد/ترقية) */
  rank?: 'novice' | 'soldier' | 'expert';
  /** رقم عائم */
  float?: { text: string; color: 'red' | 'gold' | 'green' | 'gray' };
  /** توست */
  toast?: { text: string; kind: 'info' | 'success' | 'danger' };
  /** تشغيل الصوت */
  sound?: (s: SoundApi) => SoundHandle;
}

function teamName(ev: { teamId?: string }, teams: Array<{ id: string; name: string }>): string {
  return teams.find((t) => t.id === ev.teamId)?.name ?? '';
}

/**
 * قافلة انطلقت بلا معركة (سرقة قلعة فارغة / التقاط كومة ذهب)؟
 * أحداث dispatchArmy الواحد تُختَم في اللحظة نفسها تقريبًا، والغزو القتالي
 * يضع battle-resolved قبل convoy-departed في الطابور — غيابه ضمن نافذة
 * زمنية قصيرة يعني أن هذه غنيمة بلا قتال وتستحق بطاقة نتائج ثابتة.
 */
function isNoBattleLoot(ev: ConvoyDepartedEvent, recent: GameEvent[]): boolean {
  return !recent.some((e) => e.type === 'battle-resolved' && Math.abs(e.at - ev.at) <= 300);
}

/** خطة العرض لكل نوع حدث — §16 بالترتيب */
function planEvent(ev: GameEvent, state: ReturnType<typeof engineApi.getState>, recent: GameEvent[]): Plan {
  const teams = state.teams;
  switch (ev.type) {
    case 'turn-changed':
      return { ms: 900, sound: (s) => s.ding(), toast: { text: `الدور: ${teamName(ev, teams)}`, kind: 'info' } };
    case 'question-shown':
      return { ms: 0, sound: (s) => s.whoosh() };
    case 'correct-answer':
      return { ms: 300, sound: (s) => s.fanfare() };
    case 'wrong-answer':
      return { ms: 300, sound: (s) => s.wrong() };
    case 'resources-gained':
      return {
        ms: 1800,
        sound: (s) => {
          const a = s.coins();
          const b = s.stoneClack();
          return { stop: () => (a.stop(), b.stop()) };
        },
        report: { big: `+${ev.gold} 🪙  +${ev.stones} 🪨`, label: `موارد ${teamName(ev, teams)}`, accent: 'gold' },
        float: { text: `+${ev.gold}`, color: 'gold' },
      };
    case 'floor-built':
      return { ms: 2000, sound: (s) => s.build(), report: { big: '🏰 طابق جديد!', label: teamName(ev, teams), accent: 'teal' } };
    case 'floor-repaired':
      return { ms: 1200, sound: (s) => s.build(), float: { text: `+${ev.hpRestored} إصلاح`, color: 'green' } };
    case 'soldier-recruited':
      // بطاقة كشف الرتبة ثابتة: تبقى حتى ضغط «تأكيد ✓» وطابور الأحداث يتوقف حتى ذاك الحين
      return { ms: 0, sticky: true, sound: (s) => s.recruit(), rank: ev.soldier.rank };
    case 'catapult-fired':
      return { ms: 1200, sound: (s) => s.catapultFire() };
    case 'projectile-impact':
      // بطاقة نتيجة المنجنيق ثابتة في العمود الأيسر: خلاصة كل الإصابات (hits)،
      // تظهر عند طور الارتطام في المشهد (catapultFx) أو بعد مهلة احتياطية،
      // وتبقى حتى «تأكيد ✓». إصابات الارتداد اللاحقة تُلحق بها (انظر EventLayer).
      return {
        ms: 0,
        sticky: true,
        sound: (s) => s.explosion(ev.damage / 6),
        float: ev.damage > 0 ? { text: `−${ev.damage}`, color: 'red' } : undefined,
      };
    case 'catapult-bounce':
      // تصل هنا فقط إن لم تكن بطاقة منجنيق مفتوحة دمجتها (نادر) — تقرير عابر
      return {
        ms: 1600,
        sound: (s) => s.explosion(0.3),
        report: { big: '↩ ارتداد!', label: `إصابات ثانوية: ${ev.hits.length}`, accent: 'danger' },
      };
    case 'battle-resolved':
      // بطاقة نتيجة المعركة ثابتة لكنها **مؤجلة**: عند مواجهة هذا الحدث يبدأ
      // EventLayer «عنقود المعركة» — إشعاراته (soldier-died/convoy-departed/...)
      // تُعرض كتنبيهات عابرة متتابعة أثناء استمرار أنيميشن القتال، وبعد آخر
      // إشعار تظهر البطاقة (مع setStickyHold) وتنتظر «تأكيد ✓» فيُؤكَّد العنقود
      // كاملًا دفعة واحدة — انظر BattleCluster/EventLayer أدناه.
      return { ms: 0, sticky: true, sound: (s) => s.swords() };
    case 'soldier-died':
      return {
        ms: 1000,
        sound: (s) => s.soldierFall(),
        toast: { text: `سقط جندي من ${teamName(ev, teams)}`, kind: 'danger' },
        ...(ev.droppedGold ? { float: { text: `سقط ${ev.droppedGold} 🪙`, color: 'gold' as const } } : {}),
      };
    case 'gold-dropped':
      return { ms: 1000, sound: (s) => s.coinScatter(), float: { text: `${ev.amount} 🪙 على الطريق`, color: 'gold' } };
    case 'gold-burned':
      return { ms: 1200, sound: (s) => s.goldBurn(), float: { text: `احترق −${ev.amount} 🪙`, color: 'red' } };
    case 'floor-destroyed':
      return { ms: 2000, sound: (s) => s.collapse(), report: { big: 'دُمّر الطابق!', label: teamName(ev, teams), accent: 'danger' } };
    case 'convoy-departed':
      // غنيمة بلا قتال (قلعة فارغة / كومة ذهب): بطاقة نتائج ثابتة kind='loot'
      if (isNoBattleLoot(ev, recent)) {
        return { ms: 0, sticky: true, sound: (s) => s.coins(10) };
      }
      return { ms: 1000, sound: (s) => s.recruit(), toast: { text: 'انطلقت قافلة الغنائم 🐪', kind: 'info' } };
    case 'convoy-moved':
      return { ms: 0 }; // حركة القافلة يعرضها المشهد
    case 'convoy-arrived':
      // وصول القافلة: الذهب أولًا — ثم تأتي أحداث الترقية بعده في الطابور
      return {
        ms: 2200,
        sound: (s) => s.convoyArrive(),
        report: { big: `+${ev.goldDelivered} 🪙`, label: `وصلت غنيمة ${teamName(ev, teams)}`, accent: 'gold' },
        float: { text: `+${ev.goldDelivered}`, color: 'gold' },
      };
    case 'soldier-promoted':
      return {
        ms: 1600,
        sound: (s) => s.promotion(),
        rank: ev.toRank,
        report: { big: `⭐ ${RANK_LABELS[ev.toRank]}`, label: `ترقية من ${RANK_LABELS[ev.fromRank]} — ${teamName(ev, teams)}`, accent: 'gold' },
      };
    case 'soldier-healed':
      return { ms: 900, sound: (s) => s.heal(), float: { text: `+${ev.hpAfter - ev.hpBefore} ❤`, color: 'green' } };
    case 'teacher-grant': {
      const parts = grantParts(ev.delta);
      return {
        ms: 2000,
        sound: (s) => s.coins(8),
        report: { big: 'منحة المعلم 🎁', label: `${teamName(ev, teams)}: ${parts}`, accent: 'gold' },
      };
    }
    case 'teacher-penalty': {
      const parts = grantParts(ev.delta);
      return {
        ms: 2200,
        sound: (s) => s.thunder(),
        report: { big: 'جزاء المعلم ⚡', label: `${teamName(ev, teams)}: ${parts}`, accent: 'danger' },
      };
    }
    case 'settings-changed':
    case 'game-reset':
      return { ms: 0 };
    case 'game-saved':
      return { ms: 0 }; // نبضة «تم الحفظ ✓» يعرضها SyncIndicator
    case 'victory-declared':
      return { ms: 600, sound: (s) => s.victory() };
    default:
      return { ms: 0 };
  }
}

function grantParts(delta: { gold?: number; stones?: number; soldiers?: number; floors?: number }): string {
  const parts: string[] = [];
  if (delta.gold) parts.push(`${delta.gold > 0 ? '+' : ''}${delta.gold} ذهب`);
  if (delta.stones) parts.push(`${delta.stones > 0 ? '+' : ''}${delta.stones} حجارة`);
  if (delta.soldiers) parts.push(`${delta.soldiers > 0 ? '+' : ''}${delta.soldiers} جنود`);
  if (delta.floors) parts.push(`${delta.floors > 0 ? '+' : ''}${delta.floors} طوابق`);
  return parts.join('، ');
}

function impactLabel(ev: ProjectileImpactEvent, state: GameState): string {
  const t = ev.target;
  const name = (id?: string) => state.teams.find((x) => x.id === id)?.name ?? '';
  switch (t.kind) {
    case 'floor':
      return ev.result.kind === 'floor-damaged' && ev.result.destroyed
        ? `دُمّر طابق قلعة ${name(t.teamId)}!`
        : `طابق قلعة ${name(t.teamId)}`;
    case 'base':
      return `قاعدة قلعة ${name(t.teamId)}`;
    case 'gold-pile':
      return 'احترق الذهب!';
    case 'stones':
      return `حجارة ${name(t.teamId)}`;
    case 'soldier':
      return ev.result.kind === 'soldier-hit' && ev.result.died ? 'سقط الجندي وسقطت غنيمته!' : `جندي من ${name(t.teamId)}`;
    case 'convoy':
      return 'قافلة عائدة';
    case 'ground':
      return 'سقطت في أرض فارغة';
  }
}

/** نوع البطاقة الثابتة لحدث (عقد الجسر مع المشهد) */
function stickyKindOf(ev: GameEvent): StickyKind {
  switch (ev.type) {
    case 'soldier-recruited':
      return 'recruit';
    case 'battle-resolved':
      return 'battle';
    case 'projectile-impact':
      return 'catapult';
    default:
      return 'loot';
  }
}

// ─────────────────────────────────────────────
// قشرة البطاقة الثابتة — عمود أيسر الشاشة (المقابل للأزرار اليمنى)،
// وسط الشاشة يبقى فارغًا لرؤية المشهد. عرض أقصى ~360px.
// ─────────────────────────────────────────────
function StickyCardShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <motion.div
      className="fixed inset-y-0 left-4 z-[35] flex items-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="pointer-events-auto"
        initial={{ x: -60, scale: 0.92, opacity: 0 }}
        animate={{ x: 0, scale: 1, opacity: 1 }}
        exit={{ x: -60, scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      >
        <WoodPanel
          arch
          className={`${wide ? 'w-[380px]' : 'w-[360px]'} max-w-[92vw] max-h-[92vh] overflow-y-auto px-6 pt-11 pb-6 text-center`}
        >
          {children}
        </WoodPanel>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// توهّج حواف الشاشة — احتفال فوز (أخضر) / هزيمة (أحمر) يظهر مع بطاقات
// النتائج الثابتة ويستمر حتى «تأكيد ✓»
// ─────────────────────────────────────────────
function ScreenGlow({ tone }: { tone: 'win' | 'lose' }) {
  const rgb = tone === 'win' ? '67,169,92' : '214,69,69';
  return (
    <motion.div
      className="fixed inset-0 z-[34] pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      aria-hidden
    >
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          boxShadow: `inset 0 0 110px 30px rgba(${rgb},.5), inset 0 0 26px 6px rgba(${rgb},.6)`,
        }}
      />
      {/* إطار زخرفي داخلي خفيف */}
      <div
        className="absolute inset-3 rounded-[28px] border-[3px]"
        style={{ borderColor: `rgba(${rgb},.45)` }}
      />
      {/* شارة علوية صغيرة */}
      <div className="absolute top-12 inset-x-0 flex justify-center">
        <span
          className="rounded-full px-6 py-1.5 font-heading font-extrabold text-[18px] text-white shadow-card"
          style={{ background: `rgba(${rgb},.85)` }}
        >
          {tone === 'win' ? '🎉 نصر مؤزر!' : '💔 خسارة — شدّوا الحيل!'}
        </span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// بطاقة الجندي الجديد — ثابتة حتى «تأكيد ✓» (design.md §9: WoodPanel مقوّسة)
// ─────────────────────────────────────────────
function RecruitCard({ ev, onConfirm }: { ev: SoldierRecruitedEvent; onConfirm: () => void }) {
  const state = useGameStore((s) => s.state);
  const combat = state.settings.combat;
  const rank = ev.soldier.rank;
  const [powMin, powMax] = combat.rankPowerRanges[rank];
  const hp = ev.soldier.maxHp ?? combat.rankHp[rank];
  const team = state.teams.find((t) => t.id === ev.teamId);

  return (
    <StickyCardShell>
      <div className="font-heading font-black text-[28px] text-wood-700">جندي جديد ينضم!</div>
      {team && <div className="font-body text-[16px] text-ink/70 mt-0.5">لـ {team.name}</div>}

      <div className="flex justify-center my-4">
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <RankBadge rank={rank} size={104} />
        </motion.div>
      </div>
      <div className="font-heading font-black text-[36px] text-gold-600 -mt-1 mb-3">
        {RANK_LABELS[rank]}
      </div>

      <div className="flex flex-col gap-2.5 font-body text-[17px] text-ink text-start">
        <div className="flex items-center justify-between rounded-xl border-2 border-wood-700/30 bg-parchment/70 px-4 py-2">
          <span className="font-bold">⚔️ القوة القتالية</span>
          <b className="font-heading tabular-nums text-teal-700">من {powMin} إلى {powMax}</b>
        </div>
        <div className="flex items-center justify-between rounded-xl border-2 border-wood-700/30 bg-parchment/70 px-4 py-2">
          <span className="font-bold">❤️ الصحة الثابتة</span>
          <b className="font-heading tabular-nums text-success-500">{hp} نقاط</b>
        </div>
        <div className="flex items-center justify-between rounded-xl border-2 border-wood-700/30 bg-parchment/70 px-4 py-2">
          <span className="font-bold flex items-center gap-1.5">
            <img src="/icon-coin-gold.svg" alt="" className="w-[22px] h-[22px]" /> حمل الذهب
          </span>
          <b className="font-heading tabular-nums text-gold-600">
            من {powMin} إلى {powMax} ذهبًا
          </b>
        </div>
        <div className="text-[14px] text-ink/60 text-center">
          يحمل حتى {powMax} ذهبًا في السرقة — قدرة الحمل تساوي قوته القتالية
        </div>
      </div>

      <GameButton
        label="تأكيد ✓"
        variant="gold"
        size="md"
        className="w-full mt-5"
        onClick={onConfirm}
      />
    </StickyCardShell>
  );
}

// ─────────────────────────────────────────────
// بطاقة نتيجة المعركة — ثابتة حتى «تأكيد ✓» (نفس نمط RecruitCard)
// ─────────────────────────────────────────────

/**
 * حالة أنيميشن المعركة في المشهد — يضيفها فرع المشهد بالتوازي إلى
 * src/scene/bridge.ts بالشكل { eventId, phase: 'marching'|'fighting'|'done'|null }.
 * نقرأ الحقل دفاعيًا (قد لا يوجد قبل دمج فرع المشهد أو في وضع reduced-motion)،
 * وعند غيابه/عدم مطابقته نعتمد مهلة احتياطية ~3.5ث من ظهور الحدث.
 */
interface BattleFxState {
  eventId: string | null;
  phase: 'marching' | 'fighting' | 'done' | null;
}

/** مهلة احتياطية لإظهار بطاقة المعركة بعد بدء عنقودها (ms) — تعطي أنيميشن
 *  المسير/القتال وقتًا حتى لو لم يصل battleFx مطابقًا (reduced-motion/نسخة أقدم) */
const BATTLE_FX_FALLBACK_MS = 3500;
/** مهلة احتياطية لإظهار بطاقة المنجنيق إن لم يصل catapultFx مطابقًا (ms) */
const CATAPULT_FX_FALLBACK_MS = 2600;
/**
 * نافذة «عنقود المعركة» (ms): المعركة وإشعاراتها (موت الجنود/انطلاق القافلة/...)
 * تُختم في استدعاء المحرك نفسه فتشترك تقريبًا في ختم at — كل حدث لاحق ضمن هذه
 * النافذة من battle-resolved يُعد جزءًا من العنقود ويُعرض كتنبيه عابر قبل البطاقة.
 */
const BATTLE_CLUSTER_WINDOW_MS = 100;

/** عنقود معركة جارٍ: البطاقة الثابتة مؤجلة حتى تُعرض تنبيهات العنقود كلها */
interface BattleCluster {
  battle: BattleResolvedEvent;
  /** أحداث العنقود المتبقية (تُعرض تنبيهًا تلو الآخر) */
  queue: GameEvent[];
  /** آخر معرّف في العنقود — ack واحد عند التأكيد يشمل العنقود كاملًا */
  lastId: string;
}

/** بحث دفاعي عن رتبة جندي بالمعرّف (القتلى يُحذفون من الحالة — قد لا تُوجد الرتبة) */
function findSoldierRank(state: GameState, soldierId: string): Rank | undefined {
  for (const t of state.teams) {
    const s = t.soldiers.find((x) => x.id === soldierId);
    if (s) return s.rank;
  }
  for (const c of state.convoys) {
    const s = c.soldiers.find((x) => x.id === soldierId);
    if (s) return s.rank;
  }
  return undefined;
}

/** شريحة فريق: لون + اسم + دوره في المعركة */
function TeamChip({ team, role }: { team?: Team; role: string }) {
  const color = team ? TEAM_COLORS[team.color] : '#8D99AE';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border-2 border-wood-700/30 bg-parchment/70 px-3.5 py-1.5">
      <span
        className="w-4 h-4 rounded-full border border-wood-700/50 shrink-0"
        style={{ background: color }}
        aria-hidden
      />
      <b className="font-heading font-extrabold text-[16px] text-ink">{team?.name ?? 'فريق مجهول'}</b>
      <span className="font-body text-[13px] text-ink/60">{role}</span>
    </span>
  );
}

/** صف محتوى داخل البطاقة (مثل صفوف RecruitCard) */
function BattleRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-wood-700/30 bg-parchment/70 px-4 py-2">
      <span className="font-bold font-body">{label}</span>
      <span className="font-heading font-black tabular-nums text-ink flex items-center gap-1.5">{children}</span>
    </div>
  );
}

/**
 * خسائر طرف: العدد + ميداليات الرتب. يفضّل lossDetails من الحدث نفسه
 * (العقد الموسّع — القتلى يُحذفون من الحالة)، مع بحث دفاعي قديم كبديل.
 */
function LossesValue({ ids, details, state }: { ids: string[]; details?: BattleLossEntry[]; state: GameState }) {
  if (ids.length === 0) return <span className="text-success-500">بلا خسائر</span>;
  const ranks = (
    details && details.length > 0
      ? details.map((d) => d.rank)
      : ids.map((id) => findSoldierRank(state, id)).filter((r): r is Rank => r !== undefined)
  ) as Rank[];
  return (
    <span className="flex items-center gap-1.5 text-danger-500">
      <span>{ids.length} قتيل{ids.length > 2 ? 'ًا' : ''}</span>
      {ranks.length > 0 && (
        <span className="flex items-center gap-1" aria-label="رتب القتلى">
          {ranks.map((r, i) => (
            <RankBadge key={i} rank={r} size={22} />
          ))}
        </span>
      )}
    </span>
  );
}

function BattleResultCard({
  ev,
  onConfirm,
}: {
  ev: BattleResolvedEvent;
  onConfirm: () => void;
}) {
  const state = useGameStore((s) => s.state);
  const attacker = state.teams.find((t) => t.id === ev.attackerTeamId);
  const defender = state.teams.find((t) => t.id === ev.defenderTeamId);

  // الحمولة ذاتية الاكتفاء (العقد الموسّع): الغنيمة وقافلة العودة من الحدث مباشرة
  const lootGold = ev.lootGold ?? 0;
  const returnConvoy = ev.convoyId ? state.convoys.find((c) => c.id === ev.convoyId) : undefined;
  const pendingPromotions = returnConvoy?.soldiers.filter((s) => s.pendingPromotion).length ?? 0;

  const isConvoyBattle = ev.battleKind === 'convoy';
  const title = ev.attackerWon ? 'انتصار!' : isConvoyBattle ? 'فشل الاعتراض' : 'فشل الغزو';
  const titleColor = ev.attackerWon ? 'text-success-500' : 'text-danger-500';
  const subtitle = ev.attackerWon
    ? isConvoyBattle
      ? `أُخذت غنيمة قافلة ${defender?.name ?? 'العدو'} — الذهب في الطريق`
      : `هزيمة ${defender?.name ?? 'المدافعين'} — الغنيمة في الطريق`
    : `${defender?.name ?? 'المدافعون'} صدّت الهجوم — سقط المهاجمون`;

  return (
    <StickyCardShell wide>
      <div className={`font-heading font-black text-[30px] leading-none ${titleColor}`}>⚔️ {title}</div>
      <div className="font-body text-[15px] text-ink/70 mt-1.5">{subtitle}</div>

      <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
        <TeamChip team={attacker} role="المهاجم" />
        <span className="font-heading font-black text-[18px] text-wood-700">ضد</span>
        <TeamChip team={defender} role={isConvoyBattle ? 'القافلة' : 'المدافع'} />
      </div>

      <div className="flex flex-col gap-2.5 font-body text-[16px] text-ink text-start mt-4">
        <BattleRow label="⚔️ القوة المسحوبة">
          <span>
            المهاجمون <b className={ev.attackerWon ? 'text-success-500' : 'text-ink'}>{ev.attackPower}</b>
            {' : '}
            <b className={!ev.attackerWon ? 'text-success-500' : 'text-ink'}>{ev.defensePower}</b> المدافعون
          </span>
        </BattleRow>
        <BattleRow label={`💀 خسائر ${attacker?.name ?? 'المهاجمين'}`}>
          <LossesValue ids={ev.attackerLosses} details={ev.attackerLossDetails} state={state} />
        </BattleRow>
        <BattleRow label={`💀 خسائر ${defender?.name ?? 'المدافعين'}`}>
          <LossesValue ids={ev.defenderLosses} details={ev.defenderLossDetails} state={state} />
        </BattleRow>
        {lootGold > 0 && (
          <BattleRow label={
            <span className="flex items-center gap-1.5">
              <img src="/icon-coin-gold.svg" alt="" className="w-[22px] h-[22px]" /> الغنيمة المحمولة
            </span>
          }>
            <span className="text-gold-600">{lootGold} ذهبًا في قافلة العودة</span>
          </BattleRow>
        )}
        {pendingPromotions > 0 && (
          <div className="text-[14px] text-ink/60 text-center">
            {pendingPromotions} من الناجين المنتصرين مستحقون للترقية عند وصول القافلة ⭐
          </div>
        )}
      </div>

      <GameButton
        label="تأكيد ✓"
        variant="gold"
        size="md"
        className="w-full mt-5"
        onClick={onConfirm}
      />
    </StickyCardShell>
  );
}

// ─────────────────────────────────────────────
// بطاقة نتيجة المنجنيق — ثابتة حتى «تأكيد ✓»، تلحق بها إصابات الارتداد
// ─────────────────────────────────────────────

/** سطر وصفي عربي لإصابة واحدة من قذيفة (أساسية/سبلاش/ارتداد) */
function hitDescription(hit: CatapultHit, state: GameState): string {
  const name = (id?: string) => state.teams.find((x) => x.id === id)?.name ?? '';
  switch (hit.kind) {
    case 'floor':
      return `🏰 طابق قلعة ${name(hit.teamId)}: ضرر ${hit.damage}${hit.destroyed ? ' — تدمّر الطابق! 💥' : ''}`;
    case 'base':
      return `🧱 قاعدة قلعة ${name(hit.teamId)}: ضرر ${hit.damage} (المتبقي ${hit.newHp})`;
    case 'gold-pile':
      return `🪙 كومة ذهب: أُتلف ${hit.amount} ذهبًا`;
    case 'stones':
      return `🪨 حجارة ${name(hit.teamId)}: دُمّرت ${hit.count}`;
    case 'soldier':
      return `🗡 جندي من ${name(hit.teamId)}: ضرر ${hit.damage}${hit.died ? ' — سقط قتيلًا' : ''}`;
    case 'convoy-soldier': {
      const owner = state.convoys.find((c) => c.id === hit.convoyId)?.teamId;
      return `🐪 جندي قافلة ${name(owner)}: ضرر ${hit.damage}${hit.died ? ' — سقط قتيلًا' : ''}`;
    }
  }
}

function HitList({ hits, state, empty }: { hits: CatapultHit[]; state: GameState; empty: string }) {
  if (hits.length === 0) {
    return <div className="text-[15px] text-ink/60 text-center py-1">{empty}</div>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {hits.map((h, i) => {
        const destroyed =
          (h.kind === 'floor' && h.destroyed) || ((h.kind === 'soldier' || h.kind === 'convoy-soldier') && h.died);
        return (
          <div
            key={i}
            className={`rounded-lg border px-3 py-1.5 font-body text-[15px] text-start ${
              destroyed ? 'border-danger-500/60 bg-danger-500/10 text-danger-500 font-bold' : 'border-wood-700/25 bg-parchment/70 text-ink'
            }`}
          >
            {hitDescription(h, state)}
          </div>
        );
      })}
    </div>
  );
}

function CatapultResultCard({
  ev,
  bounce,
  onConfirm,
}: {
  ev: ProjectileImpactEvent;
  bounce: CatapultBounceEvent | null;
  onConfirm: () => void;
}) {
  const state = useGameStore((s) => s.state);
  const shooter = state.teams.find((t) => t.id === ev.teamId);
  const hits = ev.hits ?? [];

  return (
    <StickyCardShell wide>
      <div className="font-heading font-black text-[28px] text-danger-500 leading-none">💥 إصابة المنجنيق!</div>
      <div className="font-body text-[15px] text-ink/70 mt-1.5">
        قذيفة {shooter?.name ?? ''} — الضرر الأساسي <b className="tabular-nums">{ev.damage}</b>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        <div className="font-heading font-extrabold text-[17px] text-wood-700 text-start">الإصابات:</div>
        <HitList
          hits={hits}
          state={state}
          empty={impactLabel(ev, state)}
        />
        {bounce && (
          <>
            <div className="font-heading font-extrabold text-[17px] text-wood-700 text-start mt-1">
              ↩ ارتداد القذيفة:
            </div>
            <HitList hits={bounce.hits} state={state} empty="ارتدت بلا إصابات" />
          </>
        )}
      </div>

      <GameButton
        label="تأكيد ✓"
        variant="gold"
        size="md"
        className="w-full mt-5"
        onClick={onConfirm}
      />
    </StickyCardShell>
  );
}

// ─────────────────────────────────────────────
// بطاقة نتيجة النهب بلا قتال (قلعة فارغة / كومة ذهب) — ثابتة حتى «تأكيد ✓»
// ─────────────────────────────────────────────
function LootCard({ ev, onConfirm }: { ev: ConvoyDepartedEvent; onConfirm: () => void }) {
  const state = useGameStore((s) => s.state);
  const convoy = ev.convoy;
  const taker = state.teams.find((t) => t.id === convoy.teamId);
  const fromTeam = state.teams.find((t) => t.id === convoy.fromTeamId);
  // نهب قلعة (بما فيه كومة خارجية بمالك): منTeamId مجموعة أخرى.
  // وإلا فهي كومة ساقطة بلا مالك — نقرأ بقاياها من الحالة عند موقع الانطلاق.
  const castleLoot = fromTeam !== undefined && fromTeam.id !== convoy.teamId;
  const pileLeft = !castleLoot
    ? state.piles.find(
        (p) => Math.hypot(p.position.x - convoy.position.x, p.position.z - convoy.position.z) < 1.5,
      )
    : undefined;

  return (
    <StickyCardShell>
      <div className="font-heading font-black text-[28px] text-gold-600 leading-none">🐪 غنيمة بلا قتال!</div>
      <div className="font-body text-[15px] text-ink/70 mt-1.5">
        {taker?.name ?? ''} {castleLoot ? `نهبت من ${fromTeam.name}` : 'التقطت الذهب الساقط'} — القافلة في الطريق
      </div>

      <div className="flex flex-col gap-2.5 font-body text-[16px] text-ink text-start mt-4">
        <BattleRow label={
          <span className="flex items-center gap-1.5">
            <img src="/icon-coin-gold.svg" alt="" className="w-[22px] h-[22px]" /> أُخذ (في القافلة)
          </span>
        }>
          <span className="text-gold-600">{convoy.goldCarried} ذهبًا</span>
        </BattleRow>
        {castleLoot && (
          <BattleRow label={`🏰 تبقّى لدى ${fromTeam.name}`}>
            <span>
              داخل <b className="tabular-nums">{fromTeam.goldInside}</b>
              {' · '}
              خارج <b className="tabular-nums text-danger-500">{fromTeam.goldOutside}</b>
            </span>
          </BattleRow>
        )}
        {!castleLoot && (
          <BattleRow label="🪙 تبقّى في الكومة">
            {pileLeft ? (
              <span className="text-gold-600 tabular-nums">{pileLeft.amount} ذهبًا</span>
            ) : (
              <span className="text-success-500">أُخذت كاملة ✓</span>
            )}
          </BattleRow>
        )}
        <BattleRow label="🐪 الجنود العائدون">
          <span className="tabular-nums">{convoy.soldiers.length}</span>
        </BattleRow>
        <div className="text-[14px] text-ink/60 text-center">
          تصل القافلة بعد جولات — يمكن اعتراضها في الطريق!
        </div>
      </div>

      <GameButton
        label="تأكيد ✓"
        variant="gold"
        size="md"
        className="w-full mt-5"
        onClick={onConfirm}
      />
    </StickyCardShell>
  );
}

export default function EventLayer() {
  const head = useGameStore((s) => s.eventQueue[0]);
  const skipSignal = useGameStore((s) => s.skipSignal);
  const state = useGameStore((s) => s.state);
  const sound = useSound();
  const addFloat = useUiStore((s) => s.addFloat);
  const addToast = useUiStore((s) => s.addToast);
  const setStickyCard = useUiStore((s) => s.setStickyCard);
  const stickyCloseSignal = useUiStore((s) => s.stickyCloseSignal);

  const [current, setCurrent] = useState<{ ev: GameEvent; plan: Plan } | null>(null);
  const soundHandle = useRef<SoundHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  /** آخر الأحداث المعروضة — تلتقط منها كشف «النهب بلا قتال» مجاورةَ المعركة */
  const recentRef = useRef<GameEvent[]>([]);
  /** ارتداد مدموج في بطاقة المنجنيق المفتوحة (يُقرأ استباقًا من الطابور) */
  const [mergedBounce, setMergedBounce] = useState<CatapultBounceEvent | null>(null);

  // ── عنقود المعركة ──
  // battle-resolved يبقى في رأس الطابور (لا يُستهلك عبر current)؛ تنبيهات العنقود
  // تُعرض تتابعيًا دون توقيف، وبعد آخرها تظهر بطاقة النتائج الثابتة، وعند
  // «تأكيد ✓» يُؤكَّد العنقود كاملًا دفعة واحدة (ackEvents حتى lastId).
  const [cluster, setCluster] = useState<BattleCluster | null>(null);
  /** تنبيه العنقود المعروض حاليًا (تقرير مركزي عابر إن وُجد في خطته) */
  const [clusterToast, setClusterToast] = useState<{ ev: GameEvent; plan: Plan } | null>(null);
  const clusterTimerRef = useRef<number | null>(null);
  const clusterSoundRef = useRef<SoundHandle | null>(null);
  /** مهلة احتياطية لكشف بطاقة العنقود (تبدأ من بدء العنقود) */
  const [clusterFxFallback, setClusterFxFallback] = useState(false);

  // حالات الأنيميشن من جسر المشهد — قراءة دفاعية اختيارية: الحقول تُضاف
  // بالتوازي في فرع المشهد (src/scene/bridge.ts) وقد لا توجد بعد عند هذا البناء،
  // لذا نصل إليها عبر تحويل نوعي بدل تفكيكها مباشرة حتى لا يكسر tsc قبل الدمج.
  const battleFx = useSceneBridge((s) => (s as unknown as { battleFx?: BattleFxState }).battleFx);
  const catapultFx = useBridgeCatapultFx();
  /** مهلة احتياطية: إظهار البطاقة حتى لو لم يصل fx مطابقًا (reduced-motion/نسخة أقدم) */
  const [fxFallback, setFxFallback] = useState(false);

  const stickyImpact =
    current?.plan.sticky && current.ev.type === 'projectile-impact'
      ? (current.ev as ProjectileImpactEvent)
      : null;
  const stickyLoot =
    current?.plan.sticky && current.ev.type === 'convoy-departed'
      ? (current.ev as ConvoyDepartedEvent)
      : null;

  // الحدث الثابت الذي ينتظر أنيميشن مشهد (منجنيق) — يصفّر المهلة الاحتياطية ويعدّها
  const fxWaitingId = stickyImpact?.id ?? null;
  useEffect(() => {
    if (!fxWaitingId) return;
    setFxFallback(false);
    const t = window.setTimeout(() => setFxFallback(true), CATAPULT_FX_FALLBACK_MS);
    return () => window.clearTimeout(t);
     
  }, [fxWaitingId]);

  // بطاقة المنجنيق تظهر عند الارتطام في المشهد ('impact'/'done') — أو بعد المهلة الاحتياطية
  const catFxHit =
    !!stickyImpact &&
    catapultFx?.eventId === stickyImpact.id &&
    (catapultFx?.phase === 'impact' || catapultFx?.phase === 'done');
  const showCatapultCard = !!stickyImpact && (catFxHit || fxFallback);

  // ── بدء عنقود المعركة ──
  // عند مواجهة battle-resolved في رأس الطابور: لا بطاقة بعد. كل حدث لاحق ضمن
  // نافذة BATTLE_CLUSTER_WINDOW_MS من ختمه الزمني يُعد من العنقود ويُعرض تنبيهًا
  // عابرًا (القتال مستمر في المشهد)، والبطاقة تنتظر نهاية العنقود.
  useEffect(() => {
    if (!head || current || cluster || head.type !== 'battle-resolved') return;
    const battle = head as BattleResolvedEvent;
    const q = useGameStore.getState().eventQueue;
    const members: GameEvent[] = [];
    for (let i = 1; i < q.length; i++) {
      if (q[i].at - battle.at <= BATTLE_CLUSTER_WINDOW_MS) members.push(q[i]);
      else break;
    }
    recentRef.current = [...recentRef.current.slice(-15), battle];
    clusterSoundRef.current?.stop();
    clusterSoundRef.current = planEvent(battle, state, recentRef.current).sound?.(sound) ?? null;
    setClusterFxFallback(false);
    setCluster({
      battle,
      queue: members,
      lastId: members.length > 0 ? members[members.length - 1].id : battle.id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head?.id, current !== null, cluster !== null]);

  // مهلة احتياطية لكشف بطاقة العنقود تبدأ مع بدء العنقود (تعطي المسير/القتال وقتًا)
  const clusterBattleId = cluster?.battle.id ?? null;
  useEffect(() => {
    if (!clusterBattleId) return;
    const t = window.setTimeout(() => setClusterFxFallback(true), BATTLE_FX_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [clusterBattleId]);

  // ── متتابعة تنبيهات العنقود ──
  // كل حدث يُعرض كتنبيه عابر (توست/رقم عائم/تقرير مركزي) بمدته المعتادة ثم
  // ينتقل للتالي — بلا بطاقة ثابتة وبلا ack جزئي حتى تأكيد البطاقة النهائية.
  useEffect(() => {
    if (!cluster || clusterToast || cluster.queue.length === 0) return;
    const next = cluster.queue[0];
    recentRef.current = [...recentRef.current.slice(-15), next];
    const plan: Plan = { ...planEvent(next, state, recentRef.current), sticky: false };
    // إشعارات موت الجنود أثناء القتال تُلوَّن من منظور المهاجم: سقوط جندي
    // للمهاجم خسارة (أحمر)، وسقوط جندي للمدافع مكسب للمهاجم (أخضر) — الجهة
    // تُشتق من حدث المعركة نفسه لا من الدور الحالي.
    if (next.type === 'soldier-died' && plan.toast) {
      const side = battleDeathSide(cluster.battle, (next as SoldierDiedEvent).teamId);
      if (side) plan.toast = { ...plan.toast, kind: side === 'attacker' ? 'danger' : 'success' };
    }
    clusterSoundRef.current?.stop();
    clusterSoundRef.current = plan.sound ? plan.sound(sound) : null;
    if (plan.float) addFloat(plan.float.text, plan.float.color);
    if (plan.toast) addToast(plan.toast.text, plan.toast.kind);
    setCluster({ ...cluster, queue: cluster.queue.slice(1) });
    const hasVisual = !!(plan.toast || plan.float || plan.report);
    const ms = plan.ms > 0 ? plan.ms : hasVisual ? 800 : 0;
    if (ms <= 0) return; // بلا عرض مرئي — التالي فورًا في الدورة القادمة
    setClusterToast({ ev: next, plan });
    clusterTimerRef.current = window.setTimeout(() => {
      clusterTimerRef.current = null;
      setClusterToast(null);
    }, ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, clusterToast]);

  // بطاقة المعركة المؤجلة تظهر بعد آخر تنبيه في العنقود — عندها يرصد المشهد
  // stickyHold فيتحول من حلقة القتال إلى احتفال الفوز/الخسارة. ننتظر أيضًا
  // battleFx='done' إن وصل (توافقية) أو المهلة الاحتياطية من بدء العنقود.
  const clusterToastsDone = !!cluster && cluster.queue.length === 0 && !clusterToast;
  const clusterBattleFxDone =
    !!cluster && battleFx?.eventId === cluster.battle.id && battleFx?.phase === 'done';
  const showClusterCard = clusterToastsDone && (clusterBattleFxDone || clusterFxFallback);

  // عند ظهور بطاقة العنقود: إعلام المشهد (stickyHold kind='battle') + إخفاء لوحة الموارد
  useEffect(() => {
    if (!showClusterCard || !cluster) return;
    setStickyCard({ eventId: cluster.battle.id, kind: 'battle' });
    setStickyHoldSafe({ eventId: cluster.battle.id, kind: 'battle' });
    return () => {
      setStickyCard(null);
      setStickyHoldSafe(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showClusterCard]);

  /** تأكيد بطاقة المعركة المؤجلة: إعلام المشهد ثم ack العنقود كاملًا دفعة واحدة */
  const confirmCluster = () => {
    if (!cluster) return;
    confirmStickySafe(cluster.battle.id);
    setStickyHoldSafe(null);
    setStickyCard(null);
    clusterSoundRef.current?.stop();
    clusterSoundRef.current = null;
    if (clusterTimerRef.current) {
      window.clearTimeout(clusterTimerRef.current);
      clusterTimerRef.current = null;
    }
    // ackEvents يحذف حتى آخر حدث في العنقود — يشمل battle-resolved وكل تنبيهاته معًا
    ackEvents(cluster.lastId);
    setCluster(null);
    setClusterToast(null);
    setClusterFxFallback(false);
  };

  // إعلام متجر الواجهة بالبطاقة الثابتة المعروضة (يخفي لوحة الموارد مؤقتًا) —
  // أما إعلام المشهد (setStickyHold) فمؤجَّل إلى لحظة ظهور البطاقة فعليًا
  // (انظر تأثير shownStickyKey أدناه) حتى لا يثبّت المشهد الكاميرا قبل الأوان.
  const currentStickyId = current?.plan.sticky ? current.ev.id : null;
  useEffect(() => {
    if (!current || !current.plan.sticky) return;
    const kind = stickyKindOf(current.ev);
    setStickyCard({ eventId: current.ev.id, kind });
    return () => {
      setStickyCard(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStickyId]);

  // دمج استباقي: إصابات الارتداد تأتي بعد projectile-impact في الطابور، لكن
  // البطاقة الثابتة توقف الطابور — نقرأ الحدث المنتظر ونعرض إصاباته في البطاقة
  // نفسها، ثم عند وصوله لرأس الطابور لاحقًا يُعرض تقريرًا عابرًا خفيفًا.
  useEffect(() => {
    if (!stickyImpact) {
      setMergedBounce(null);
      return;
    }
    const q = useGameStore.getState().eventQueue;
    const bounce = q.find(
      (e): e is CatapultBounceEvent =>
        e.type === 'catapult-bounce' && Math.abs(e.at - stickyImpact.at) <= 400,
    );
    setMergedBounce(bounce ?? null);
  }, [stickyImpact]);

  // معالج رأس الطابور: يعرض ثم يؤكد
  useEffect(() => {
    if (!head || current || cluster) return;
    // battle-resolved لا يُستهلك هنا — يبدأ «عنقود المعركة» (تنبيهات ثم بطاقة مؤجلة)
    if (head.type === 'battle-resolved') return;
    recentRef.current = [...recentRef.current.slice(-15), head];
    const plan = planEvent(head, state, recentRef.current);
    if (plan.ms <= 0 && !plan.sticky) {
      plan.sound?.(sound);
      ackEvents(head.id);
      return;
    }
    if (plan.sound) soundHandle.current = plan.sound(sound);
    if (plan.float) addFloat(plan.float.text, plan.float.color);
    if (plan.toast) addToast(plan.toast.text, plan.toast.kind);
    setCurrent({ ev: head, plan });
    // البطاقة الثابتة لا مؤقت لها — تنتظر ضغط «تأكيد ✓» (لا ack قبلها، فيتوقف الطابور)
    if (!plan.sticky) timerRef.current = window.setTimeout(() => finish(head.id), plan.ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head?.id, current !== null, cluster !== null]);

  const finish = (id: string) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    soundHandle.current?.stop();
    soundHandle.current = null;
    ackEvents(id);
    setCurrent(null);
  };

  /** تأكيد بطاقة ثابتة: إعلام المشهد دفاعيًا ثم متابعة الطابور */
  const confirmStickyCard = (ev: GameEvent) => {
    confirmStickySafe(ev.id);
    setStickyHoldSafe(null);
    setStickyCard(null);
    finish(ev.id);
  };

  // إشارة «أغلق البطاقات» من التوتوريال (زر «التالي») — تؤكد البطاقة الثابتة
  // المعروضة كأن المستخدم ضغط «تأكيد ✓» فيتابع الطابور
  const firstClose = useRef(true);
  useEffect(() => {
    if (firstClose.current) {
      firstClose.current = false;
      return;
    }
    if (showClusterCard) confirmCluster();
    else if (current?.plan.sticky) confirmStickyCard(current.ev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickyCloseSignal]);

  // زر/إشارة التخطي: إنهاء العرض الحالي فورًا + كتم صوته
  const firstSkip = useRef(true);
  useEffect(() => {
    if (firstSkip.current) {
      firstSkip.current = false;
      return;
    }
    // التخطي لا يُغلق البطاقة الثابتة — التأكيد وحده يفعل.
    // أثناء عنقود المعركة: ينهي التنبيه الحالي ويسرّع كشف البطاقة المؤجلة
    // (تفعيل المهلة الاحتياطية) دون تأكيدها، فيبقى الطابور متوقفًا.
    // وأثناء انتظار ارتطام المنجنيق يعمل كمسرّع لكشف بطاقته بالمثل.
    if (cluster) {
      if (clusterTimerRef.current) {
        window.clearTimeout(clusterTimerRef.current);
        clusterTimerRef.current = null;
      }
      setClusterToast(null);
      setClusterFxFallback(true);
    } else if (current && !current.plan.sticky) {
      finish(current.ev.id);
    } else if (current && current.ev.type === 'projectile-impact') {
      setFxFallback(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipSignal]);

  const report = current?.plan.report ?? clusterToast?.plan.report;
  const rank = current?.plan.rank ?? clusterToast?.plan.rank;
  const stickyRecruit =
    current?.plan.sticky && current.ev.type === 'soldier-recruited'
      ? (current.ev as SoldierRecruitedEvent)
      : null;

  // ── إعلام المشهد بالبطاقة الثابتة لحظة ظهورها فعليًا ──
  // المشهد يبقي الكاميرا على موقع إصابة المنجنيق/النهب حتى يصله
  // confirmSticky(eventId). لذلك يُضبط stickyHold هنا عند كشف البطاقة لا عند
  // مواجهة الحدث: بطاقة المنجنيق تنتظر طور الارتطام (showCatapultCard)،
  // وبطاقتا التجنيد/النهب تظهران فور كونهما في رأس الطابور.
  const shownStickyHold: StickyHold | null =
    stickyImpact && showCatapultCard
      ? { eventId: stickyImpact.id, kind: 'catapult' }
      : stickyLoot
        ? { eventId: stickyLoot.id, kind: 'loot' }
        : stickyRecruit
          ? { eventId: stickyRecruit.id, kind: 'recruit' }
          : null;
  const shownStickyKey = shownStickyHold ? `${shownStickyHold.kind}:${shownStickyHold.eventId}` : null;
  useEffect(() => {
    if (!shownStickyHold || !shownStickyKey) return;
    setStickyHoldSafe(shownStickyHold);
    return () => setStickyHoldSafe(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownStickyKey]);

  // توهّج الفوز/الهزيمة: أخضر إن فاز صاحب الهجوم، أحمر إن خسر — مع بطاقة
  // المعركة المؤجلة (بعد آخر تنبيه في العنقود) أو بطاقة النهب (النهب بلا قتال
  // نصر دائمًا لصاحب الدور).
  // منظور التوهج = **المهاجم دائمًا**: dispatchArmy لا يسمح إلا لصاحب الجولة
  // بالهجوم، فالمهاجم هو من بدأ المعركة من «مجموعته». نشتق النتيجة من حدث
  // battle-resolved نفسه (didTeamWinBattle) لا من state.turnIndex الحالية —
  // البطاقة مؤجلة حتى نهاية العنقود وقد ينتهي عداد الجولة أثناءه فيتقدّم
  // turnIndex قبل ظهورها، فينقلب لون التوهج (الخلل المُبلغ عنه).
  const glowBattle = cluster && showClusterCard ? cluster.battle : null;
  const battleWonByAttacker = glowBattle ? didTeamWinBattle(glowBattle, glowBattle.attackerTeamId) : false;
  const glowTone: 'win' | 'lose' | null =
    glowBattle ? (battleWonByAttacker ? 'win' : 'lose') : stickyLoot ? 'win' : null;

  return (
    <>
      {report && (
        <ReportCard
          show
          big={report.big}
          label={report.label}
          accent={report.accent}
          icon={rank ? <RankBadge rank={rank} size={72} /> : undefined}
        />
      )}
      <AnimatePresence>{glowTone && <ScreenGlow key={`glow-${glowTone}`} tone={glowTone} />}</AnimatePresence>
      <AnimatePresence>
        {stickyRecruit && (
          <RecruitCard key={stickyRecruit.id} ev={stickyRecruit} onConfirm={() => confirmStickyCard(stickyRecruit)} />
        )}
        {cluster && showClusterCard && (
          <BattleResultCard key={cluster.battle.id} ev={cluster.battle} onConfirm={confirmCluster} />
        )}
        {stickyImpact && showCatapultCard && (
          <CatapultResultCard
            key={stickyImpact.id}
            ev={stickyImpact}
            bounce={mergedBounce}
            onConfirm={() => confirmStickyCard(stickyImpact)}
          />
        )}
        {stickyLoot && (
          <LootCard key={stickyLoot.id} ev={stickyLoot} onConfirm={() => confirmStickyCard(stickyLoot)} />
        )}
      </AnimatePresence>
      <SkipButton
        show={
          (current !== null && !current.plan.sticky && current.plan.ms >= 1200) ||
          // أثناء عنقود المعركة (تنبيهات متتابعة/انتظار البطاقة) التخطي مسرّع
          (!!cluster && !showClusterCard) ||
          // أثناء انتظار ارتطام المنجنيق (قبل ظهور بطاقته) التخطي مسرّع
          (!!stickyImpact && !showCatapultCard)
        }
        onSkip={() => engineApi.skipEvent()}
      />
      <ToastHost />
      <DamageFloatHost />
    </>
  );
}
