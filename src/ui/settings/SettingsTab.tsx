/**
 * تبويب ① الإعدادات — كل المقابض (settings.md §2 + وثيقة §15).
 * كل تغيير يُطبَّق لحظيًا عبر engineApi.updateSettings (دمج فرعي كامل للمقاطع).
 */
import { useEffect, useState } from 'react';
import { useGameStore, engineApi, createRng, parseQuestionBank, refreshSyncStatus } from '@/engine';
import { saveCloudConfig, getActiveProvider } from '@/engine';
import type { GameSettings, HealCategory } from '@/contracts/types';
import { MIN_TEAMS, MAX_TEAMS, RANK_LABELS, RANK_ORDER } from '@/contracts/defaults';
import { useSound } from '@/audio';
import GameButton from '@/components/game/GameButton';
import {
  ConfirmDialog,
} from '../primitives/panels';
import {
  NumberStepper,
  SegmentedControl,
  SettingRow,
  SettingsCard,
  SliderRow,
  TextAreaPanel,
  Toggle,
} from '../primitives/widgets';

type Section = 'round' | 'catapult' | 'economy' | 'combat' | 'healing' | 'general';

/** تحديث مقطع إعدادات بدمج جزئي آمن */
function patchSection<K extends Section>(current: GameSettings, section: K, sub: Partial<GameSettings[K]>): void {
  engineApi.updateSettings({ [section]: { ...current[section], ...sub } } as Partial<GameSettings>);
}

const HEAL_LABELS: Record<HealCategory, string> = {
  inside: 'جنود داخل القلعة',
  outside: 'جنود خارج القلعة',
  convoy: 'جنود في القوافل',
};

export default function SettingsTab() {
  const settings = useGameStore((s) => s.state.settings);
  const bank = useGameStore((s) => s.state.questionBank);
  const sound = useSound();
  const [bankText, setBankText] = useState('');
  const [bankMsg, setBankMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [cloud, setCloud] = useState({ projectUrl: '', anonKey: '' });
  const [cloudSaved, setCloudSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmVictory, setConfirmVictory] = useState(false);

  // تحميل إعدادات السحابة المحفوظة محليًا (بلا شبكة)
  useEffect(() => {
    void getActiveProvider()
      .loadCloudConfig()
      .then((c) => c && setCloud(c))
      .catch(() => undefined);
  }, []);

  const parsed = parseQuestionBank(bankText, createRng(1));
  const lines = bankText.split('\n').filter((l) => l.trim().length > 0).length;
  const leftover = lines % 4;

  const saveBank = () => {
    const qs = parseQuestionBank(bankText, createRng());
    engineApi.setQuestionBank(qs);
    setBankMsg({ text: `تم حفظ البنك: ${qs.length} سؤالًا ✓`, ok: true });
  };

  const saveCloud = () => {
    void saveCloudConfig({ projectUrl: cloud.projectUrl.trim(), anonKey: cloud.anonKey.trim() }).then(() => {
      refreshSyncStatus();
      setCloudSaved(true);
      window.setTimeout(() => setCloudSaved(false), 2500);
    });
  };

  return (
    <div className="grid grid-cols-2 gap-5">
      {/* أ. الجولة والأسئلة */}
      <SettingsCard title="أ. الجولة والأسئلة">
        <SettingRow label="موضع زر «بدء الجولة»">
          <SegmentedControl
            value={settings.round.startButtonPosition}
            onChange={(v) => patchSection(settings, 'round', { startButtonPosition: v })}
            options={[
              { value: 'before', label: 'قبل السؤال' },
              { value: 'after', label: 'بعد السؤال' },
              { value: 'both', label: 'الاثنان معًا' },
              { value: 'none', label: 'بدون زر' },
            ]}
          />
        </SettingRow>
        <SettingRow label="وقت السؤال" hint="عداد اختياري للإجابة">
          <span className="flex items-center gap-3">
            <Toggle
              checked={settings.round.questionTimerEnabled}
              onChange={(v) => patchSection(settings, 'round', { questionTimerEnabled: v })}
            />
            {settings.round.questionTimerEnabled && (
              <NumberStepper
                value={settings.round.questionTimeSeconds}
                onChange={(v) => patchSection(settings, 'round', { questionTimeSeconds: v })}
                min={5}
                max={300}
                step={5}
                suffix="ث"
              />
            )}
          </span>
        </SettingRow>
        <SettingRow label="وقت جولة التصرف">
          <NumberStepper
            value={settings.round.actionTurnSeconds}
            onChange={(v) => patchSection(settings, 'round', { actionTurnSeconds: v })}
            min={10}
            max={300}
            step={5}
            suffix="ث"
          />
        </SettingRow>
        <SettingRow label="نمط الأسئلة">
          <SegmentedControl
            value={settings.round.questionMode}
            onChange={(v) => patchSection(settings, 'round', { questionMode: v })}
            options={[
              { value: 'mcq', label: 'اختيارية تلقائية' },
              { value: 'oral', label: 'شفهية بحكم المعلم' },
            ]}
          />
        </SettingRow>
        <SettingRow label="ترتيب الأسئلة" hint="العشوائي لا يكرر سؤالًا قبل استنفاد البنك">
          <SegmentedControl
            value={settings.round.questionOrder}
            onChange={(v) => patchSection(settings, 'round', { questionOrder: v })}
            options={[
              { value: 'fixed', label: 'ثابت' },
              { value: 'random', label: 'عشوائي' },
            ]}
          />
        </SettingRow>
        <div className="pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-body font-bold text-[18px] text-ink">تعديل بنك الأسئلة ({bank.length} سؤالًا محفوظًا)</span>
            {bankText.trim() && (
              <span
                className={`rounded-full px-3 py-0.5 font-heading font-bold text-[15px] ${
                  leftover === 0 && parsed.length > 0 ? 'bg-success-500/15 text-success-500' : 'bg-danger-500/15 text-danger-500'
                }`}
              >
                {leftover === 0 && parsed.length > 0
                  ? `تم التعرف على ${parsed.length} سؤالًا ✓`
                  : `أسطر ناقصة: ${leftover} سطر زائد عن مضاعفات 4`}
              </span>
            )}
          </div>
          <p className="font-body text-[15px] text-ink/60 mb-2">
            صيغة اللصق: كل 4 أسطر = سؤال (السؤال / الصحيحة / خاطئة / خاطئة أخرى)
          </p>
          <TextAreaPanel value={bankText} onChange={setBankText} placeholder={'ما عاصمة الأندلس؟\nقرطبة\nدمشق\nبغداد'} rows={7} />
          <div className="flex items-center gap-3 mt-2">
            <GameButton label="حفظ البنك" variant="gold" size="md" disabled={parsed.length === 0} onClick={saveBank} />
            {bankMsg && <span className="font-body font-bold text-[16px] text-success-500">{bankMsg.text}</span>}
          </div>
        </div>
      </SettingsCard>

      {/* ب. المنجنيق */}
      <SettingsCard title="ب. المنجنيق">
        <SettingRow
          label="نمط التحكم بالمنجنيق"
          hint="المقابض بالإيماء: حركة الفارة يمين/يسار تلفّ المنجنيق، وفوق/أسفل تغيّر قوة الإطلاق"
        >
          <SegmentedControl
            value={settings.catapult.powerMode}
            onChange={(v) => patchSection(settings, 'catapult', { powerMode: v })}
            options={[
              { value: 'hold', label: 'ضغط مطوّل' },
              { value: 'slider', label: 'مقبض متحرك' },
              { value: 'gesture', label: 'المقابض بالإيماء' },
            ]}
          />
        </SettingRow>
        <SettingRow label="ليزر مكان السقوط" hint="يسهّل التصويب للصفوف الأصغر">
          <Toggle
            checked={settings.catapult.laserEnabled}
            onChange={(v) => patchSection(settings, 'catapult', { laserEnabled: v })}
          />
        </SettingRow>
        <SettingRow label="نصف قطر الضرر الجماعي" hint="كل جندي ضمن هذا النطاق من نقطة السقوط يُصاب">
          <SliderRow
            value={settings.catapult.splashRadius ?? 3.5}
            onChange={(v) => patchSection(settings, 'catapult', { splashRadius: v })}
            min={0}
            max={10}
            step={0.5}
            format={(v) => `${v}`}
          />
        </SettingRow>
        <SettingRow label="ارتداد القذيفة" hint="القذيفة تقفز بعد إصابة برج القلعة وتصيب هدفًا ثانويًا بضرر مخفّض">
          <Toggle
            checked={settings.catapult.bounceEnabled ?? true}
            onChange={(v) => patchSection(settings, 'catapult', { bounceEnabled: v })}
          />
        </SettingRow>
        {(settings.catapult.bounceEnabled ?? true) && (
          <>
            <SettingRow label="ضرر الارتداد" hint="نسبة من الضرر الأساسي تُطبَّق على الهدف الثانوي">
              <SliderRow
                value={Math.round((settings.catapult.bounceDamageFactor ?? 0.5) * 100)}
                onChange={(v) => patchSection(settings, 'catapult', { bounceDamageFactor: v / 100 })}
                min={10}
                max={100}
                step={5}
                format={(v) => `${v}%`}
              />
            </SettingRow>
            <SettingRow label="مسافة الارتداد" hint="مدى القفزة الأفقية العشوائية [أدنى – أقصى]">
              <span className="flex items-center gap-2">
                <NumberStepper
                  value={(settings.catapult.bounceDistance ?? [3, 6])[0]}
                  onChange={(v) =>
                    patchSection(settings, 'catapult', {
                      bounceDistance: [v, Math.max(v, (settings.catapult.bounceDistance ?? [3, 6])[1])],
                    })
                  }
                  min={1}
                  max={15}
                />
                <span className="font-heading font-bold text-ink">–</span>
                <NumberStepper
                  value={(settings.catapult.bounceDistance ?? [3, 6])[1]}
                  onChange={(v) =>
                    patchSection(settings, 'catapult', {
                      bounceDistance: [Math.min((settings.catapult.bounceDistance ?? [3, 6])[0], v), v],
                    })
                  }
                  min={1}
                  max={15}
                />
              </span>
            </SettingRow>
          </>
        )}
      </SettingsCard>

      {/* ج. الاقتصاد */}
      <SettingsCard title="ج. الاقتصاد">
        <SettingRow label="مكافأة الإجابة — ذهب">
          <NumberStepper value={settings.economy.answerGoldReward} onChange={(v) => patchSection(settings, 'economy', { answerGoldReward: v })} min={0} max={100} suffix="🪙" />
        </SettingRow>
        <SettingRow label="مكافأة الإجابة — حجارة">
          <NumberStepper value={settings.economy.answerStoneReward} onChange={(v) => patchSection(settings, 'economy', { answerStoneReward: v })} min={0} max={100} suffix="🪨" />
        </SettingRow>
        <SettingRow label="سعر الجندي">
          <NumberStepper value={settings.economy.soldierCost} onChange={(v) => patchSection(settings, 'economy', { soldierCost: v })} min={1} max={50} suffix="🪙" />
        </SettingRow>
        <SettingRow label="تكلفة الطابق">
          <NumberStepper value={settings.economy.floorCost} onChange={(v) => patchSection(settings, 'economy', { floorCost: v })} min={1} max={50} suffix="🪨" />
        </SettingRow>
        <SettingRow label="كلفة الإصلاح" hint="نقاط الصحة المستعادة لكل حجر">
          <NumberStepper value={settings.economy.repairHpPerStone} onChange={(v) => patchSection(settings, 'economy', { repairHpPerStone: v })} min={1} max={10} />
        </SettingRow>
      </SettingsCard>

      {/* د. القتال */}
      <SettingsCard title="د. القتال">
        {RANK_ORDER.map((r) => (
          <SettingRow key={r} label={`${RANK_LABELS[r]} — القوة / الصحة`}>
            <span className="flex items-center gap-2">
              <NumberStepper
                value={settings.combat.rankPowerRanges[r][0]}
                onChange={(v) =>
                  patchSection(settings, 'combat', {
                    rankPowerRanges: { ...settings.combat.rankPowerRanges, [r]: [v, Math.max(v, settings.combat.rankPowerRanges[r][1])] },
                  })
                }
                min={0}
                max={30}
              />
              <span className="font-heading font-bold text-ink">–</span>
              <NumberStepper
                value={settings.combat.rankPowerRanges[r][1]}
                onChange={(v) =>
                  patchSection(settings, 'combat', {
                    rankPowerRanges: { ...settings.combat.rankPowerRanges, [r]: [Math.min(settings.combat.rankPowerRanges[r][0], v), v] },
                  })
                }
                min={0}
                max={30}
              />
              <span className="font-body text-[16px] text-ink/60 me-2">صحة:</span>
              <NumberStepper
                value={settings.combat.rankHp[r]}
                onChange={(v) => patchSection(settings, 'combat', { rankHp: { ...settings.combat.rankHp, [r]: v } })}
                min={1}
                max={30}
              />
            </span>
          </SettingRow>
        ))}
        <SettingRow label="احتمالات التجنيد" hint={`المجموع: ${Math.round((settings.combat.recruitChances.novice + settings.combat.recruitChances.soldier + settings.combat.recruitChances.expert) * 100)}%`}>
          <span className="flex flex-col gap-1.5 w-full">
            {RANK_ORDER.map((r) => (
              <span key={r} className="flex items-center gap-2">
                <span className="w-[52px] font-body text-[15px] text-ink">{RANK_LABELS[r]}</span>
                <SliderRow
                  value={Math.round(settings.combat.recruitChances[r] * 100)}
                  onChange={(v) =>
                    patchSection(settings, 'combat', { recruitChances: { ...settings.combat.recruitChances, [r]: v / 100 } })
                  }
                  min={0}
                  max={100}
                  format={(v) => `${v}%`}
                />
              </span>
            ))}
          </span>
        </SettingRow>
        <SettingRow label="ضرر المنجنيق — طابق">
          <span className="flex items-center gap-2">
            <NumberStepper value={settings.combat.catapultDamage.floor[0]} onChange={(v) => patchSection(settings, 'combat', { catapultDamage: { ...settings.combat.catapultDamage, floor: [v, Math.max(v, settings.combat.catapultDamage.floor[1])] } })} min={1} max={20} />
            <span className="font-heading font-bold text-ink">–</span>
            <NumberStepper value={settings.combat.catapultDamage.floor[1]} onChange={(v) => patchSection(settings, 'combat', { catapultDamage: { ...settings.combat.catapultDamage, floor: [Math.min(settings.combat.catapultDamage.floor[0], v), v] } })} min={1} max={20} />
          </span>
        </SettingRow>
        <SettingRow label="ضرر المنجنيق — ذهب">
          <span className="flex items-center gap-2">
            <NumberStepper value={settings.combat.catapultDamage.gold[0]} onChange={(v) => patchSection(settings, 'combat', { catapultDamage: { ...settings.combat.catapultDamage, gold: [v, Math.max(v, settings.combat.catapultDamage.gold[1])] } })} min={1} max={20} />
            <span className="font-heading font-bold text-ink">–</span>
            <NumberStepper value={settings.combat.catapultDamage.gold[1]} onChange={(v) => patchSection(settings, 'combat', { catapultDamage: { ...settings.combat.catapultDamage, gold: [Math.min(settings.combat.catapultDamage.gold[0], v), v] } })} min={1} max={20} />
          </span>
        </SettingRow>
        <SettingRow label="ضرر المنجنيق — حجارة (ثابت)">
          <NumberStepper value={settings.combat.catapultDamage.stones} onChange={(v) => patchSection(settings, 'combat', { catapultDamage: { ...settings.combat.catapultDamage, stones: v } })} min={1} max={10} />
        </SettingRow>
        <SettingRow label="ضرر المنجنيق — جنود وقوافل">
          <span className="flex items-center gap-2">
            <NumberStepper value={settings.combat.catapultDamage.units[0]} onChange={(v) => patchSection(settings, 'combat', { catapultDamage: { ...settings.combat.catapultDamage, units: [v, Math.max(v, settings.combat.catapultDamage.units[1])] } })} min={1} max={20} />
            <span className="font-heading font-bold text-ink">–</span>
            <NumberStepper value={settings.combat.catapultDamage.units[1]} onChange={(v) => patchSection(settings, 'combat', { catapultDamage: { ...settings.combat.catapultDamage, units: [Math.min(settings.combat.catapultDamage.units[0], v), v] } })} min={1} max={20} />
          </span>
        </SettingRow>
        <SettingRow label="صحة الطابق">
          <NumberStepper value={settings.combat.floorHp} onChange={(v) => patchSection(settings, 'combat', { floorHp: v })} min={1} max={50} />
        </SettingRow>
        <SettingRow label="سعة الذهب لكل طابق">
          <NumberStepper value={settings.combat.goldCapacityPerLevel} onChange={(v) => patchSection(settings, 'combat', { goldCapacityPerLevel: v })} min={1} max={100} />
        </SettingRow>
        <SettingRow label="سعة الجنود لكل طابق">
          <NumberStepper value={settings.combat.soldierCapacityPerLevel} onChange={(v) => patchSection(settings, 'combat', { soldierCapacityPerLevel: v })} min={1} max={20} />
        </SettingRow>
      </SettingsCard>

      {/* د-2. شفاء الجنود */}
      <SettingsCard title="د-2. شفاء الجنود (معطّل افتراضيًا)">
        <SettingRow label="تفعيل الشفاء" hint="الافتراضي: الجروح دائمة حتى نهاية الأسبوع">
          <Toggle checked={settings.healing.enabled} onChange={(v) => patchSection(settings, 'healing', { enabled: v })} />
        </SettingRow>
        {settings.healing.enabled && (
          <div className="flex flex-col gap-3 pt-2">
            {(['inside', 'outside', 'convoy'] as HealCategory[]).map((cat) => {
              const c = settings.healing[cat];
              return (
                <div key={cat} className="rounded-xl border-2 border-wood-700/30 p-3">
                  <SettingRow label={HEAL_LABELS[cat]}>
                    <Toggle
                      checked={c.enabled}
                      onChange={(v) => patchSection(settings, 'healing', { [cat]: { ...c, enabled: v } })}
                    />
                  </SettingRow>
                  {c.enabled && (
                    <>
                      <SettingRow label="توقيت الشفاء" hint="1 = كل جولة للمجموعة">
                        <NumberStepper
                          value={c.timing.everyTurns}
                          onChange={(v) => patchSection(settings, 'healing', { [cat]: { ...c, timing: { everyTurns: v } } })}
                          min={1}
                          max={20}
                          suffix="جولات"
                        />
                      </SettingRow>
                      <SettingRow label="مقدار الشفاء">
                        <span className="flex items-center gap-3">
                          <SegmentedControl
                            value={c.amount.kind}
                            onChange={(v) =>
                              patchSection(settings, 'healing', {
                                [cat]: { ...c, amount: v === 'full' ? { kind: 'full' } : { kind: 'points', points: 1 } },
                              })
                            }
                            options={[
                              { value: 'points', label: 'نقاط محددة' },
                              { value: 'full', label: 'شفاء كامل' },
                            ]}
                          />
                          {c.amount.kind === 'points' && (
                            <NumberStepper
                              value={c.amount.points}
                              onChange={(v) => patchSection(settings, 'healing', { [cat]: { ...c, amount: { kind: 'points', points: v } } })}
                              min={1}
                              max={10}
                            />
                          )}
                        </span>
                      </SettingRow>
                    </>
                  )}
                </div>
              );
            })}
            <div className="rounded-xl border-2 border-gold-500/50 p-3">
              <SettingRow label="شفاء فوري عند وصول القافلة للقلعة">
                <Toggle
                  checked={settings.healing.healOnArrival.enabled}
                  onChange={(v) =>
                    patchSection(settings, 'healing', { healOnArrival: { ...settings.healing.healOnArrival, enabled: v } })
                  }
                />
              </SettingRow>
              {settings.healing.healOnArrival.enabled && (
                <SettingRow label="مقدار شفاء الوصول">
                  <span className="flex items-center gap-3">
                    <SegmentedControl
                      value={settings.healing.healOnArrival.amount.kind}
                      onChange={(v) =>
                        patchSection(settings, 'healing', {
                          healOnArrival: { ...settings.healing.healOnArrival, amount: v === 'full' ? { kind: 'full' } : { kind: 'points', points: 1 } },
                        })
                      }
                      options={[
                        { value: 'points', label: 'نقاط محددة' },
                        { value: 'full', label: 'شفاء كامل' },
                      ]}
                    />
                    {settings.healing.healOnArrival.amount.kind === 'points' && (
                      <NumberStepper
                        value={settings.healing.healOnArrival.amount.points}
                        onChange={(v) =>
                          patchSection(settings, 'healing', {
                            healOnArrival: { ...settings.healing.healOnArrival, amount: { kind: 'points', points: v } },
                          })
                        }
                        min={1}
                        max={10}
                      />
                    )}
                  </span>
                </SettingRow>
              )}
            </div>
          </div>
        )}
      </SettingsCard>

      {/* هـ. عام */}
      <SettingsCard title="هـ. عام">
        <SettingRow label="عدد المجموعات/القلاع" hint="يُطبَّق عند بدء موسم جديد؛ طريق القوافل يُقسم على العدد −1">
          <NumberStepper
            value={settings.general.teamCount}
            onChange={(v) => patchSection(settings, 'general', { teamCount: v })}
            min={MIN_TEAMS}
            max={MAX_TEAMS}
          />
        </SettingRow>
        <SettingRow label="حماية الجولة الأولى">
          <Toggle checked={settings.general.firstRoundProtection} onChange={(v) => patchSection(settings, 'general', { firstRoundProtection: v })} />
        </SettingRow>
        <SettingRow label="إعانة إعادة الإعمار">
          <span className="flex items-center gap-3">
            <Toggle
              checked={settings.general.rebuildGrant.enabled}
              onChange={(v) => patchSection(settings, 'general', { rebuildGrant: { ...settings.general.rebuildGrant, enabled: v } })}
            />
            {settings.general.rebuildGrant.enabled && (
              <>
                <NumberStepper
                  value={settings.general.rebuildGrant.goldAmount}
                  onChange={(v) => patchSection(settings, 'general', { rebuildGrant: { ...settings.general.rebuildGrant, goldAmount: v } })}
                  min={1}
                  max={100}
                  suffix="🪙"
                />
                <NumberStepper
                  value={settings.general.rebuildGrant.protectionRounds}
                  onChange={(v) => patchSection(settings, 'general', { rebuildGrant: { ...settings.general.rebuildGrant, protectionRounds: v } })}
                  min={0}
                  max={5}
                  suffix="حماية"
                />
              </>
            )}
          </span>
        </SettingRow>
        <SettingRow label="الصوت">
          <span className="flex items-center gap-3">
            <Toggle checked={!settings.general.sound.muted} onChange={(v) => patchSection(settings, 'general', { sound: { ...settings.general.sound, muted: !v } })} />
            <SliderRow
              value={Math.round(settings.general.sound.volume * 100)}
              onChange={(v) => patchSection(settings, 'general', { sound: { ...settings.general.sound, volume: v / 100 } })}
              min={0}
              max={100}
              format={(v) => `${v}%`}
            />
            <button
              type="button"
              className="btn-teal-gradient rounded-full px-4 py-1.5 font-heading font-bold text-[16px] text-white border border-teal-900"
              onClick={() => sound.fanfare()}
            >
              🔊 تجربة
            </button>
          </span>
        </SettingRow>
        <SettingRow label="عودة إلى النظام التعليمي" hint="متاحة عند دمج اللعبة داخل النظام">
          <span className="font-body text-[16px] text-ink/60 rounded-full border border-wood-700/30 px-4 py-1">مدمجة في شاشة العنوان</span>
        </SettingRow>

        {/* المزامنة السحابية — جاهزة غير متصلة */}
        <div className="rounded-xl border-2 border-teal-700/40 p-4 mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-bold text-[18px] text-ink">المزامنة السحابية (Supabase)</span>
            <span className="font-body text-[15px] text-ink/60">⚪ جاهز للربط — غير متصل حاليًا</span>
          </div>
          <p className="font-body text-[15px] text-ink/60 mb-3">
            تُحفظ اللعبة محليًا دائمًا؛ عند تفعيل الربط لاحقًا ستُزامَن تلقائيًا مع Supabase (Postgres + Storage).
          </p>
          <div className="flex flex-col gap-2" dir="ltr">
            <input
              type="text"
              value={cloud.projectUrl}
              onChange={(e) => setCloud((c) => ({ ...c, projectUrl: e.target.value }))}
              placeholder="https://xxxx.supabase.co"
              className="rounded-lg border-2 border-wood-700/40 bg-parchment/80 px-3 py-2 font-body text-[15px] text-ink"
            />
            <input
              type="text"
              value={cloud.anonKey}
              onChange={(e) => setCloud((c) => ({ ...c, anonKey: e.target.value }))}
              placeholder="anon public key"
              className="rounded-lg border-2 border-wood-700/40 bg-parchment/80 px-3 py-2 font-body text-[15px] text-ink"
            />
          </div>
          <div className="flex items-center gap-3 mt-3">
            <GameButton label="حفظ الإعدادات" variant="teal" size="sm" onClick={saveCloud} />
            {cloudSaved && <span className="font-body font-bold text-[15px] text-success-500">حُفظت محليًا ✓</span>}
          </div>
        </div>
      </SettingsCard>

      {/* و. نهاية الموسم والتصفير */}
      <SettingsCard title="و. نهاية الموسم والتصفير" danger>
        <p className="font-body text-[16px] text-ink/70 mb-3">
          إعلان الفائز يحسب الذهب الكلي (داخل + خارج + في الطريق) ويعرض شاشة التتويج. التصفير يمسح كل التقدم نهائيًا.
        </p>
        <div className="flex flex-wrap gap-3">
          <GameButton label="🏆 إنهاء الموسم وإعلان الفائز" variant="gold" size="md" onClick={() => setConfirmVictory(true)} />
          <GameButton label="🗑 تصفير اللعبة والإعادة" variant="danger" size="md" onClick={() => setConfirmReset(true)} />
        </div>
      </SettingsCard>

      <ConfirmDialog
        open={confirmVictory}
        title="إنهاء الموسم وإعلان الفائز؟"
        warning="سيُحسب الذهب الكلي لكل مجموعة ويُعلن الفائز — لا يمكن التراجع عن الإعلان."
        confirmLabel="تأكيد الإعلان (اضغط مطوّلًا)"
        onConfirm={() => {
          setConfirmVictory(false);
          engineApi.declareWinner();
        }}
        onCancel={() => setConfirmVictory(false)}
      />
      <ConfirmDialog
        open={confirmReset}
        title="تصفير اللعبة والإعادة؟"
        warning="سيتم حذف كل التقدم نهائيًا — القلاع والأرصدة والجنود والقوافل. (تُحفظ الإعدادات وبنك الأسئلة)"
        confirmLabel="تأكيد التصفير (اضغط مطوّلًا)"
        onConfirm={() => {
          setConfirmReset(false);
          engineApi.resetGame();
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
