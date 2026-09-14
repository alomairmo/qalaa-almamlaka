/**
 * مدير المزامنة — يختار المزوّد الفعّال ويدير حالة المزامنة.
 * v1: المحلي دائمًا هو الفعّال، وSupabase جاهز غير مربوط (design.md §10).
 * عند تفعيل Supabase لاحقًا: يكفي تبديل chooseProvider() ليعيد
 * SupabaseProvider عند وجود إعدادات صالحة، وتُضاف مزامنة خلفية
 * (دفع الحالة المحلية للسحابة عند توفر الاتصال، وسحبها عند الإقلاع).
 */
import type { CloudSyncConfig, StorageProvider, SyncStatus } from '@/contracts/storage';
import { LocalStorageProvider, STORAGE_KEYS } from './local-provider';
import { SupabaseProvider } from './supabase-provider';

/** المزوّد المحلي الوحيد المفعّل حاليًا (Singleton) */
const localProvider = new LocalStorageProvider();
const supabaseProvider = new SupabaseProvider();

/**
 * اختيار المزوّد الفعّال. حاليًا: محلي دائمًا.
 * TODO(supabase): عند التفعيل، أعد supabaseProvider إن وُجدت إعدادات مكتملة
 * واتصال متاح، مع إبقاء المحلي طبقة أولى (Local-First) والسحابة نسخة احتياطية.
 */
export function getActiveProvider(): StorageProvider {
  return localProvider;
}

/** مزوّد Supabase (لشاشة الإعدادات — حفظ بيانات الاتصال فقط) */
export function getSupabaseProvider(): SupabaseProvider {
  return supabaseProvider;
}

/** قراءة إعدادات الاتصال المحفوظة محليًا (بلا شبكة) */
export function readCloudConfig(): CloudSyncConfig | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEYS.cloudConfig);
    return raw ? (JSON.parse(raw) as CloudSyncConfig) : null;
  } catch {
    return null;
  }
}

/**
 * حالة المزامنة الحالية:
 * - 'unconfigured' (⚪): لا إعدادات Supabase — الوضع الافتراضي.
 * - 'local-only' (🟠): إعدادات محفوظة لكن المزامنة غير مفعّلة/منقطعة.
 * - 'synced' (🟢): متصل ومُزامَن (مستقبلًا عند تفعيل SupabaseProvider).
 */
export function getSyncStatus(): SyncStatus {
  const cfg = readCloudConfig();
  if (cfg?.projectUrl && cfg?.anonKey) return 'local-only';
  return 'unconfigured';
}

/**
 * حفظ إعدادات الاتصال محليًا (من تبويب «المزامنة السحابية» في الإعدادات).
 * لا يجري أي طلب شبكة — مجرد تخزين.
 */
export async function saveCloudConfig(config: CloudSyncConfig): Promise<void> {
  await localProvider.saveCloudConfig(config);
}
