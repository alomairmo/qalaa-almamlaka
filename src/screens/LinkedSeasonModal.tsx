/**
 * حوار «موسم مرتبط بالنظام التعليمي» — خطوتان من شاشة العنوان:
 *
 * 1) اختيار الصف: تُجلب الصفوف ديناميكيًا من marks (class_key مثل grpdef:*).
 * 2) اختيار الأسبوع: تُجلب أسابيع الصف من صفوف grp:<CLASS>:* (تُعرض 1..8
 *    ويُفعَّل الموجود منها فقط).
 *
 * بعد الاختيار تُجلب تعريفات المجموعات ودرجاتها للأسبوع؛ إن وُجد حفظ سحابي
 * لهذا (صف، أسبوع) في qalaa_saves يُعرض خيارا «استئناف» / «بدء من جديد»
 * (البدء من جديد يمسح الحفظ السحابي لهذا الأسبوع فقط). أي فشل شبكة يُعرض
 * برسالة لطيفة مع زر إعادة المحاولة — الوضع المحلي يبقى متاحًا دائمًا.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Landmark, Loader2, RefreshCw, X } from 'lucide-react';
import GameButton from '@/components/game/GameButton';
import {
  hasLinkedSave,
  resetLinkedSeason,
  resumeLinkedSeason,
} from '@/engine';
import { SupabaseProvider, type GroupDef } from '@/engine/storage/supabase-provider';

const provider = new SupabaseProvider();

/** أسماء عربية للصفوف المرقّمة (g4 ← «الصف الرابع g4») — وإلا يُعرض المفتاح كما هو */
const AR_ORDINALS: Record<string, string> = {
  '1': 'الأول',
  '2': 'الثاني',
  '3': 'الثالث',
  '4': 'الرابع',
  '5': 'الخامس',
  '6': 'السادس',
};

export function classDisplayName(key: string): string {
  const m = /^g(\d+)$/.exec(key.trim());
  if (m && AR_ORDINALS[m[1]]) return `الصف ${AR_ORDINALS[m[1]]} (${key})`;
  return key;
}

type Step =
  | { kind: 'classes' }
  | { kind: 'weeks'; classKey: string }
  | {
      kind: 'confirm';
      classKey: string;
      week: number;
      defs: GroupDef[];
      scores: Record<number, number>;
      hasSave: boolean;
    };

export default function LinkedSeasonModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'classes' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [classes, setClasses] = useState<string[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);

  // ── تحميل الصفوف ──
  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await provider.listClasses();
      if (list.length === 0) {
        setError('تعذّر الوصول لقاعدة البيانات أو لا توجد صفوف معرّفة بعد.');
      }
      setClasses(list);
    } catch {
      setError('تعذّر الاتصال بالشبكة — تحقّق من الإنترنت.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  // ── اختيار الصف → تحميل أسابيعه ──
  const pickClass = async (classKey: string) => {
    setLoading(true);
    setError(null);
    try {
      const w = await provider.listWeeks(classKey);
      if (w.length === 0) {
        setError(`لا توجد أسابيع مسجّلة للصف ${classDisplayName(classKey)} بعد.`);
        return;
      }
      setWeeks(w);
      setStep({ kind: 'weeks', classKey });
    } finally {
      setLoading(false);
    }
  };

  // ── اختيار الأسبوع → تعريفات المجموعات + درجاتها + فحص الحفظ ──
  const pickWeek = async (classKey: string, week: number) => {
    setLoading(true);
    setError(null);
    try {
      const [defs, scores, saved] = await Promise.all([
        provider.groupDefs(classKey),
        provider.groupScores(classKey, week),
        hasLinkedSave(classKey, week),
      ]);
      if (defs.length < 2) {
        setError('تعذّر جلب مجموعات هذا الصف (تحتاج اللعبة مجموعتين على الأقل).');
        return;
      }
      setStep({ kind: 'confirm', classKey, week, defs, scores, hasSave: saved });
    } finally {
      setLoading(false);
    }
  };

  // ── بدء/استئناف ──
  const startFresh = async (s: Extract<Step, { kind: 'confirm' }>) => {
    setBusy(true);
    try {
      // «بدء من جديد» يمسح الحفظ السحابي لهذا الأسبوع فقط ثم يبدأ
      await resetLinkedSeason(s.classKey, s.week, s.defs, s.scores);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const resumeSaved = async (s: Extract<Step, { kind: 'confirm' }>) => {
    setBusy(true);
    try {
      const ok = await resumeLinkedSeason(s.classKey, s.week);
      if (ok) onClose();
      else setError('تعذّر تحميل الحفظ السحابي — يمكنك البدء من جديد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-teal-900/55 backdrop-blur-[6px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        className="parchment-panel w-[560px] max-w-[92vw] max-h-[86dvh] overflow-y-auto rounded-panel border-[3px] border-wood-700 shadow-modal p-7"
        style={{ boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 12px 32px rgba(43,33,24,.35)' }}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-extrabold text-[26px] text-ink flex items-center gap-2">
            <Landmark size={26} className="text-teal-700" />
            موسم مرتبط بالنظام التعليمي
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="w-[36px] h-[36px] rounded-full hud-glass flex items-center justify-center text-ink hover:brightness-110 transition"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-panel border-2 border-danger-500 bg-red-50/60 p-3 text-center">
            <p className="font-body text-[17px] text-danger-500 mb-2">{error}</p>
            <GameButton
              label="إعادة المحاولة"
              icon={<RefreshCw size={18} />}
              variant="teal"
              size="sm"
              onClick={() => void loadClasses()}
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-10 text-ink">
            <Loader2 size={26} className="animate-spin" />
            <span className="font-body text-[19px]">جارٍ الاتصال بقاعدة البيانات…</span>
          </div>
        ) : step.kind === 'classes' ? (
          <>
            <p className="font-body text-[18px] text-ink mb-3">١) اختر الصف:</p>
            <div className="grid grid-cols-2 gap-3">
              {classes.map((c) => (
                <GameButton
                  key={c}
                  label={classDisplayName(c)}
                  variant="teal"
                  size="md"
                  className="w-full"
                  onClick={() => void pickClass(c)}
                />
              ))}
            </div>
          </>
        ) : step.kind === 'weeks' ? (
          <>
            <p className="font-body text-[18px] text-ink mb-1">
              الصف: <b>{classDisplayName(step.classKey)}</b>
            </p>
            <p className="font-body text-[18px] text-ink mb-3">٢) اختر الأسبوع:</p>
            <div className="grid grid-cols-4 gap-3 mb-4">
              {Array.from({ length: 8 }, (_, i) => i + 1).map((w) => {
                const enabled = weeks.includes(w);
                return (
                  <GameButton
                    key={w}
                    label={`الأسبوع ${w}`}
                    variant={enabled ? 'gold' : 'ghost-parchment'}
                    size="sm"
                    disabled={!enabled}
                    className="w-full"
                    onClick={() => void pickWeek(step.classKey, w)}
                  />
                );
              })}
            </div>
            <GameButton
              label="رجوع لاختيار الصف"
              variant="teal"
              size="sm"
              onClick={() => setStep({ kind: 'classes' })}
            />
          </>
        ) : (
          <>
            <p className="font-body text-[18px] text-ink mb-3">
              الصف: <b>{classDisplayName(step.classKey)}</b> · الأسبوع <b>{step.week}</b>
            </p>
            <div className="rounded-panel border-2 border-wood-700 bg-white/30 p-3 mb-4">
              <p className="font-heading font-bold text-[18px] text-ink mb-2">
                المجموعات وذهب البداية (درجة الأسبوع):
              </p>
              <ul className="space-y-1">
                {step.defs.slice(0, 6).map((d) => (
                  <li
                    key={d.id}
                    className="flex justify-between font-body text-[17px] text-ink"
                  >
                    <span>المجموعة {d.name}</span>
                    <span className="tabular-nums font-bold">
                      {step.scores[d.id] ?? 0} ذهب
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              {step.hasSave && (
                <GameButton
                  label="استئناف اللعبة المحفوظة"
                  caption="تُستكمل من الحفظ السحابي لهذا الأسبوع"
                  variant="gold"
                  size="md"
                  disabled={busy}
                  onClick={() => void resumeSaved(step)}
                />
              )}
              <GameButton
                label={
                  step.hasSave
                    ? 'بدء من جديد (يمسح الحفظ السحابي لهذا الأسبوع فقط)'
                    : 'ابدأ الموسم المرتبط'
                }
                variant={step.hasSave ? 'danger' : 'gold'}
                size="md"
                disabled={busy}
                onClick={() => void startFresh(step)}
              />
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
