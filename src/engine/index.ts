/**
 * نقطة دخول المحرك — يستهلكها وكيلا المشهد والواجهة مباشرة.
 */
export {
  useGameStore,
  engineApi,
  setEngineSeed,
  ackEvents,
  clearEvents,
  returnToTitle,
  tutorialNext,
  currentTutorialStep,
  currentTeamId,
  canFireCatapultNow,
  refreshSyncStatus,
  startLinkedSeason,
  resumeLinkedSeason,
  resetLinkedSeason,
  hasLinkedSave,
  unlinkSeason,
  currentLinkSession,
  type QuestionView,
  type TimerState,
} from './store';
export { getLinkSession, getLinkStatus, type LinkSession } from './link-session';
export { createRng, type RNG } from './rng';
export { TUTORIAL_STEPS, TUTORIAL_STEP_COUNT, createTutorialState, type TutorialStep } from './tutorial-script';
export { computeTrajectory, catapultOrigin, castlePosition, castleTopHeight, type TrajectoryResult } from './logic/geometry';
export { parseQuestionBank, pickQuestionForTeam, buildQuestionView } from './logic/questions';
export { teamTotalGold } from './logic/season';
export { goldCapacity, soldierCapacity } from './logic/economy';
export { canUseCatapult } from './logic/catapult';
export { battleWinnerTeamId, didTeamWinBattle, battleDeathSide } from './logic/combat';
export { getActiveProvider, getSupabaseProvider, getSyncStatus, saveCloudConfig } from './storage/sync-manager';
export { LocalStorageProvider, STORAGE_KEYS, MAX_MODEL_BYTES } from './storage/local-provider';
export { SupabaseProvider } from './storage/supabase-provider';
