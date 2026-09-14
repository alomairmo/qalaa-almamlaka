/**
 * SettingsScreen — شاشة الإعدادات (Esc) — settings.md §1.
 * توقف اللعبة فورًا (المحرك يوقف العدادات عند phase==='settings').
 * زرا «الكاميرا» و«العودة للعب» دائما الظهور + 3 تبويبات.
 * مكوّن بلا props — يعتمد على useGameStore.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Pause, Play, X } from 'lucide-react';
import { useGameStore, engineApi } from '@/engine';
import { useSound } from '@/audio';
import SettingsTab from './SettingsTab';
import TeamsTab from './TeamsTab';
import ModelsTab from './ModelsTab';

const TABS = [
  { id: 'settings', label: '① الإعدادات' },
  { id: 'teams', label: '② بيانات المجموعات' },
  { id: 'models', label: '③ المجسمات' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function SettingsScreen() {
  const phase = useGameStore((s) => s.state.phase);
  const tutorialActive = useGameStore((s) => s.tutorialActive);
  const sound = useSound();
  const [tab, setTab] = useState<TabId>('settings');
  const open = phase === 'settings';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: 'rgba(11,62,67,.6)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className="relative w-[90vw] max-w-[1400px] h-[88vh] flex flex-col rounded-panel border-[3px] border-wood-700 parchment-panel shadow-screen overflow-hidden"
            style={{
              boxShadow: 'inset 0 0 0 2px var(--gold-500), 0 24px 64px rgba(11,62,67,.5)',
              borderRadius: '160px 160px 16px 16px / 72px 72px 16px 16px',
            }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          >
            <div className="absolute top-0 inset-x-8 h-[18px] zellige-strip rounded-b-lg opacity-90" aria-hidden />

            {/* الرأس */}
            <header className="flex items-center justify-between gap-4 px-8 pt-8 pb-3 border-b-2 border-gold-500/60">
              <div className="flex items-center gap-4">
                <img src="/logo-game.png" alt="" className="h-[48px] w-auto" />
                <h1 className="font-display text-[40px] text-wood-700 leading-none">الإعدادات</h1>
                <span className="rounded-full bg-teal-500/15 border border-teal-700 text-teal-700 font-heading font-bold text-[16px] px-4 py-1 flex items-center gap-1.5">
                  <Pause size={15} /> اللعبة متوقفة
                </span>
                {tutorialActive && (
                  <span className="rounded-full bg-gold-500/20 border border-gold-600 text-wood-900 font-heading font-bold text-[15px] px-4 py-1">
                    أنتم في الجولة التعريفية
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="h-[52px] px-6 rounded-btn btn-teal-gradient text-white font-heading font-extrabold text-[20px] border-2 border-teal-900 shadow-card flex items-center gap-2"
                  onClick={() => {
                    sound.click();
                    engineApi.enterFreeCamera();
                  }}
                >
                  <Camera size={22} /> الكاميرا
                </button>
                <button
                  type="button"
                  className="h-[52px] px-6 rounded-btn btn-gold-gradient text-wood-900 font-heading font-extrabold text-[20px] border-2 border-gold-600 shadow-card flex items-center gap-2"
                  onClick={() => {
                    sound.click();
                    engineApi.closeSettings();
                  }}
                >
                  <Play size={22} /> العودة للعب
                </button>
                <button
                  type="button"
                  aria-label="إغلاق"
                  className="w-[44px] h-[44px] rounded-full hud-glass grid place-items-center text-parchment hover:brightness-125"
                  onClick={() => engineApi.closeSettings()}
                >
                  <X size={20} />
                </button>
              </div>
            </header>

            {/* شريط التبويبات */}
            <nav className="flex gap-2 px-8 pt-4">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    sound.click();
                    setTab(t.id);
                  }}
                  className={[
                    'px-6 py-2.5 rounded-t-xl font-heading font-extrabold text-[22px] border-[3px] border-b-0 border-wood-700 transition-all',
                    tab === t.id ? 'btn-gold-gradient text-wood-900 -translate-y-0.5 shadow-card' : 'bg-parchment/60 text-ink/70 hover:bg-parchment',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {/* المحتوى */}
            <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 pt-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.2 }}
                >
                  {tab === 'settings' && <SettingsTab />}
                  {tab === 'teams' && <TeamsTab />}
                  {tab === 'models' && <ModelsTab />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
