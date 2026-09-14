/**
 * ⚠️ عقد مجمّد — لا تعدّل دون تنسيق مع المنسّق
 *
 * قلاع المملكة — واجهة طبقة التخزين StorageProvider.
 * المرجع: design.md §10 (Supabase-Ready, Local-First — غير متصل).
 *
 * البنية: التخزين المحلي أولًا (LocalStorageProvider — IndexedDB لبلوبات
 * المجسمات + localStorage للقطة الحالة ومجلد الأحداث)، مع مزود Supabase
 * جاهز بنفس التواقيع تمامًا (stub بلا أي استدعاءات شبكة في v1).
 */

import type { GameEvent, GameState, Question } from './types';

/** حالة المزامنة — تظهر في SyncIndicator (design.md §9.6) */
export type SyncStatus =
  | 'unconfigured' // ⚪ غير مُعدّ — يعمل محليًا (الوضع الافتراضي)
  | 'local-only'   // 🟠 محلي فقط — المزامنة معطلة/منقطعة
  | 'syncing'      // 🟠 جارٍ الرفع إلى Supabase (جلسة مرتبطة نشطة)
  | 'synced'       // 🟢 متصل ومُزامَن
  | 'error';       // 🔴 فشلت آخر مزامنة — ستُعاد المحاولة تلقائيًا

/** بيانات مجسم ثلاثي الأبعاد مرفوع من تبويب المجسمات — §15 تبويب 3 */
export interface ModelAsset {
  id: string;
  /** اسم العنصر المستهدف: castle-base / floor-empty / floor-1soldier / soldier-novice-walk … */
  elementKey: string;
  /** اسم الملف الأصلي (glb/gltf) */
  filename: string;
  /** حجم الملف بالبايت (الحد الأقصى 5MB) */
  sizeBytes: number;
  /** مقياس التكبير/التصغير (افتراضي 1) */
  scale: number;
  /** نقطة الارتكاز — لضمان وقوف المجسم صحيحًا على الأرض أو فوق الطابق */
  pivot: { x: number; y: number; z: number };
  /** ختم الرفع (ms) */
  uploadedAt: number;
}

/** إعدادات الربط السحابي المحفوظة محليًا (بلا أي اتصال فعلي في v1) */
export interface CloudSyncConfig {
  projectUrl: string;
  anonKey: string;
}

/** نتيجة حفظ/تحميل */
export interface SaveResult {
  ok: boolean;
  at: number;
  error?: string;
}

export interface StorageProvider {
  // ── حالة اللعبة ─────────────────────────────

  /** تحميل آخر لقطة محفوظة لحالة اللعبة — يرجع null إن لم يوجد موسم */
  loadGame(): Promise<GameState | null>;

  /** حفظ لقطة الحالة (يُستدعى تلقائيًا بعد كل حدث) */
  saveGame(state: GameState): Promise<SaveResult>;

  /** حذف الحفظ (عند تصفير اللعبة) */
  clearGame(): Promise<void>;

  /** إلحاق حدث بمجلد الأحداث (game_events journal) */
  appendEvent(event: GameEvent): Promise<void>;

  // ── بنك الأسئلة ──────────────────────────────

  /** تحميل بنك الأسئلة المحفوظ */
  loadQuestions(): Promise<Question[]>;

  /** حفظ بنك الأسئلة */
  saveQuestions(questions: Question[]): Promise<SaveResult>;

  // ── مكتبة المجسمات ثلاثية الأبعاد ────────────

  /** رفع مجسم (ملف GLB/GLTF ≤ 5MB) — يخزَّن محليًا في IndexedDB */
  uploadModel(file: File, elementKey: string): Promise<ModelAsset>;

  /** سرد كل المجسمات المرفوعة */
  listModels(): Promise<ModelAsset[]>;

  /** قراءة بلوب مجسم بالمعرّف (للتحميل في المشهد) */
  getModelBlob(id: string): Promise<Blob | null>;

  /** حذف مجسم */
  deleteModel(id: string): Promise<void>;

  /** تحديث ضبط مجسم (الحجم / نقطة الارتكاز) */
  updateModelSettings(id: string, patch: Partial<Pick<ModelAsset, 'scale' | 'pivot'>>): Promise<void>;

  // ── المزامنة السحابية (جاهزة — غير متصلة) ────

  /** حالة المزامنة الحالية */
  getSyncStatus(): SyncStatus;

  /** حفظ إعدادات Supabase محليًا (لا يجري أي اتصال شبكة في v1) */
  saveCloudConfig(config: CloudSyncConfig): Promise<void>;

  /** قراءة إعدادات Supabase المحفوظة محليًا */
  loadCloudConfig(): Promise<CloudSyncConfig | null>;
}
