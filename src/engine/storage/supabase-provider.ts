/**
 * مزوّد Supabase — عميل REST حقيقي (fetch خالص) مربوط بقاعدة المشروع التعليمي.
 *
 * - جدول `marks`: تعريفات المجموعات (`grpdef:<CLASS>`) ودرجاتها الأسبوعية
 *   (`grp:<CLASS>:<groupId>`, week=N, student_idx=0, criterion_idx=0).
 * - جدول `qalaa_saves`: حفظ سحابي مستقل لكل (class_key, week).
 *
 * كل الدوال محصّنة: الفشل → null/false/[] ولا يُرمى أي خطأ يكسر اللعب.
 * التفاصيل في supabase-client.ts وSUPABASE_SETUP.md.
 */
import type { GameEvent, GameState } from '@/contracts/types';
import type { CloudSyncConfig, SyncStatus } from '@/contracts/storage';
import { STORAGE_KEYS } from './local-provider';
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  deleteCloudSave,
  fetchGroupDefs,
  fetchGroupScores,
  listLinkedClasses,
  listLinkedWeeks,
  loadCloudSave,
  upsertGroupScore,
  writeCloudSave,
  type CloudSave,
  type GroupDef,
  type SupabaseRestConfig,
} from './supabase-client';

export class SupabaseProvider {
  private config: SupabaseRestConfig | null = null;

  /** تهيئة اختيارية بإعدادات مخصّصة؛ بلا إعدادات تُستخدم قيم المشروع الافتراضية */
  constructor(config?: CloudSyncConfig | null) {
    this.config = config ? { url: config.projectUrl, key: config.anonKey } : null;
  }

  /** القيم الافتراضية مضمّنة — المزوّد جاهز دائمًا ما لم تُضبط إعدادات ناقصة */
  isConfigured(): boolean {
    return true;
  }

  /** إعدادات REST الممرّرة لدوال العميل (undefined ⇒ الافتراضيات/env) */
  private cfg(): SupabaseRestConfig | undefined {
    return this.config ?? undefined;
  }

  // ── الاستكشاف ───────────────────────────────

  /** الصفوف ذات تعريفات المجموعات (مثل ['g4','g5']) */
  listClasses(): Promise<string[]> {
    return listLinkedClasses(this.cfg());
  }

  /** الأسابيع الموجودة لصف (مثل [1,2,3,4]) */
  listWeeks(classKey: string): Promise<number[]> {
    return listLinkedWeeks(classKey, this.cfg());
  }

  /** تعريفات مجموعات صف */
  groupDefs(classKey: string): Promise<GroupDef[]> {
    return fetchGroupDefs(classKey, this.cfg());
  }

  /** درجات مجموعات صف في أسبوع: groupId → ذهب */
  groupScores(classKey: string, week: number): Promise<Record<number, number>> {
    return fetchGroupScores(classKey, week, this.cfg());
  }

  // ── مزامنة الذهب ────────────────────────────

  /** رفع إجمالي ذهب مجموعة لأسبوع (upsert على marks) */
  pushGroupGold(classKey: string, groupId: number, week: number, gold: number): Promise<boolean> {
    return upsertGroupScore(classKey, groupId, week, gold, this.cfg());
  }

  // ── الحفظ السحابي (qalaa_saves) ─────────────

  loadSave(classKey: string, week: number): Promise<CloudSave | null> {
    return loadCloudSave(classKey, week, this.cfg());
  }

  saveSave(classKey: string, week: number, state: GameState, events: GameEvent[]): Promise<boolean> {
    return writeCloudSave(classKey, week, state, events, this.cfg());
  }

  deleteSave(classKey: string, week: number): Promise<boolean> {
    return deleteCloudSave(classKey, week, this.cfg());
  }

  // ── المزامنة/الإعدادات ──────────────────────

  getSyncStatus(): SyncStatus {
    return 'unconfigured';
  }

  /** حفظ إعدادات اتصال مخصّصة محليًا (تجاوز القيم الافتراضية) */
  async saveCloudConfig(config: CloudSyncConfig): Promise<void> {
    this.config = { url: config.projectUrl, key: config.anonKey };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.cloudConfig, JSON.stringify(config));
      }
    } catch {
      /* بيئة بلا localStorage */
    }
  }

  async loadCloudConfig(): Promise<CloudSyncConfig | null> {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(STORAGE_KEYS.cloudConfig);
      const parsed = raw ? (JSON.parse(raw) as CloudSyncConfig) : null;
      if (parsed?.projectUrl && parsed?.anonKey) {
        this.config = { url: parsed.projectUrl, key: parsed.anonKey };
      }
      return parsed;
    } catch {
      return null;
    }
  }
}

export { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY };
export type { CloudSave, GroupDef };
