/**
 * ⚠️ عقد مجمّد — لا تعدّل دون تنسيق مع المنسّق
 *
 * قلاع المملكة — القيم الافتراضية الكاملة.
 * المرجع: الوثيقة التفصيلية v2.0 §19 (ملخص القيم الافتراضية) + §15.
 * ثوابت خالصة فقط (بلا منطق).
 */

import type {
  CatapultSettings,
  CombatSettings,
  EconomySettings,
  GameSettings,
  GeneralSettings,
  HealingSettings,
  Rank,
  RoundSettings,
  TeamColor,
} from './types';

// ─────────────────────────────────────────────
// ألوان المجموعات — design.md §2.2 (حتى 6 مجموعات)
// ─────────────────────────────────────────────

export const TEAM_COLORS: Record<TeamColor, string> = {
  emerald: '#2E9E5B', // الفريق الأخضر
  ruby: '#C94F3D',    // الفريق الأحمر
  cobalt: '#3B7DD8',  // الفريق الأزرق
  saffron: '#E8912D', // الفريق البرتقالي
  purple: '#8E5BB5',  // الفريق الخامس
  rose: '#D85B8E',    // الفريق السادس
};

/** الألوان الافتراضية بالترتيب للمجموعات 1..6 */
export const TEAM_COLOR_ORDER: TeamColor[] = ['emerald', 'ruby', 'cobalt', 'saffron', 'purple', 'rose'];

/** الأسماء الافتراضية للمجموعات بالترتيب */
export const TEAM_DEFAULT_NAMES: string[] = [
  'المجموعة الأولى',
  'المجموعة الثانية',
  'المجموعة الثالثة',
  'المجموعة الرابعة',
  'المجموعة الخامسة',
  'المجموعة السادسة',
];

/** الحد الأدنى/الأقصى لعدد المجموعات */
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 6;

// ─────────────────────────────────────────────
// الرتب — §4 / §19
// ─────────────────────────────────────────────

/** ترتيب الترقية: مبتدئ ← جندي ← خبير */
export const RANK_ORDER: Rank[] = ['novice', 'soldier', 'expert'];

export const RANK_LABELS: Record<Rank, string> = {
  novice: 'مبتدئ',
  soldier: 'جندي',
  expert: 'خبير',
};

// ─────────────────────────────────────────────
// مقاطع الإعدادات الافتراضية — §15 + §19
// ─────────────────────────────────────────────

/** أ. الجولة والأسئلة */
export const DEFAULT_ROUND: RoundSettings = {
  startButtonPosition: 'before', // زر "بدء الجولة" قبل السؤال (الافتراضي)
  questionTimerEnabled: false,   // وقت السؤال اختياري — معطّل افتراضيًا
  questionTimeSeconds: 30,
  actionTurnSeconds: 30,         // جولة التصرف الحر 30 ثانية
  questionMode: 'mcq',           // أسئلة اختيارية تلقائية التصحيح
  questionOrder: 'fixed',        // بنفس ترتيب اللصق
};

/** ب. المنجنيق */
export const DEFAULT_CATAPULT: CatapultSettings = {
  powerMode: 'hold',      // الضغط المطوّل (الافتراضي)
  laserEnabled: false,    // ليزر مكان السقوط معطّل افتراضيًا
  splashRadius: 3.5,      // نصف قطر الضرر الجماعي حول نقطة السقوط
  bounceEnabled: true,    // القذيفة ترتد بعد إصابة برج القلعة
  bounceDamageFactor: 0.5,// ضرر الارتداد = 50% من الضرر الأساسي (حد أدنى 1)
  bounceDistance: [3, 6], // مسافة القفزة الأفقية العشوائية
};

/** ج. الاقتصاد */
export const DEFAULT_ECONOMY: EconomySettings = {
  answerGoldReward: 10,  // +10 ذهب للإجابة الصحيحة
  answerStoneReward: 5,  // +5 حجارة للإجابة الصحيحة
  soldierCost: 5,        // سعر الجندي: 5 ذهب
  floorCost: 5,          // تكلفة الطابق: 5 حجارة
  repairHpPerStone: 2,   // الإصلاح: حجر واحد = نقطتا صحة
};

/** د. القتال */
export const DEFAULT_COMBAT: CombatSettings = {
  rankPowerRanges: {
    novice: [2, 4],
    soldier: [4, 6],
    expert: [6, 8],
  },
  rankHp: {
    novice: 4,
    soldier: 6,
    expert: 8,
  },
  recruitChances: {
    novice: 0.25,
    soldier: 0.5,
    expert: 0.25,
  },
  catapultDamage: {
    floor: [4, 6],  // ضرر عشوائي على الطابق
    gold: [4, 6],   // إتلاف ذهب خارجي/ساقط
    stones: 2,      // تدمير حجرين ثابت من الحجارة الخارجية
    units: [4, 6],  // ضرر على صحة الجنود الخارجيين والقوافل
  },
  floorHp: 10,                // صحة الطابق
  goldCapacityPerLevel: 10,   // 10 ذهب للقاعدة ولكل طابق
  soldierCapacityPerLevel: 2, // جنديان للقاعدة ولكل طابق
};

/** د-2. شفاء الجنود — معطّل افتراضيًا (الجروح تبقى بلا شفاء) */
export const DEFAULT_HEALING: HealingSettings = {
  enabled: false,
  inside: {
    enabled: false,
    timing: { everyTurns: 1 },
    amount: { kind: 'points', points: 1 },
  },
  outside: {
    enabled: false,
    timing: { everyTurns: 1 },
    amount: { kind: 'points', points: 1 },
  },
  convoy: {
    enabled: false,
    timing: { everyTurns: 1 },
    amount: { kind: 'points', points: 1 },
  },
  healOnArrival: {
    enabled: false, // شفاء فوري بمجرد وصول القافلة — معطّل افتراضيًا
    amount: { kind: 'full' },
  },
};

/** هـ. عام */
export const DEFAULT_GENERAL: GeneralSettings = {
  teamCount: 4,                  // 4 مجموعات افتراضيًا
  firstRoundProtection: false,   // حماية الجولة الأولى معطّلة افتراضيًا
  rebuildGrant: {
    enabled: true,               // إعانة إعادة الإعمار مفعّلة
    goldAmount: 10,              // 10 ذهب
    protectionRounds: 1,         // + حماية جولة كاملة
  },
  sound: {
    muted: false,
    volume: 0.8,
  },
};

/** الإعدادات الافتراضية الكاملة للعبة */
export const DEFAULT_SETTINGS: GameSettings = {
  round: DEFAULT_ROUND,
  catapult: DEFAULT_CATAPULT,
  economy: DEFAULT_ECONOMY,
  combat: DEFAULT_COMBAT,
  healing: DEFAULT_HEALING,
  general: DEFAULT_GENERAL,
};

// ─────────────────────────────────────────────
// ثوابت مشتقة من الوثيقة
// ─────────────────────────────────────────────

/** القاعدة الأرضية غير قابلة للتدمير — حدها الأدنى 1 */
export const BASE_MIN_HP = 1;
/** صحة القاعدة الأرضية الابتدائية (مثل الطابق: 10) */
export const BASE_MAX_HP = 10;
/** كلفة رمية المنجنيق: حجر واحد */
export const CATAPULT_STONE_COST = 1;
/** قوة الإطلاق الافتراضية (0–100) عندما لا توجد قوة محفوظة للمجموعة */
export const DEFAULT_CATAPULT_POWER = 50;
/** كل 5 حجارة خارجية = مجسم هرم خماسي — §9 */
export const STONE_PYRAMID_SIZE = 5;
