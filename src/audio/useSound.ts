/**
 * useSound — خطاف الصوت الموحّد للواجهة.
 * يزامن الكتم/المستوى من إعدادات اللعبة (useGameStore) مع مولّد WebAudio،
 * ويعيد دوال التشغيل. زر «تخطي» يوقف المقابض النشطة عبر stopActive().
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useGameStore, engineApi } from '@/engine';
import * as sfx from './engine';
import type { SoundHandle } from './engine';

export interface SoundApi {
  click: () => SoundHandle;
  tick: (urgent?: boolean) => SoundHandle;
  ding: () => SoundHandle;
  fanfare: () => SoundHandle;
  wrong: () => SoundHandle;
  coins: (n?: number) => SoundHandle;
  stoneClack: () => SoundHandle;
  build: () => SoundHandle;
  recruit: () => SoundHandle;
  catapultFire: () => SoundHandle;
  explosion: (intensity?: number) => SoundHandle;
  collapse: () => SoundHandle;
  goldBurn: () => SoundHandle;
  swords: () => SoundHandle;
  soldierFall: () => SoundHandle;
  coinScatter: () => SoundHandle;
  convoyArrive: () => SoundHandle;
  promotion: () => SoundHandle;
  thunder: () => SoundHandle;
  heal: () => SoundHandle;
  victory: () => SoundHandle;
  whoosh: () => SoundHandle;
  /** إيقاف كل الأصوات النشطة (زر التخطي يكتم صوت الأنيميشن المتخطّى) */
  stopActive: () => void;
  toggleMute: () => void;
  muted: boolean;
}

export function useSound(): SoundApi {
  const sound = useGameStore((s) => s.state.settings.general.sound);
  const activeRef = useRef<Set<SoundHandle>>(new Set());

  useEffect(() => {
    sfx.setSoundMuted(sound.muted);
    sfx.setSoundVolume(sound.volume);
  }, [sound.muted, sound.volume]);

  const wrap = useCallback(<A extends unknown[]>(fn: (...args: A) => SoundHandle) => {
    return (...args: A): SoundHandle => {
      const h = fn(...args);
      activeRef.current.add(h);
      return {
        stop: () => {
          activeRef.current.delete(h);
          h.stop();
        },
      };
    };
  }, []);

  const stopActive = useCallback(() => {
    for (const h of activeRef.current) h.stop();
    activeRef.current.clear();
  }, []);

  const toggleMute = useCallback(() => {
    const st = useGameStore.getState().state;
    engineApi.updateSettings({
      general: { ...st.settings.general, sound: { ...st.settings.general.sound, muted: !st.settings.general.sound.muted } },
    });
  }, []);

  return useMemo<SoundApi>(
    () => ({
      click: wrap(sfx.sfxClick),
      tick: wrap(sfx.sfxTick),
      ding: wrap(sfx.sfxDing),
      fanfare: wrap(sfx.sfxFanfare),
      wrong: wrap(sfx.sfxWrong),
      coins: wrap(sfx.sfxCoins),
      stoneClack: wrap(sfx.sfxStoneClack),
      build: wrap(sfx.sfxBuild),
      recruit: wrap(sfx.sfxRecruit),
      catapultFire: wrap(sfx.sfxCatapultFire),
      explosion: wrap(sfx.sfxExplosion),
      collapse: wrap(sfx.sfxCollapse),
      goldBurn: wrap(sfx.sfxGoldBurn),
      swords: wrap(sfx.sfxSwords),
      soldierFall: wrap(sfx.sfxSoldierFall),
      coinScatter: wrap(sfx.sfxCoinScatter),
      convoyArrive: wrap(sfx.sfxConvoyArrive),
      promotion: wrap(sfx.sfxPromotion),
      thunder: wrap(sfx.sfxThunder),
      heal: wrap(sfx.sfxHeal),
      victory: wrap(sfx.sfxVictory),
      whoosh: wrap(sfx.sfxWhoosh),
      stopActive,
      toggleMute,
      muted: sound.muted,
    }),
    [wrap, stopActive, toggleMute, sound.muted],
  );
}
