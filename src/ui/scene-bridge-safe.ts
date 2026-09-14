/**
 * وصول دفاعي لحقول جسر المشهد الجديدة (تُضاف بالتوازي في فرع المشهد):
 * stickyHold / setStickyHold / confirmSticky / catapultFx / setCatapultYaw / catapultYaw.
 *
 * قد تُنفَّذ كحقول داخل متجر useSceneBridge أو كدوال مصدّرة من الوحدة
 * (نمط setBattleFx/setPower الحالي)، وقد لا توجد أصلًا قبل دمج فرع المشهد —
 * لذا كل وصول هنا عبر فحص typeof وتحويل نوعي، وأي نداء غير موجود يُتجاهل بصمت.
 * النمط نفسه المتبع لقراءة battleFx في event-layer.tsx.
 */
import * as bridgeModule from '@/scene/bridge';
import { useSceneBridge } from '@/scene/bridge';

/** نوع البطاقة الثابتة المعروضة حاليًا (عقد الجسر مع المشهد) */
export type StickyKind = 'recruit' | 'battle' | 'catapult' | 'loot';

export interface StickyHold {
  eventId: string;
  kind: StickyKind;
}

export interface CatapultFxState {
  eventId: string | null;
  phase: 'flying' | 'impact' | 'done' | null;
}

type AnyFn = (...args: never[]) => unknown;

/** يجلب دالة من الجسر: حقل المتجر أولًا ثم تصدير الوحدة — undefined إن غابت */
function bridgeFn(name: string): AnyFn | undefined {
  try {
    const st = useSceneBridge.getState() as unknown as Record<string, unknown>;
    const fromStore = st?.[name];
    if (typeof fromStore === 'function') return fromStore as AnyFn;
    const fromModule = (bridgeModule as unknown as Record<string, unknown>)[name];
    if (typeof fromModule === 'function') return fromModule as AnyFn;
  } catch {
    /* الجسر غير جاهز */
  }
  return undefined;
}

/** نداء دفاعي لدالة جسر قد لا توجد — يُتجاهل بصمت عند غيابها */
export function callBridge(name: string, ...args: unknown[]): void {
  try {
    (bridgeFn(name) as ((...a: unknown[]) => unknown) | undefined)?.(...args);
  } catch {
    /* لا نكسر الواجهة بسبب جسر ناقص */
  }
}

/** إعلام المشهد ببطاقة ثابتة معروضة (أو مسح الإعلام بـ null) */
export function setStickyHoldSafe(hold: StickyHold | null): void {
  callBridge('setStickyHold', hold);
}

/** تأكيد بطاقة ثابتة لدى المشهد (يُنهي أي أنيميشن مرتبط بها) */
export function confirmStickySafe(eventId: string): void {
  callBridge('confirmSticky', eventId);
}

/** ضبط زاوية التفاف المنجنيق (راديان) — نمط «المقبض المتحرك» */
export function setCatapultYawSafe(yawRad: number): void {
  callBridge('setCatapultYaw', yawRad);
}

/** قراءة تفاعلية لحالة البطاقة الثابتة من الجسر (قد تكون undefined) */
export function useBridgeStickyHold(): StickyHold | null | undefined {
  return useSceneBridge((s) => (s as unknown as { stickyHold?: StickyHold | null }).stickyHold);
}

/** قراءة تفاعلية لحالة أنيميشن المنجنيق من الجسر (قد تكون undefined) */
export function useBridgeCatapultFx(): CatapultFxState | undefined {
  return useSceneBridge((s) => (s as unknown as { catapultFx?: CatapultFxState }).catapultFx);
}

/** قراءة تفاعلية لزاوية المنجنيق من الجسر — catapultYaw إن وُجدت وإلا aimYaw */
export function useBridgeCatapultYaw(): number {
  return useSceneBridge(
    (s) => (s as unknown as { catapultYaw?: number }).catapultYaw ?? s.aimYaw ?? 0,
  );
}
