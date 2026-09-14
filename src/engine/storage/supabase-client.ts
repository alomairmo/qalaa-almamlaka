/**
 * عميل Supabase REST خالص (fetch فقط — بلا @supabase/supabase-js).
 *
 * يربط لعبة «قلاع المملكة» بقاعدة المشروع التعليمي:
 * - جدول `marks`: تعريفات المجموعات `grpdef:<CLASS>` ودرجاتها الأسبوعية
 *   `grp:<CLASS>:<groupId>` (student_idx=0, criterion_idx=0, value=رقم كنص).
 * - جدول `qalaa_saves`: حفظ سحابي لكل (class_key, week) — state/events JSONB.
 *
 * كل الدوال async ومحصّنة: أي فشل شبكة/تحليل → null/false/[] (لا رمي أبدًا)
 * حتى لا ينكسر اللعب المحلي بسبب انقطاع الشبكة.
 *
 * الترويسات: apikey + Authorization: Bearer <anon-key>
 * الكتابة: POST مع Prefer: resolution=merge-duplicates (upsert على PK).
 */
import type { GameEvent, GameState } from '@/contracts/types';

/** القيم الافتراضية لمشروع Supabase القائم (مفتاح anon عام — آمن للتضمين) */
export const DEFAULT_SUPABASE_URL = 'https://lazyikoawttfcflpdixs.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_RNdKa5FTqDB4KAPSpYP4lg_jIcwVjVI';

/** يمكن تجاوزها بمتغيرات البناء VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY */
function resolveUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
}
function resolveKey(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
}

export interface SupabaseRestConfig {
  url?: string;
  key?: string;
}

/** تعريف مجموعة داخل صف (مخزّن في value لصف grpdef:<CLASS>) */
export interface GroupDef {
  id: number;
  name: string;
  leader?: number;
  members?: unknown[];
}

/** حفظ سحابي لجلسة (صف، أسبوع) */
export interface CloudSave {
  state: GameState;
  events: GameEvent[];
  updatedAt: string | null;
}

// ─────────────────────────────────────────────
// طبقة REST المنخفضة
// ─────────────────────────────────────────────

function headers(key: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** GET على PostgREST — يعيد مصفوفة الصفوف أو null عند أي فشل */
export async function restGet<T = Record<string, unknown>>(
  path: string,
  cfg?: SupabaseRestConfig,
): Promise<T[] | null> {
  try {
    const res = await fetch(`${resolveUrl()}/rest/v1/${path}`, {
      headers: headers(cfg?.key ?? resolveKey()),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as T[]) : null;
  } catch {
    return null;
  }
}

/** UPSERT على PostgREST (merge-duplicates على المفتاح الأساسي) */
export async function restUpsert(
  table: string,
  row: Record<string, unknown>,
  cfg?: SupabaseRestConfig,
): Promise<boolean> {
  try {
    const res = await fetch(`${resolveUrl()}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers(cfg?.key ?? resolveKey(), {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(row),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** DELETE على PostgREST */
export async function restDelete(
  path: string,
  cfg?: SupabaseRestConfig,
): Promise<boolean> {
  try {
    const res = await fetch(`${resolveUrl()}/rest/v1/${path}`, {
      method: 'DELETE',
      headers: headers(cfg?.key ?? resolveKey()),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// محلّلات (نقية — قابلة للاختبار)
// ─────────────────────────────────────────────

/** تحليل value لصف grpdef:<CLASS> → قائمة تعريفات المجموعات */
export function parseGroupDefs(value: unknown): GroupDef[] {
  try {
    const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    if (!Array.isArray(raw)) return [];
    const defs: GroupDef[] = [];
    for (const item of raw) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as GroupDef).id === 'number' &&
        typeof (item as GroupDef).name === 'string'
      ) {
        const g = item as GroupDef;
        defs.push({ id: g.id, name: g.name, leader: g.leader, members: g.members });
      }
    }
    return defs;
  } catch {
    return [];
  }
}

/** تحليل value لدرجة أسبوعية ("20"، 20، …) → رقم أو null */
export function parseScore(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** استخراج groupId من class_key بصيغة grp:<CLASS>:<groupId> */
export function parseGroupIdFromKey(classKey: unknown, classPrefix: string): number | null {
  if (typeof classKey !== 'string') return null;
  const prefix = `grp:${classPrefix}:`;
  if (!classKey.startsWith(prefix)) return null;
  const id = Number(classKey.slice(prefix.length));
  return Number.isFinite(id) ? id : null;
}

// ─────────────────────────────────────────────
// عمليات الربط الخاصة باللعبة
// ─────────────────────────────────────────────

/** سرد الصفوف التي لها تعريفات مجموعات (class_key مثل grpdef:g4 → 'g4') */
export async function listLinkedClasses(cfg?: SupabaseRestConfig): Promise<string[]> {
  const rows = await restGet<{ class_key: string }>(
    'marks?select=class_key&class_key=like.grpdef:*',
    cfg,
  );
  if (!rows) return [];
  const out = new Set<string>();
  for (const r of rows) {
    if (typeof r.class_key === 'string' && r.class_key.startsWith('grpdef:')) {
      out.add(r.class_key.slice('grpdef:'.length));
    }
  }
  return [...out].sort();
}

/** سرد الأسابيع الموجودة لصف معيّن (من صفوف grp:<CLASS>:*) */
export async function listLinkedWeeks(classKey: string, cfg?: SupabaseRestConfig): Promise<number[]> {
  const rows = await restGet<{ week: number }>(
    `marks?select=week&class_key=like.grp:${encodeURIComponent(classKey)}:*`,
    cfg,
  );
  if (!rows) return [];
  const weeks = new Set<number>();
  for (const r of rows) {
    const w = Number(r.week);
    if (Number.isInteger(w) && w > 0) weeks.add(w);
  }
  return [...weeks].sort((a, b) => a - b);
}

/** جلب تعريفات مجموعات صف */
export async function fetchGroupDefs(classKey: string, cfg?: SupabaseRestConfig): Promise<GroupDef[]> {
  const rows = await restGet<{ value: unknown }>(
    `marks?select=value&class_key=eq.grpdef:${encodeURIComponent(classKey)}`,
    cfg,
  );
  if (!rows || rows.length === 0) return [];
  return parseGroupDefs(rows[0].value);
}

/** جلب درجات كل مجموعات صف في أسبوع → خريطة groupId → ذهب */
export async function fetchGroupScores(
  classKey: string,
  week: number,
  cfg?: SupabaseRestConfig,
): Promise<Record<number, number>> {
  const rows = await restGet<{ class_key: string; value: unknown }>(
    `marks?select=class_key,value&class_key=like.grp:${encodeURIComponent(classKey)}:*` +
      `&week=eq.${week}&student_idx=eq.0&criterion_idx=eq.0`,
    cfg,
  );
  const out: Record<number, number> = {};
  if (!rows) return out;
  for (const r of rows) {
    const gid = parseGroupIdFromKey(r.class_key, classKey);
    const score = parseScore(r.value);
    if (gid !== null && score !== null) out[gid] = score;
  }
  return out;
}

/** رفع ذهب مجموعة لأسبوع (upsert على marks) */
export async function upsertGroupScore(
  classKey: string,
  groupId: number,
  week: number,
  gold: number,
  cfg?: SupabaseRestConfig,
): Promise<boolean> {
  return restUpsert(
    'marks',
    {
      class_key: `grp:${classKey}:${groupId}`,
      week,
      student_idx: 0,
      criterion_idx: 0,
      value: String(Math.round(gold)),
    },
    cfg,
  );
}

// ── الحفظ السحابي (qalaa_saves) ──────────────

/** تحميل الحفظ السحابي لـ (صف، أسبوع) — أو null */
export async function loadCloudSave(
  classKey: string,
  week: number,
  cfg?: SupabaseRestConfig,
): Promise<CloudSave | null> {
  const rows = await restGet<{ state: unknown; events: unknown; updated_at: string | null }>(
    `qalaa_saves?select=state,events,updated_at&class_key=eq.${encodeURIComponent(classKey)}&week=eq.${week}`,
    cfg,
  );
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  if (!row.state || typeof row.state !== 'object') return null;
  return {
    state: row.state as GameState,
    events: Array.isArray(row.events) ? (row.events as GameEvent[]) : [],
    updatedAt: row.updated_at ?? null,
  };
}

/** كتابة الحفظ السحابي لـ (صف، أسبوع) (upsert) */
export async function writeCloudSave(
  classKey: string,
  week: number,
  state: GameState,
  events: GameEvent[],
  cfg?: SupabaseRestConfig,
): Promise<boolean> {
  return restUpsert(
    'qalaa_saves',
    {
      class_key: classKey,
      week,
      state,
      events,
      updated_at: new Date().toISOString(),
    },
    cfg,
  );
}

/** مسح الحفظ السحابي لـ (صف، أسبوع) فقط */
export async function deleteCloudSave(
  classKey: string,
  week: number,
  cfg?: SupabaseRestConfig,
): Promise<boolean> {
  return restDelete(
    `qalaa_saves?class_key=eq.${encodeURIComponent(classKey)}&week=eq.${week}`,
    cfg,
  );
}
