/**
 * نقطة دخول الواجهة — كل المكونات المصدّرة بلا props تعتمد على useGameStore.
 * وكيل الدمج يركّبها في App.tsx فوق المشهد ثلاثي الأبعاد:
 *
 *   <GameHud/> <QuestionModal/> <DispatchModal/> <SettingsScreen/>
 *   <TutorialOverlay/> <VictoryScreen/> <EventLayer/>
 *
 * الجسر مع المشهد موحّد على `useSceneBridge` (src/scene/bridge.ts)؛
 * bridges.ts غلاف توافقي يفوّض له:
 *   resolveCatapultTarget() — الهدف تحت المُصوَّب (من aimTarget/aimPoint).
 *   openDispatchModalFromScene(target) — فتح نافذة الإرسال (armyTarget).
 *   focusTeamCastle(i) — رحلة كاميرا لبطاقة فريق. goToTitle() — شاشة العنوان.
 */
export { default as GameHud } from './hud/GameHud';
export { default as QuestionModal } from './QuestionModal';
export { default as DispatchModal } from './DispatchModal';
export { default as SettingsScreen } from './settings/SettingsScreen';
export { default as TutorialOverlay } from './TutorialOverlay';
export { default as VictoryScreen } from './VictoryScreen';
export { default as EventLayer } from './event-layer';

// مكونات مشتركة قابلة لإعادة الاستخدام
export { WoodPanel, ModalShell, ReportCard, ConfirmDialog } from './primitives/panels';
export {
  CircularTimer,
  SyncIndicator,
  RankBadge,
  ToastHost,
  DamageFloatHost,
  SkipButton,
  NumberStepper,
  Toggle,
  SliderRow,
  SegmentedControl,
  SettingRow,
  SettingsCard,
  TextAreaPanel,
} from './primitives/widgets';

// متجر الواجهة المحلي + جسور المشهد
export { useUiStore } from './ui-store';
export {
  resolveCatapultTarget,
  openDispatchModalFromScene,
  focusTeamCastle,
  goToTitle,
} from './bridges';
