/**
 * واجهة حزمة المشهد — ما يحتاجه وكيل الدمج/الواجهة:
 *
 * - `<GameCanvas/>` بلا props: المشهد كامل الشاشة (z-0)، يقرأ طور اللعبة من
 *   useGameStore وينفّذ كل الكاميرات والأنيميشن داخليًا.
 *
 * - جسر المشهد (scene/bridge) — الحالات العرضية التي لا تغطيها العقود المجمّدة:
 *   - `useSceneBridge`: power/charging/aimTarget/aimPoint (واجهة المنجنيق)،
 *     armyTarget (نافذة الإرسال في وضع الجيش — النقر على هدف في المشهد
 *     يملؤه؛ الواجهة تفتح النافذة وتستدعي engineApi.dispatchArmy ثم
 *     selectArmyTarget(null)).
 *   - `fireFromBridge(power?)`: إطلاق في نمط «المقبض المتحرك».
 *   - `selectArmyTarget`, `setAim`, `setCharging`, `pushFloat`,
 *     `celebrateTeam`, `shakeScreen`.
 */
export { default as GameCanvas } from './GameCanvas';
export {
  useSceneBridge,
  fireFromBridge,
  selectArmyTarget,
  setAim,
  setCharging,
  setPower,
  focusTeamByIndex,
  pushFloat,
  celebrateTeam,
  shakeScreen,
  setBattleFx,
  setCatapultFx,
  setCatapultYaw,
  setStickyHold,
  confirmSticky,
  requestSceneRemount,
  createStickyGate,
  stickyGateReleased,
  STICKY_FALLBACK_MS,
} from './bridge';
export type {
  FloatText,
  CameraJob,
  LastShot,
  BattleFxPhase,
  BattleFxState,
  CatapultFxPhase,
  CatapultFxState,
  StickyKind,
  StickyHold,
  StickyConfirm,
  StickyGate,
} from './bridge';
