/**
 * متجر واجهة محلي (زائد عن متجر المحرك) — حالات عرض خالصة:
 * التوستات وأرقام الضرر العائمة.
 * لا يُحفظ ولا يؤثر في منطق اللعبة.
 *
 * ملاحظة دمج: هدف نافذة الإرسال انتقل إلى جسر المشهد الموحّد
 * (useSceneBridge.armyTarget في src/scene/bridge.ts).
 */
import { create } from 'zustand';
import type { StickyKind } from './scene-bridge-safe';

export interface ToastItem {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'danger';
}

export interface FloatItem {
  id: number;
  text: string;
  color: 'red' | 'gold' | 'green' | 'gray';
}

interface UiStore {
  toasts: ToastItem[];
  floats: FloatItem[];
  addToast: (text: string, kind?: ToastItem['kind']) => void;
  removeToast: (id: number) => void;
  addFloat: (text: string, color?: FloatItem['color']) => void;
  removeFloat: (id: number) => void;
  /**
   * البطاقة الثابتة المعروضة حاليًا في العمود الأيسر (يضبطها EventLayer) —
   * تقرؤها لوحة الموارد لتختفي مؤقتًا وتترك مكانها للبطاقة.
   */
  stickyCard: { eventId: string; kind: StickyKind } | null;
  setStickyCard: (card: { eventId: string; kind: StickyKind } | null) => void;
  /**
   * عدّاد إشارة «أغلق البطاقة الثابتة» (يرفعه TutorialOverlay عند «التالي»
   * ويستمع له EventLayer فيؤكّد البطاقة كأن المستخدم ضغط «تأكيد ✓»).
   */
  stickyCloseSignal: number;
  requestStickyClose: () => void;
}

let seq = 1;

export const useUiStore = create<UiStore>((set) => ({
  toasts: [],
  floats: [],
  stickyCard: null,
  stickyCloseSignal: 0,
  setStickyCard: (card) => set({ stickyCard: card }),
  requestStickyClose: () => set((s) => ({ stickyCloseSignal: s.stickyCloseSignal + 1 })),
  addToast: (text, kind = 'info') => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    window.setTimeout(() => {
      useUiStore.getState().removeToast(id);
    }, 3000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  addFloat: (text, color = 'red') => {
    const id = seq++;
    set((s) => ({ floats: [...s.floats.slice(-5), { id, text, color }] }));
    window.setTimeout(() => {
      useUiStore.getState().removeFloat(id);
    }, 1300);
  },
  removeFloat: (id) => set((s) => ({ floats: s.floats.filter((f) => f.id !== id) })),
}));
