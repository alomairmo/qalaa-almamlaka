/**
 * مدير الشاشات — اللعبة SPA بشاشة واحدة fullscreen بلا Router.
 * يقوده طور اللعبة (GamePhase) من متجر المحرك useGameStore:
 *
 * - title: شاشة العنوان فقط (أزرارها تنادي engineApi مباشرة).
 * - باقي أطوار اللعب: المشهد ثلاثي الأبعاد (z-0) + فوقه HUD + نوافذ السؤال
 *   والإرسال + طبقة الأحداث. شاشات الإعدادات (z-60) والتوتوريال (z-50)
 *   والفوز (z-40) مكوّنات تُظهر نفسها حسب الطور فوق المشهد المتوقف.
 *
 * ترتيب الطبقات يتبع design.md §4: canvas 0 ← HUD 20-25 ← أحداث 30
 * ← نوافذ 40 ← توتوريال 50 ← إعدادات 60 ← توست 80.
 */
import { Component, type ReactNode } from 'react';
import { useGameStore } from '@/engine';
import { GameCanvas, requestSceneRemount, useSceneBridge } from '@/scene';
import {
  GameHud,
  QuestionModal,
  DispatchModal,
  SettingsScreen,
  TutorialOverlay,
  VictoryScreen,
  EventLayer,
} from '@/ui';
import TitleScreen from '@/screens/TitleScreen';

/** تنسيق زر «استعادة العرض 🔄» الموحّد (حد الأخطاء + طبقة الشاشة البنية) */
const RESCUE_BUTTON_STYLE = {
  fontFamily: "'Cairo', sans-serif",
  fontWeight: 900,
  fontSize: 20,
  color: '#FFF3C4',
  background: 'rgba(46,27,14,.9)',
  border: '2px solid rgba(232,185,59,.8)',
  borderRadius: 14,
  padding: '12px 26px',
  cursor: 'pointer',
} as const;

/**
 * حد أخطاء المشهد ثلاثي الأبعاد: أي انهيار في شجرة R3F كان يُسقط التطبيق
 * كله إلى خلفية الصفحة (الشاشة البنية) حتى تحديث الصفحة. الآن نعرض زر
 * «استعادة العرض» يعيد تركيب الكانفس بمفتاح جديد بينما يبقى HUD حيًّا.
 * كما يلتقط resetSignal (sceneNonce من جسر المشهد) فيمسح الخطأ ويعيد
 * التركيب — حتى يشفي زر الاستعادة اليدوي/كاشف الشاشة البنية انهيارات
 * الاستثناءات أيضًا، لا الفشل الصامت فقط.
 */
class SceneErrorBoundary extends Component<
  { children: (key: number) => ReactNode; resetSignal: number },
  { key: number; error: Error | null; seenSignal: number }
> {
  state = { key: 0, error: null as Error | null, seenSignal: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { resetSignal: number },
    state: { seenSignal: number; error: Error | null },
  ) {
    if (props.resetSignal !== state.seenSignal && state.error) {
      return { error: null, seenSignal: props.resetSignal };
    }
    if (props.resetSignal !== state.seenSignal) {
      return { seenSignal: props.resetSignal };
    }
    return null;
  }

  componentDidCatch(error: Error): void {
    console.error('[scene] انهار المشهد ثلاثي الأبعاد — بانتظار استعادة المستخدم', error);
  }

  render() {
    const { key, error } = this.state;
    if (error) {
      return (
        <div
          dir="rtl"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'rgba(46,27,14,.55)',
            fontFamily: "'Cairo', sans-serif",
          }}
        >
          <button
            onClick={() => this.setState((s) => ({ key: s.key + 1, error: null }))}
            style={RESCUE_BUTTON_STYLE}
          >
            استعادة العرض 🔄
          </button>
        </div>
      );
    }
    return this.props.children(key);
  }
}

/**
 * طبقة «الشاشة البنية» — يرفعها كاشف البكسلات (BrownScreenWatchdog) عندما
 * يكون الإطار موحّدًا بلون خلفية الصفحة/شفافًا رغم طور اللعب: فشل صامت بلا
 * استثناء فلا يظهر حد الأخطاء. بطاقة عائمة غير حاجبة (HUD يبقى قابلًا
 * للنقر) فيها زر الاستعادة نفسه (remount عبر sceneNonce).
 */
function BrownScreenOverlay() {
  const brown = useSceneBridge((s) => s.brownScreen);
  if (!brown) return null;
  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        fontFamily: "'Cairo', sans-serif",
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(46,27,14,.92)',
          border: '2px solid rgba(232,185,59,.8)',
          borderRadius: 14,
          padding: '18px 26px',
          maxWidth: 'min(420px, 90vw)',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, color: '#FFF3C4', fontWeight: 700, fontSize: 17, lineHeight: 1.6 }}>
          تعذّر عرض المشهد — يمكنك استعادته فورًا دون فقدان تقدّمك
        </p>
        <button onClick={requestSceneRemount} style={RESCUE_BUTTON_STYLE}>
          استعادة العرض 🔄
        </button>
      </div>
    </div>
  );
}

/**
 * زر استعادة يدوي دائم أثناء اللعب — خط رجعة حتى لو فات الكاشف.
 * صغير شبه شفاف أسفل يسار الشاشة؛ يستدعي remount نفسه (sceneNonce).
 */
function SceneRescueButton() {
  const phase = useGameStore((s) => s.state.phase);
  const tutorialActive = useGameStore((s) => s.tutorialActive);
  if (tutorialActive || phase === 'title' || phase === 'tutorial' || phase === 'victory') return null;
  return (
    <button
      onClick={requestSceneRemount}
      aria-label="استعادة العرض"
      title="استعادة العرض 🔄"
      style={{
        position: 'fixed',
        left: 10,
        bottom: 10,
        zIndex: 15,
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '1px solid rgba(232,185,59,.55)',
        background: 'rgba(46,27,14,.45)',
        color: '#FFF3C4',
        fontSize: 16,
        lineHeight: 1,
        cursor: 'pointer',
        opacity: 0.55,
      }}
    >
      🔄
    </button>
  );
}

export default function App() {
  const phase = useGameStore((s) => s.state.phase);
  // عدّاد إعادة تركيب المشهد (زر الاستعادة اليدوي + طبقة الشاشة البنية)
  const sceneNonce = useSceneBridge((s) => s.sceneNonce);

  if (phase === 'title') {
    return <TitleScreen />;
  }

  return (
    <>
      {/* المشهد ثلاثي الأبعاد — يبقى مركّبًا تحت كل الطبقات، ومحمي بحد أخطاء */}
      <SceneErrorBoundary resetSignal={sceneNonce}>
        {(key) => <GameCanvas key={`${sceneNonce}:${key}`} />}
      </SceneErrorBoundary>
      {/* طبقة الشاشة البنية (فشل صامت بلا استثناء يرصده كاشف البكسلات) */}
      <BrownScreenOverlay />
      {/* زر استعادة يدوي دائم أثناء اللعب */}
      <SceneRescueButton />
      {/* واجهة اللعب فوق الخريطة */}
      <GameHud />
      <QuestionModal />
      <DispatchModal />
      {/* طبقة الأحداث: الوحيدة التي تؤكد طابور الأحداث (ack) */}
      <EventLayer />
      {/* شاشات فوقية تُظهر نفسها حسب الطور */}
      <SettingsScreen />
      <TutorialOverlay />
      <VictoryScreen />
    </>
  );
}
