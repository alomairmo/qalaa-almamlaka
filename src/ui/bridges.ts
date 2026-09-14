/**
 * جسور التكامل مع المشهد ثلاثي الأبعاد — واجهة الواجهة (UI) الموحّدة.
 *
 * قرار الدمج: الجسر الوحيد هو متجر `useSceneBridge` من `src/scene/bridge.ts`.
 * هذا الملف مجرد غلاف توافقي يفوّض كل النداءات إلى جسر المشهد حتى لا تتعطل
 * مكونات الواجهة التي بُنيت على هذه الأسماء:
 *
 * - resolveCatapultTarget: يقرأ الهدف تحت المُصوَّب من جسر المشهد
 *   (يحدّثه CatapultRig كل إطار: aimTarget ثم aimPoint كبديل أرضي).
 * - openDispatchModalFromScene: يضبط armyTarget في جسر المشهد — DispatchModal
 *   يقرؤه من هناك مباشرة ويصفّره بـ selectArmyTarget(null) بعد الإرسال/الإلغاء.
 * - focusTeamCastle: رحلة كاميرا استعراضية نحو قلعة مجموعة (مهمة focus في الجسر).
 * - goToTitle: العودة لشاشة العنوان عبر returnToTitle من متجر المحرك.
 */
import type { ArmyTarget, CatapultTarget } from '@/contracts/types';
import { focusTeamByIndex, selectArmyTarget, useSceneBridge } from '@/scene/bridge';
import { returnToTitle } from '@/engine';

/** يعيد الهدف الحالي تحت المُصوَّب، أو null إن لم يكن وضع المنجنيق نشطًا */
export function resolveCatapultTarget(): CatapultTarget | null {
  try {
    const b = useSceneBridge.getState();
    if (b.aimTarget) return b.aimTarget;
    if (b.aimPoint) return { kind: 'ground', position: b.aimPoint };
    return null;
  } catch {
    return null;
  }
}

/** يستدعيها المشهد أو قائمة الأهداف الاحتياطية عند اختيار هدف في وضع الجيش */
export function openDispatchModalFromScene(target: ArmyTarget): void {
  selectArmyTarget(target);
}

/** بثّ رحلة كاميرا استعراضية نحو قلعة مجموعة (نقر بطاقة الفريق) */
export function focusTeamCastle(teamIndex: number): void {
  focusTeamByIndex(teamIndex);
}

/** العودة لشاشة العنوان — مربوطة بمدير الشاشات عبر طور المحرك 'title' */
export function goToTitle(): void {
  returnToTitle();
}
