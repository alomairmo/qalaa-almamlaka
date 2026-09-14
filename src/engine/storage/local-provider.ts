/**
 * المزوّد المحلي للتخزين — فعّال 100% بلا إنترنت (design.md §10).
 * - localStorage: لقطة الحالة (مفتاح qalaa-almamlaka:game-save — نفس مفتاح
 *   وكيل الأساس في lib/season-info.ts)، بنك الأسئلة، مجلد الأحداث، إعدادات السحابة.
 * - IndexedDB: بلوبات المجسمات المرفوعة (تبويب المجسمات §15-3).
 */
import type { GameEvent, GameState, Question } from '@/contracts/types';
import type { CloudSyncConfig, ModelAsset, SaveResult, StorageProvider, SyncStatus } from '@/contracts/storage';

/** مفاتيح التخزين المحلي */
export const STORAGE_KEYS = {
  gameSave: 'qalaa-almamlaka:game-save',
  questions: 'qalaa-almamlaka:questions',
  events: 'qalaa-almamlaka:events',
  cloudConfig: 'qalaa-almamlaka:cloud-config',
} as const;

/** الحد الأقصى لأحداث المجلد المحفوظة محليًا */
const EVENT_JOURNAL_CAP = 1000;
/** الحد الأقصى لحجم المجسم المرفوع (5MB) — design.md §0 */
export const MAX_MODEL_BYTES = 5 * 1024 * 1024;

const IDB_NAME = 'qalaa-almamlaka';
const IDB_STORE = 'models';

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/** فتح/إنشاء قاعدة IndexedDB لمخزن المجسمات */
function openModelsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB غير متوفرة في هذه البيئة'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('فشل فتح IndexedDB'));
  });
}

interface StoredModelRecord extends ModelAsset {
  blob: Blob;
}

export class LocalStorageProvider implements StorageProvider {
  // ── حالة اللعبة ─────────────────────────────

  async loadGame(): Promise<GameState | null> {
    return this.loadGameSync();
  }

  /** قراءة متزامنة (يستخدمها المتجر لاستئناف الموسم دون await) */
  loadGameSync(): GameState | null {
    if (!hasLocalStorage()) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.gameSave);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GameState;
      if (!parsed || !Array.isArray(parsed.teams)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async saveGame(state: GameState): Promise<SaveResult> {
    if (!hasLocalStorage()) return { ok: false, at: Date.now(), error: 'localStorage غير متوفرة' };
    try {
      const snapshot: GameState = { ...state, lastSavedAt: Date.now() };
      localStorage.setItem(STORAGE_KEYS.gameSave, JSON.stringify(snapshot));
      return { ok: true, at: snapshot.lastSavedAt ?? Date.now() };
    } catch (e) {
      return { ok: false, at: Date.now(), error: e instanceof Error ? e.message : 'فشل الحفظ المحلي' };
    }
  }

  async clearGame(): Promise<void> {
    if (!hasLocalStorage()) return;
    localStorage.removeItem(STORAGE_KEYS.gameSave);
    localStorage.removeItem(STORAGE_KEYS.events);
  }

  async appendEvent(event: GameEvent): Promise<void> {
    if (!hasLocalStorage()) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.events);
      const journal: GameEvent[] = raw ? (JSON.parse(raw) as GameEvent[]) : [];
      journal.push(event);
      if (journal.length > EVENT_JOURNAL_CAP) journal.splice(0, journal.length - EVENT_JOURNAL_CAP);
      localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(journal));
    } catch {
      // المجلد مساعد فقط — لا نفشل الحفظ الأساسي بسببه
    }
  }

  // ── بنك الأسئلة ──────────────────────────────

  async loadQuestions(): Promise<Question[]> {
    if (!hasLocalStorage()) return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.questions);
      return raw ? (JSON.parse(raw) as Question[]) : [];
    } catch {
      return [];
    }
  }

  async saveQuestions(questions: Question[]): Promise<SaveResult> {
    if (!hasLocalStorage()) return { ok: false, at: Date.now(), error: 'localStorage غير متوفرة' };
    try {
      localStorage.setItem(STORAGE_KEYS.questions, JSON.stringify(questions));
      return { ok: true, at: Date.now() };
    } catch (e) {
      return { ok: false, at: Date.now(), error: e instanceof Error ? e.message : 'فشل حفظ الأسئلة' };
    }
  }

  // ── مكتبة المجسمات (IndexedDB) ───────────────

  async uploadModel(file: File, elementKey: string): Promise<ModelAsset> {
    if (file.size > MAX_MODEL_BYTES) {
      throw new Error(`حجم المجسم يتجاوز الحد الأقصى ${MAX_MODEL_BYTES / 1024 / 1024}MB`);
    }
    const asset: ModelAsset = {
      id: `mdl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      elementKey,
      filename: file.name,
      sizeBytes: file.size,
      scale: 1,
      pivot: { x: 0, y: 0, z: 0 },
      uploadedAt: Date.now(),
    };
    const record: StoredModelRecord = { ...asset, blob: file };
    const db = await openModelsDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('فشل تخزين المجسم'));
      });
    } finally {
      db.close();
    }
    return asset;
  }

  async listModels(): Promise<ModelAsset[]> {
    const db = await openModelsDb();
    try {
      return await new Promise<ModelAsset[]>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => {
          const records = (req.result ?? []) as StoredModelRecord[];
          resolve(records.map(({ blob: _blob, ...meta }) => meta));
        };
        req.onerror = () => reject(req.error ?? new Error('فشل سرد المجسمات'));
      });
    } finally {
      db.close();
    }
  }

  async getModelBlob(id: string): Promise<Blob | null> {
    const db = await openModelsDb();
    try {
      return await new Promise<Blob | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = () => {
          const record = req.result as StoredModelRecord | undefined;
          resolve(record?.blob ?? null);
        };
        req.onerror = () => reject(req.error ?? new Error('فشل قراءة المجسم'));
      });
    } finally {
      db.close();
    }
  }

  async deleteModel(id: string): Promise<void> {
    const db = await openModelsDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('فشل حذف المجسم'));
      });
    } finally {
      db.close();
    }
  }

  async updateModelSettings(id: string, patch: Partial<Pick<ModelAsset, 'scale' | 'pivot'>>): Promise<void> {
    const db = await openModelsDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const record = getReq.result as StoredModelRecord | undefined;
          if (!record) {
            reject(new Error(`المجسم غير موجود: ${id}`));
            return;
          }
          store.put({ ...record, ...patch });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('فشل تحديث ضبط المجسم'));
      });
    } finally {
      db.close();
    }
  }

  // ── المزامنة السحابية (إعدادات فقط — بلا شبكة) ─

  getSyncStatus(): SyncStatus {
    // المحلي هو الأساس دائمًا في v1 — design.md §9.6
    return 'unconfigured';
  }

  async saveCloudConfig(config: CloudSyncConfig): Promise<void> {
    if (!hasLocalStorage()) return;
    localStorage.setItem(STORAGE_KEYS.cloudConfig, JSON.stringify(config));
  }

  async loadCloudConfig(): Promise<CloudSyncConfig | null> {
    if (!hasLocalStorage()) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.cloudConfig);
      return raw ? (JSON.parse(raw) as CloudSyncConfig) : null;
    } catch {
      return null;
    }
  }
}
