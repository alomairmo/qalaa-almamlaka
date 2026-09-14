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
import { GameCanvas } from '@/scene';
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

/**
 * حد أخطاء المشهد ثلاثي الأبعاد: أي انهيار في شجرة R3F كان يُسقط التطبيق
 * كله إلى خلفية الصفحة (الشاشة البنية) حتى تحديث الصفحة. الآن نعرض زر
 * «استعادة العرض» يعيد تركيب الكانفس بمفتاح جديد بينما يبقى HUD حيًّا.
 */
class SceneErrorBoundary extends Component<{ children: (key: number) => ReactNode }, { key: number; error: Error | null }> {
  state = { key: 0, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
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
            style={{
              fontFamily: "'Cairo', sans-serif",
              fontWeight: 900,
              fontSize: 20,
              color: '#FFF3C4',
              background: 'rgba(46,27,14,.9)',
              border: '2px solid rgba(232,185,59,.8)',
              borderRadius: 14,
              padding: '12px 26px',
              cursor: 'pointer',
            }}
          >
            استعادة العرض 🔄
          </button>
        </div>
      );
    }
    return this.props.children(key);
  }
}

export default function App() {
  const phase = useGameStore((s) => s.state.phase);

  if (phase === 'title') {
    return <TitleScreen />;
  }

  return (
    <>
      {/* المشهد ثلاثي الأبعاد — يبقى مركّبًا تحت كل الطبقات، ومحمي بحد أخطاء */}
      <SceneErrorBoundary>{(key) => <GameCanvas key={key} />}</SceneErrorBoundary>
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
