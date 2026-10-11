/**
 * SettingsScreen — شاشة الإعدادات الكاملة (settings.md).
 * 4 تبويبات: ① عام ② بيانات المجموعات ③ المجسمات ④ الإعدادات (بنك الأسئلة).
 * تُفتح عبر engineApi.openSettings (طور settings) ولا تغلق أثناء طور السؤال.
 * مكوّن بلا props — يعتمد على useGameStore.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, engineApi } from '@/engine';
import { useSound } from '@/audio';
import GeneralTab from './settings/GeneralTab';
import TeamsTab from './settings/TeamsTab';
import ModelsTab from './settings/ModelsTab';
import QuestionsTab from './settings/QuestionsTab';
import { CloseButton } from './primitives/widgets';

const TABS = [
  { key: 'general', label: 'عام' },
  { key: 'teams', label: 'بيانات المجموعات' },
  { key: 'models', label: 'المجسمات' },
  { key: 'questions', label: 'الإعدادات' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function SettingsScreen() {
  const phase = useGameStore((s) => s.state.phase);
  const sound = useSound();
  const [tab, setTab] = useState<TabKey>('general');
  const open = phase === 'settings';

  // Esc للإغلاق (لا تُغلق أثناء طور السؤال — الطور نفسه يحميها، وهنا للأمان)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') engineApi.closeSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col"
          style={{ background: 'linear-gradient(180deg, #0B3E43, #123B4F)' }}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          dir="rtl"
        >
          {/* الشريط العلوي */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gold-500/30">
            <h1 className="font-heading font-black text-[28px] text-gold-300">الإعدادات ⚙</h1>
            <CloseButton onClick={() => engineApi.closeSettings()} />
          </div>
          {/* التبويبات */}
          <div className="flex gap-2 px-6 pt-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  sound.click();
                  setTab(t.key);
                }}
                className={[
                  'px-6 py-2.5 rounded-t-xl font-heading font-extrabold text-[19px] border-2 border-b-0 transition-colors',
                  tab === t.key
                    ? 'btn-gold-gradient text-wood-900 border-gold-600'
                    : 'text-parchment/70 border-transparent hover:text-parchment',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* محتوى التبويب */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.2 }}
              >
                {tab === 'general' && <GeneralTab />}
                {tab === 'teams' && <TeamsTab />}
                {tab === 'models' && <ModelsTab />}
                {tab === 'questions' && <QuestionsTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
