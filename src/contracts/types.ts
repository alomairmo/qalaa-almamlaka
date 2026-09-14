/**
 * ⚠️ عقد مجمّد — لا تعدّل دون تنسيق مع المنسّق
 *
 * قلاع المملكة — أنواع الحالة الكاملة.
 * المرجع: الوثيقة التفصيلية الكاملة v2.0 + design.md.
 * هذا الملف يحتوي أنواعًا خالصة فقط (بلا أي منطق).
 */

// ─────────────────────────────────────────────
// أساسيات
// ─────────────────────────────────────────────

/** موقع ثلاثي الأبعاد على الخريطة (وحدات المشهد ~120×120) */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** لون المجموعة — يقود لون القبة والراية وبطاقة الفريق (design.md §2.2) */
export type TeamColor = 'emerald' | 'ruby' | 'cobalt' | 'saffron' | 'purple' | 'rose';

/** معرّف المجموعة: 'team-1' … 'team-6' */
export type TeamId = string;

/** رتبة الجندي — §4 */
export type Rank = 'novice' | 'soldier' | 'expert';

// ─────────────────────────────────────────────
// الجنود — §4
// ─────────────────────────────────────────────

/** أين يوجد الجندي حاليًا */
export type SoldierState =
  | 'inside'  // داخل القلعة — يحمي الذهب الداخلي وفي مأمن من المنجنيق
  | 'outside' // خارج الأسوار — هدف مكشوف للمنجنيق، لا يحمي الذهب الخارجي
  | 'convoy'; // في قافلة عائدة على الطريق

export interface Soldier {
  id: string;
  rank: Rank;
  /** الصحة الحالية أمام القذائف (الجروح تبقى بلا شفاء افتراضيًا) */
  hp: number;
  /** الصحة الثابتة القصوى = سقف الرتبة (4/6/8) */
  maxHp: number;
  state: SoldierState;
  /** إن كان في قافلة: معرّفها */
  convoyId?: string;
  /** مستحق للترقية (نجا منتصرًا من معركة) — تُطبق عند الوصول بعد أنيميشن الذهب */
  pendingPromotion?: boolean;
}

// ─────────────────────────────────────────────
// القلعة — §3
// ─────────────────────────────────────────────

export interface Floor {
  id: string;
  hp: number;
  /** الافتراضي 10 — يتهدم الطابق ويختفي عند الصفر */
  maxHp: number;
}

export interface Castle {
  /** الطوابق المبنية فوق القاعدة (مرتّبة من الأسفل للأعلى) */
  floors: Floor[];
  /** صحة القاعدة الأرضية — تُصاب لكن لا تُهدم أبدًا (حد أدنى 1) */
  baseHp: number;
  baseMaxHp: number;
  /** المنجنيق جاهز على السطح (يتطلب حجرًا واحدًا على الأقل للاستخدام) */
  catapultReady: boolean;
}

// ─────────────────────────────────────────────
// المجموعة — §2، §3
// ─────────────────────────────────────────────

export interface Team {
  id: TeamId;
  /** الاسم المعروض، مثل "المجموعة الأولى" */
  name: string;
  color: TeamColor;
  /** الذهب داخل القلعة (محمي من الغزو بالجنود الداخليين فقط) */
  goldInside: number;
  /** الذهب الخارجي المكشوف بجوار القلعة (يُسرق بلا قتال ويُقصف) */
  goldOutside: number;
  /** الحجارة غير المصروفة — خارج القلعة مكشوفة دائمًا */
  stonesOutside: number;
  soldiers: Soldier[];
  castle: Castle;
}

// ─────────────────────────────────────────────
// القوافل — §7 (ذهاب فوري، عودة مؤجلة)
// ─────────────────────────────────────────────

export interface Convoy {
  id: string;
  /** المجموعة المالكة (وجهة العودة) */
  teamId: TeamId;
  /** المجموعة التي سُرق منها الذهب */
  fromTeamId: TeamId;
  /** الجنود الناجون العائدون (ومع كل جندٍ كيس ذهبه) */
  soldiers: Soldier[];
  /** مجموع الذهب المحمول */
  goldCarried: number;
  /** تقدّم العودة 0→1؛ يتحرك ثلث الطريق (1 ÷ (عدد المجموعات − 1)) في كل جولة */
  progress: number;
  /** الموقع الحالي على الطريق (يُشتق من progress لكنه يُخزَّن للحفظ) */
  position: Vec3;
}

// ─────────────────────────────────────────────
// أكوام الذهب — §8، §7
// ─────────────────────────────────────────────

export type GoldPileKind =
  | 'outside' // فائض سعة القلعة — بجوارها
  | 'dropped'; // ساقط من جندي قتيل على الطريق

export interface GoldPile {
  id: string;
  amount: number;
  position: Vec3;
  kind: GoldPileKind;
  /** لأكوام 'outside': المجموعة صاحبة القلعة المجاورة */
  ownerTeamId?: TeamId;
}

// ─────────────────────────────────────────────
// الأسئلة — §13
// ─────────────────────────────────────────────

export interface Question {
  id: string;
  /** السطر 1: نص السؤال */
  text: string;
  /** السطر 2: الإجابة الصحيحة */
  correct: string;
  /** السطر 3: إجابة خاطئة */
  wrong1: string;
  /** السطر 4: إجابة خاطئة أخرى */
  wrong2: string;
}

// ─────────────────────────────────────────────
// الإعدادات — §15 (كل المقابض)
// ─────────────────────────────────────────────

/** موضع زر "بدء الجولة" نسبة للسؤال */
export type StartButtonPosition = 'before' | 'after' | 'both' | 'none';

/** نمط الأسئلة: اختيارية تلقائية التصحيح / شفهية بحكم المعلم */
export type QuestionMode = 'mcq' | 'oral';

/** ترتيب عرض الأسئلة من البنك */
export type QuestionOrder = 'fixed' | 'random';

/** نمط قوة إطلاق المنجنيق: ضغط مطوّل (افتراضي) / مقبض متحرك / إيماء الفارة
 *  (gesture: حركة يمين/يسار تلفّ المنجنيق، وفوق/أسفل تغيّر قوة الإطلاق) */
export type CatapultPowerMode = 'hold' | 'slider' | 'gesture';

/** نطاق قوة شامل [أدنى، أقصى] */
export type Range = [number, number];

/** نطاقات قوة القتال لكل رتبة (تُسحب عشوائيًا كل معركة) */
export interface RankPowerRanges {
  novice: Range;  // افتراضي [2,4]
  soldier: Range; // افتراضي [4,6]
  expert: Range;  // افتراضي [6,8]
}

/** الصحة الثابتة لكل رتبة أمام القذائف */
export interface RankHp {
  novice: number;  // 4
  soldier: number; // 6
  expert: number;  // 8
}

/** احتمالات التجنيد (مجموعها يجب أن يساوي 1) */
export interface RecruitChances {
  novice: number;  // 0.25
  soldier: number; // 0.50
  expert: number;  // 0.25
}

/** ضرر المنجنيق حسب نوع الهدف — §8 */
export interface CatapultDamage {
  /** على طابق محدد */
  floor: Range;        // [4,6]
  /** على الذهب الخارجي أو الساقط (يُتلف ذهبًا) */
  gold: Range;         // [4,6]
  /** على الحجارة الخارجية (ثابت) */
  stones: number;      // 2
  /** على الجنود الخارجيين وجنود القوافل (يُخصم من صحة الجندي المصاب) */
  units: Range;        // [4,6]
}

/** فئة جنود لإعدادات الشفاء المستقلة — §15 د-2 */
export type HealCategory = 'inside' | 'outside' | 'convoy';

/** توقيت الشفاء لكل فئة */
export interface HealTiming {
  /** كل جولة للمجموعة / كل عدد محدد من الجولات */
  everyTurns: number; // 1 = كل جولة
}

/** مقدار الشفاء: نقاط محددة أو شفاء كامل */
export type HealAmount = { kind: 'points'; points: number } | { kind: 'full' };

/** إعداد شفاء فئة واحدة من الجنود */
export interface HealCategorySettings {
  enabled: boolean;
  timing: HealTiming;
  amount: HealAmount;
}

/** إعدادات شفاء الجنود (معطّلة افتراضيًا — الجروح دائمة) */
export interface HealingSettings {
  /** المفتاح الرئيسي */
  enabled: boolean; // افتراضي false
  inside: HealCategorySettings;
  outside: HealCategorySettings;
  convoy: HealCategorySettings;
  /** خيار مستقل للقوافل: شفاء فوري بمجرد الوصول إلى القلعة */
  healOnArrival: {
    enabled: boolean;
    amount: HealAmount;
  };
}

/** إعدادات الجولة والأسئلة — §15 أ */
export interface RoundSettings {
  startButtonPosition: StartButtonPosition; // 'before' افتراضيًا
  questionTimerEnabled: boolean;
  /** مدة عدّاد السؤال بالثواني (إن كان مفعّلًا) */
  questionTimeSeconds: number;
  /** مدة جولة التصرف الحر — افتراضي 30 */
  actionTurnSeconds: number;
  questionMode: QuestionMode;   // 'mcq' افتراضيًا
  questionOrder: QuestionOrder; // 'fixed' افتراضيًا
}

/** إعدادات المنجنيق — §15 ب */
export interface CatapultSettings {
  powerMode: CatapultPowerMode; // 'hold' افتراضيًا
  /** مؤشر ليزر مكان سقوط القذيفة */
  laserEnabled: boolean;        // معطّل افتراضيًا
  /** نصف قطر الضرر الجماعي (وحدات المشهد): كل جندي ضمنه من نقطة السقوط يُصاب */
  splashRadius: number;         // 3.5
  /** ارتداد القذيفة بعد إصابة برج القلعة (طابق/قاعدة) */
  bounceEnabled: boolean;       // مفعّل افتراضيًا
  /** معامل ضرر الارتداد على الهدف الثانوي (يُقرَّب لأقرب صحيح، حد أدنى 1) */
  bounceDamageFactor: number;   // 0.5
  /** نطاق مسافة الارتداد الأفقية العشوائية [أدنى، أقصى] بوحدات المشهد */
  bounceDistance: Range;        // [3, 6]
}

/** إعدادات الاقتصاد — §15 ج */
export interface EconomySettings {
  /** مكافأة الإجابة الصحيحة */
  answerGoldReward: number;  // 10
  answerStoneReward: number; // 5
  soldierCost: number;       // 5 ذهب
  floorCost: number;         // 5 حجارة
  /** كلفة الإصلاح: حجر واحد = هذا العدد من نقاط الصحة (افتراضي 2) */
  repairHpPerStone: number;  // 2
}

/** إعدادات القتال — §15 د */
export interface CombatSettings {
  rankPowerRanges: RankPowerRanges;
  rankHp: RankHp;
  recruitChances: RecruitChances;
  catapultDamage: CatapultDamage;
  floorHp: number;               // 10
  /** سعة الذهب: للقاعدة ولكل طابق إضافي */
  goldCapacityPerLevel: number;  // 10
  /** سعة الجنود: للقاعدة ولكل طابق إضافي */
  soldierCapacityPerLevel: number; // 2
}

/** إعانة إعادة الإعمار — §17.3 */
export interface RebuildGrantSettings {
  enabled: boolean;
  /** مقدار الذهب الممنوح لمن فقد كل طوابقه */
  goldAmount: number; // 10
  /** عدد جولات الحماية بعد الإعانة */
  protectionRounds: number; // 1
}

/** إعدادات الصوت — §16-أ */
export interface SoundSettings {
  muted: boolean;
  /** 0 → 1 */
  volume: number;
}

/** إعدادات عامة — §15 هـ */
export interface GeneralSettings {
  /** عدد المجموعات/القلاع: 2–6 (الافتراضي 4) — طريق القوافل يُقسم على (العدد − 1) */
  teamCount: number;
  /** حماية الجولة الأولى: منع الهجوم والقصف في الجولة الافتتاحية (معطّلة افتراضيًا) */
  firstRoundProtection: boolean;
  rebuildGrant: RebuildGrantSettings;
  sound: SoundSettings;
}

/** كل مقابض الإعدادات — قسم 15 كاملًا */
export interface GameSettings {
  round: RoundSettings;
  catapult: CatapultSettings;
  economy: EconomySettings;
  combat: CombatSettings;
  healing: HealingSettings;
  general: GeneralSettings;
}

// ─────────────────────────────────────────────
// مراحل اللعبة (مدير الشاشات/الأوضاع)
// ─────────────────────────────────────────────

export type GamePhase =
  | 'title'      // شاشة العنوان
  | 'idle'       // الخريطة بين الأفعال (بانتظار بدء الجولة)
  | 'question'   // عرض السؤال
  | 'action'     // جولة التصرف الحر (30 ثانية افتراضيًا)
  | 'catapult'   // وضع المنجنيق — منظور شخص أول
  | 'army'       // وضع الجيش — اختيار الهدف والإرسال
  | 'event'      // أنيميشن حدث قيد التشغيل (قابلة للتخطي)
  | 'settings'   // شاشة الإعدادات (Esc) — اللعبة متوقفة
  | 'freeCamera' // وضع الكاميرا الحرة من شاشة الإعدادات
  | 'tutorial'   // الجولة التعريفية (معزولة)
  | 'victory';   // إعلان الفائز

// ─────────────────────────────────────────────
// سجل الأحداث النصي (يظهر للمعلم/في اللوج)
// ─────────────────────────────────────────────

export interface LogEntry {
  id: string;
  /** ختم زمني (ms) */
  at: number;
  roundNumber: number;
  teamId?: TeamId;
  text: string;
}

// ─────────────────────────────────────────────
// الحالة الشاملة للعبة
// ─────────────────────────────────────────────

export interface GameState {
  /** إصدار مخطط الحالة (للهجرات المستقبلية عند الحفظ/التحميل) */
  schemaVersion: 1;
  teams: Team[];
  convoys: Convoy[];
  /** كل أكوام الذهب خارج القلاع والساقطة على الطرق */
  piles: GoldPile[];
  /** فهرس المجموعة صاحبة الدور الحالي داخل teams[] */
  turnIndex: number;
  /** رقم الجولة الكلية (تزيد عند اكتمال دورة كل المجموعات) */
  roundNumber: number;
  phase: GamePhase;
  settings: GameSettings;
  questionBank: Question[];
  /** عدالة الأسئلة: مؤشرات الأسئلة المستخدمة لكل مجموعة (لا يُعاد سؤال قبل استنفاد البنك) */
  usedQuestionsPerTeam: Record<TeamId, string[]>;
  /** السؤال المعروض حاليًا (إن وُجد) */
  currentQuestionId?: string;
  /** جولات حماية متبقية لكل مجموعة (حماية أول جولة / إعانة إعادة الإعمار) */
  protectionRoundsLeft: Record<TeamId, number>;
  /** آخر قوة إطلاق مستخدمة لكل مجموعة (0–100) — تُحدَّث عند كل إطلاق
   *  وتُستدعى عند فتح وضع المنجنيق (ذاكرة المقبض/الإيماء لكل مجموعة) */
  catapultPowerByTeam: Record<TeamId, number>;
  log: LogEntry[];
  /** ختم بداية الموسم (ms) */
  seasonStartedAt: number;
  /** آخر حفظ محلي (ms) */
  lastSavedAt?: number;
  /** الفائز المُعلن (عند إنهاء الأسبوع يدويًا) */
  winnerTeamId?: TeamId;
}

// ─────────────────────────────────────────────
// أحداث اللعبة — جدول §16 (لأنظمة الأنيميشن والصوت)
// ─────────────────────────────────────────────

interface EventBase {
  /** معرّف فريد للحدث */
  id: string;
  at: number;
}

export interface TurnChangedEvent extends EventBase {
  type: 'turn-changed';
  teamId: TeamId;
  roundNumber: number;
}
export interface QuestionShownEvent extends EventBase {
  type: 'question-shown';
  teamId: TeamId;
  questionId: string;
}
export interface CorrectAnswerEvent extends EventBase {
  type: 'correct-answer';
  teamId: TeamId;
  questionId: string;
}
export interface WrongAnswerEvent extends EventBase {
  type: 'wrong-answer';
  teamId: TeamId;
  questionId: string;
}
/** اكتساب الموارد: أنيميشن دخول الأموال + ظهور كومة الحجارة */
export interface ResourcesGainedEvent extends EventBase {
  type: 'resources-gained';
  teamId: TeamId;
  gold: number;
  stones: number;
}
export interface FloorBuiltEvent extends EventBase {
  type: 'floor-built';
  teamId: TeamId;
  floorId: string;
}
export interface FloorRepairedEvent extends EventBase {
  type: 'floor-repaired';
  teamId: TeamId;
  floorId: string;
  hpRestored: number;
}
/** تجنيد جندي: أنيميشن يكشف رتبته أمام الجميع */
export interface SoldierRecruitedEvent extends EventBase {
  type: 'soldier-recruited';
  teamId: TeamId;
  soldier: Soldier;
}
export interface CatapultFiredEvent extends EventBase {
  type: 'catapult-fired';
  teamId: TeamId;
  target: CatapultTarget;
  power: number;
}
/** إصابة القذيفة: انفجار + رقم الضرر + ما الذي أصيب في منتصف الشاشة.
 *  الحقول target/damage/result تصف الهدف الأساسي (توافق عكسي)،
 *  وhits تسرد كل الإصابات الفعلية بما فيها ضحايا الضرر الجماعي. */
export interface ProjectileImpactEvent extends EventBase {
  type: 'projectile-impact';
  teamId: TeamId;
  target: CatapultTarget;
  damage: number;
  result: ImpactResult;
  /** كل الإصابات الناتجة عن الانفجار الأساسي (الهدف + من في نطاق السبلاش) */
  hits: CatapultHit[];
}
/** ارتداد القذيفة بعد إصابة برج قلعة (طابق/قاعدة): قفزة أفقية قصيرة
 *  ثم سقوط أرضي قد يصيب هدفًا ثانويًا بضرر مخفّض. لا يُبثّ إلا إن أصاب شيئًا. */
export interface CatapultBounceEvent extends EventBase {
  type: 'catapult-bounce';
  /** المجموعة المُطلِقة */
  teamId: TeamId;
  /** نقطة الارتداد (موقع القلعة المقصوفة، عند مستوى الأرض) */
  origin: Vec3;
  /** نقطة سقوط الارتداد */
  landing: Vec3;
  /** الإصابات الثانوية بضرر مخفّض (غير فارغة دائمًا — وإلا لا حدث) */
  hits: CatapultHit[];
}
/** خسارة واحدة في معركة: الجندي ورتبته (لبطاقة النتائج) */
export interface BattleLossEntry {
  soldierId: string;
  rank: Rank;
}
/** نتيجة معركة — تُبثّ أولًا قبل أحداث سقوط الجنود حتى يسبق
 *  أنيميشن المسير/القتال إشعارات الموت وبطاقة النتائج تأتي بعدها.
 *  الحمولة ذاتية الاكتفاء: بطاقة النتائج لا تحتاج أي حدث آخر. */
export interface BattleResolvedEvent extends EventBase {
  type: 'battle-resolved';
  /** نوع المعركة: غزو قلعة / اعتراض قافلة */
  battleKind: 'castle' | 'convoy';
  attackerTeamId: TeamId;
  defenderTeamId: TeamId;
  attackPower: number;
  defensePower: number;
  attackerWon: boolean;
  attackerLosses: string[]; // معرّفات الجنود القتلى
  defenderLosses: string[];
  /** الخسائر بالرتب (نفس ترتيب attackerLosses/defenderLosses) */
  attackerLossDetails: BattleLossEntry[];
  defenderLossDetails: BattleLossEntry[];
  /** الغنيمة التي حملها الناجون المهاجمون (0 عند فشل الهجوم) */
  lootGold: number;
  /** قافلة العودة بالغنيمة إن انطلقت */
  convoyId?: string;
}
export interface SoldierDiedEvent extends EventBase {
  type: 'soldier-died';
  teamId: TeamId;
  soldierId: string;
  /** إن كان يحمل ذهبًا سقط مكانه */
  droppedGold?: number;
  dropPosition?: Vec3;
}
/** كومة ذهب ساقطة ظهرت على الطريق */
export interface GoldDroppedEvent extends EventBase {
  type: 'gold-dropped';
  pileId: string;
  amount: number;
  position: Vec3;
}
export interface GoldBurnedEvent extends EventBase {
  type: 'gold-burned';
  pileId: string;
  amount: number;
}
export interface FloorDestroyedEvent extends EventBase {
  type: 'floor-destroyed';
  teamId: TeamId;
  floorId: string;
  /** ما فاض للخارج فورًا عند انخفاض السعة */
  spilledGold: number;
  spilledSoldierIds: string[];
}
export interface ConvoyDepartedEvent extends EventBase {
  type: 'convoy-departed';
  convoy: Convoy;
}
/** القافلة قطعت ثلث الطريق أثناء جولة ما */
export interface ConvoyMovedEvent extends EventBase {
  type: 'convoy-moved';
  convoyId: string;
  progress: number;
  position: Vec3;
}
/** وصول القافلة: أنيميشن دخول ← زيادة الذهب أولًا ← ثم الترقيات */
export interface ConvoyArrivedEvent extends EventBase {
  type: 'convoy-arrived';
  convoyId: string;
  teamId: TeamId;
  goldDelivered: number;
}
export interface SoldierPromotedEvent extends EventBase {
  type: 'soldier-promoted';
  teamId: TeamId;
  soldierId: string;
  fromRank: Rank;
  toRank: Rank;
}
export interface SoldierHealedEvent extends EventBase {
  type: 'soldier-healed';
  teamId: TeamId;
  soldierId: string;
  hpBefore: number;
  hpAfter: number;
}
/** منحة المعلم: أنيميشنات إضافة متتابعة */
export interface TeacherGrantEvent extends EventBase {
  type: 'teacher-grant';
  teamId: TeamId;
  delta: TeamAdjustment;
}
/** جزاء المعلم: أنيميشن قصف من السماء على العنصر المخصوم */
export interface TeacherPenaltyEvent extends EventBase {
  type: 'teacher-penalty';
  teamId: TeamId;
  delta: TeamAdjustment;
}
export interface SettingsChangedEvent extends EventBase {
  type: 'settings-changed';
}
export interface GameSavedEvent extends EventBase {
  type: 'game-saved';
}
export interface GameResetEvent extends EventBase {
  type: 'game-reset';
}
export interface VictoryDeclaredEvent extends EventBase {
  type: 'victory-declared';
  winnerTeamId: TeamId;
  /** الذهب الكلي لكل مجموعة (داخل + خارج + في الطريق) */
  totals: Record<TeamId, number>;
}

// ─────────────────────────────────────────────
// أنواع مساندة للأحداث
// ─────────────────────────────────────────────

/** هدف قصف المنجنيق — §8 (الأهداف الممكنة) */
export type CatapultTarget =
  | { kind: 'floor'; teamId: TeamId; floorId: string }
  | { kind: 'base'; teamId: TeamId }
  | { kind: 'gold-pile'; pileId: string }
  | { kind: 'stones'; teamId: TeamId }
  | { kind: 'soldier'; teamId: TeamId; soldierId: string }
  | { kind: 'convoy'; convoyId: string; soldierId: string }
  | { kind: 'ground'; position: Vec3 }; // سقوط في أرض فارغة

/** نتيجة إصابة قذيفة */
export type ImpactResult =
  | { kind: 'floor-damaged'; floorId: string; destroyed: boolean }
  | { kind: 'base-damaged'; newHp: number }
  | { kind: 'gold-burned'; pileId: string; amount: number }
  | { kind: 'stones-destroyed'; teamId: TeamId; count: number }
  | { kind: 'soldier-hit'; soldierId: string; died: boolean }
  | { kind: 'miss' };

/** إصابة واحدة ضمن انفجار قذيفة (أساسية، سبلاش جماعي، أو ثانوية بعد ارتداد) */
export type CatapultHit =
  | { kind: 'floor'; teamId: TeamId; floorId: string; damage: number; destroyed: boolean }
  | { kind: 'base'; teamId: TeamId; damage: number; newHp: number }
  | { kind: 'gold-pile'; pileId: string; amount: number } // ذهب أُتلف
  | { kind: 'stones'; teamId: TeamId; count: number }     // حجارة دُمّرت
  | { kind: 'soldier'; teamId: TeamId; soldierId: string; damage: number; died: boolean }
  | { kind: 'convoy-soldier'; convoyId: string; soldierId: string; damage: number; died: boolean };

/** تشكيلة إرسال جيش: عدد من كل رتبة */
export interface ArmyComposition {
  novice: number;
  soldier: number;
  expert: number;
}

/** هدف إرسال الجيش — §11 */
export type ArmyTarget =
  | { kind: 'castle'; teamId: TeamId }
  | { kind: 'convoy'; convoyId: string }
  | { kind: 'gold-pile'; pileId: string };

/** تعديل المعلم على أرصدة مجموعة (منحة + / جزاء −) */
export interface TeamAdjustment {
  gold?: number;
  stones?: number;
  soldiers?: number;
  floors?: number;
}

/** اتحاد كل الأحداث */
export type GameEvent =
  | TurnChangedEvent
  | QuestionShownEvent
  | CorrectAnswerEvent
  | WrongAnswerEvent
  | ResourcesGainedEvent
  | FloorBuiltEvent
  | FloorRepairedEvent
  | SoldierRecruitedEvent
  | CatapultFiredEvent
  | ProjectileImpactEvent
  | CatapultBounceEvent
  | BattleResolvedEvent
  | SoldierDiedEvent
  | GoldDroppedEvent
  | GoldBurnedEvent
  | FloorDestroyedEvent
  | ConvoyDepartedEvent
  | ConvoyMovedEvent
  | ConvoyArrivedEvent
  | SoldierPromotedEvent
  | SoldierHealedEvent
  | TeacherGrantEvent
  | TeacherPenaltyEvent
  | SettingsChangedEvent
  | GameSavedEvent
  | GameResetEvent
  | VictoryDeclaredEvent;
