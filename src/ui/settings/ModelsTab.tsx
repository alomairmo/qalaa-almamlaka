/**
 * تبويب ③ المجسمات — مكتبة النماذج ثلاثية الأبعاد (settings.md §4 + وثيقة §15).
 * رفع GLB/GLTF (≤5MB) لكل عنصر عبر StorageProvider (uploadModel/listModels/
 * deleteModel/updateModelSettings) — تخزين محلي IndexedDB، جاهز لـ Supabase Storage.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Upload } from 'lucide-react';
import { getActiveProvider, MAX_MODEL_BYTES } from '@/engine';
import type { ModelAsset } from '@/contracts/storage';
import { useSound } from '@/audio';
import { useUiStore } from '../ui-store';
import { NumberStepper, SliderRow } from '../primitives/widgets';

interface SlotDef {
  key: string;
  label: string;
}

const ANIMS: Array<[string, string]> = [
  ['idle', 'وقوف'],
  ['walk', 'مشي'],
  ['fight', 'قتال'],
  ['carry-gold', 'حمل ذهب'],
  ['celebrate', 'احتفال'],
  ['death', 'موت'],
];
const RANKS: Array<[string, string]> = [
  ['novice', 'مبتدئ'],
  ['soldier', 'جندي'],
  ['expert', 'خبير'],
];

const CATALOG: Array<{ category: string; slots: SlotDef[] }> = [
  {
    category: 'القلاع',
    slots: [
      { key: 'castle-base', label: 'قاعدة القلعة' },
      { key: 'floor-empty', label: 'طابق — فارغ' },
      { key: 'floor-1soldier', label: 'طابق — جندي واحد' },
      { key: 'floor-2soldiers', label: 'طابق — جنديان' },
      { key: 'dome', label: 'القبة' },
      { key: 'catapult-platform', label: 'منصة المنجنيق' },
    ],
  },
  {
    category: 'الجنود (لكل رتبة × كل أنيميشن)',
    slots: RANKS.flatMap(([r, rl]) => ANIMS.map(([a, al]) => ({ key: `soldier-${r}-${a}`, label: `${rl} — ${al}` }))),
  },
  {
    category: 'المنجنيق والموارد',
    slots: [
      { key: 'catapult', label: 'المنجنيق' },
      ...[1, 2, 3, 4, 5].map((n) => ({ key: `stone-pile-${n}`, label: `كومة حجارة (${n})` })),
      { key: 'gold-pile', label: 'كومة ذهب' },
    ],
  },
  {
    category: 'البيئة',
    slots: [
      { key: 'ground', label: 'الأرضية' },
      { key: 'tree-cypress', label: 'شجرة سرو' },
      { key: 'tree-palm', label: 'نخلة' },
      { key: 'tree-olive', label: 'زيتونة' },
      { key: 'mountains', label: 'الجبال' },
      { key: 'clouds', label: 'السحب' },
    ],
  },
];

export default function ModelsTab() {
  const sound = useSound();
  const addToast = useUiStore((s) => s.addToast);
  const [models, setModels] = useState<ModelAsset[]>([]);
  const [openCat, setOpenCat] = useState<string | null>(CATALOG[0].category);
  const [adjusting, setAdjusting] = useState<ModelAsset | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef<string | null>(null);

  const refresh = useCallback(() => {
    void getActiveProvider()
      .listModels()
      .then(setModels)
      .catch(() => setModels([]));
  }, []);
  useEffect(refresh, [refresh]);

  const byKey = (key: string) => models.find((m) => m.elementKey === key);

  const pickFile = (slotKey: string) => {
    pendingSlot.current = slotKey;
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    const slotKey = pendingSlot.current;
    pendingSlot.current = null;
    if (!file || !slotKey) return;
    if (!/\.(glb|gltf)$/i.test(file.name)) {
      addToast('الصيغة غير مدعومة — ارفعوا ملف GLB أو GLTF فقط', 'danger');
      return;
    }
    if (file.size > MAX_MODEL_BYTES) {
      addToast('الملف أكبر من 5MB — صغّروا المجسم ثم أعيدوا الرفع', 'danger');
      return;
    }
    setBusy(slotKey);
    try {
      const existing = byKey(slotKey);
      if (existing) await getActiveProvider().deleteModel(existing.id);
      await getActiveProvider().uploadModel(file, slotKey);
      refresh();
      addToast('تم رفع المجسم وتفعيله ✓', 'success');
    } catch {
      addToast('تعذّر رفع المجسم', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m: ModelAsset) => {
    await getActiveProvider().deleteModel(m.id).catch(() => undefined);
    setAdjusting(null);
    refresh();
  };

  const saveAdjust = async (m: ModelAsset, patch: Partial<Pick<ModelAsset, 'scale' | 'pivot'>>) => {
    const next = { ...m, ...patch, pivot: { ...m.pivot, ...(patch.pivot ?? {}) } };
    setAdjusting(next);
    await getActiveProvider().updateModelSettings(m.id, patch).catch(() => undefined);
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {/* بطاقة ملاحظة التخزين */}
      <div className="rounded-xl border-2 border-teal-700/40 bg-teal-500/10 p-4 font-body text-[16px] text-ink">
        تُخزَّن المجسمات محليًا الآن، وهي مهيأة للتخزين في <b>Supabase Storage</b> (bucket: <code dir="ltr">game-models</code>)
        عند تفعيل الربط — حد أقصى 5MB لكل مجسم. إن لم يُرفع مجسم لعنصر، يُستخدم المجسم الافتراضي المدمج.
      </div>

      {models.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-6">
          <img src="/empty-models-illustration.svg" alt="" className="w-[300px] opacity-90" />
          <p className="font-body text-[18px] text-ink/70">
            كل العناصر تستخدم المجسمات الافتراضية المدمجة — ارفعوا مجسماتكم الخاصة متى شئتم
          </p>
        </div>
      )}

      {CATALOG.map((cat) => {
        const open = openCat === cat.category;
        const customCount = cat.slots.filter((s) => byKey(s.key)).length;
        return (
          <div key={cat.category} className="rounded-xl border-2 border-wood-700/40 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-5 py-3 bg-wood-900/10 font-heading font-extrabold text-[20px] text-ink"
              onClick={() => setOpenCat(open ? null : cat.category)}
            >
              <span>
                {cat.category}
                {customCount > 0 && <span className="ms-3 text-[15px] text-gold-600">({customCount} مخصص)</span>}
              </span>
              <ChevronDown size={22} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-3 gap-3 p-4">
                    {cat.slots.map((slot) => {
                      const m = byKey(slot.key);
                      return (
                        <div key={slot.key} className="rounded-xl border-2 border-wood-700/30 bg-parchment/60 p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="font-body font-bold text-[16px] text-ink">{slot.label}</span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[13px] font-heading font-bold ${
                                m ? 'bg-gold-500/25 text-gold-600' : 'bg-teal-500/15 text-teal-700'
                              }`}
                            >
                              {m ? 'مخصص ✓' : 'افتراضي'}
                            </span>
                          </div>
                          {m && (
                            <span className="font-body text-[13px] text-ink/60" dir="ltr">
                              {m.filename} · {(m.sizeBytes / 1024).toFixed(0)}KB · ×{m.scale}
                            </span>
                          )}
                          <div className="flex gap-2 mt-auto">
                            <button
                              type="button"
                              className="flex-1 rounded-lg btn-teal-gradient text-white font-heading font-bold text-[15px] py-1.5 border border-teal-900 disabled:opacity-50"
                              disabled={busy === slot.key}
                              onClick={() => {
                                sound.click();
                                pickFile(slot.key);
                              }}
                            >
                              <Upload size={14} className="inline -mt-0.5" /> {busy === slot.key ? 'جارٍ الرفع…' : 'رفع مجسم'}
                            </button>
                            {m && (
                              <button
                                type="button"
                                className="rounded-lg bg-gold-500/25 text-wood-900 font-heading font-bold text-[15px] px-3 py-1.5 border border-gold-600"
                                onClick={() => setAdjusting(m)}
                              >
                                ضبط
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* درج ضبط المجسم: الحجم + الارتكاز */}
      <AnimatePresence>
        {adjusting && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center"
            style={{ background: 'rgba(11,62,67,.55)', backdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAdjusting(null)}
          >
            <motion.div
              className="parchment-panel rounded-panel border-[3px] border-wood-700 p-6 w-[520px] max-w-[92vw] shadow-modal"
              style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 12px 32px rgba(43,33,24,.35)' }}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-heading font-extrabold text-[22px] text-ink mb-4">ضبط: {adjusting.elementKey}</h3>
              <div className="flex flex-col gap-4">
                <div>
                  <span className="font-body font-bold text-[17px] text-ink">الحجم (×0.25 — ×4)</span>
                  <SliderRow
                    value={Math.round(adjusting.scale * 100)}
                    onChange={(v) => void saveAdjust(adjusting, { scale: v / 100 })}
                    min={25}
                    max={400}
                    format={(v) => `×${(v / 100).toFixed(2)}`}
                  />
                </div>
                <div>
                  <span className="font-body font-bold text-[17px] text-ink">نقطة الارتكاز (Pivot)</span>
                  <div className="flex gap-3 mt-2" dir="ltr">
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <span key={axis} className="flex items-center gap-1.5">
                        <span className="font-heading font-black text-[16px] text-ink uppercase">{axis}</span>
                        <NumberStepper
                          value={adjusting.pivot[axis]}
                          onChange={(v) => void saveAdjust(adjusting, { pivot: { ...adjusting.pivot, [axis]: v } })}
                          min={-20}
                          max={20}
                          step={0.5}
                        />
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="rounded-lg btn-teal-gradient text-white font-heading font-bold text-[16px] px-4 py-2 border border-teal-900"
                    onClick={() => void saveAdjust(adjusting, { pivot: { ...adjusting.pivot, y: 0 } })}
                  >
                    ألصق بالأرض
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-danger-500 text-white font-heading font-bold text-[16px] px-4 py-2 border border-red-900"
                    onClick={() => void remove(adjusting)}
                  >
                    استعادة الافتراضي (حذف)
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-wood-900/10 text-ink font-heading font-bold text-[16px] px-4 py-2 border border-wood-700/40"
                    onClick={() => setAdjusting(null)}
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
