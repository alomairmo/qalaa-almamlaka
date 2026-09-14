/**
 * مولّد الصوت البرمجي الخالص — قلاع المملكة (design.md §8 + وثيقة §16-أ).
 * كل الأصوات مُصنّعة بـ WebAudio (مذبذبات + ضجيج) بلا أي ملفات صوتية.
 * كل صوت 1–3 ثوانٍ، وكل تشغيل يرجع مقبض إيقاف (لزر «تخطي» الذي يكتم الأنيميشن).
 */
export interface SoundHandle {
  stop: () => void;
}

/** سياق الصوت الكسول — يُنشأ عند أول تفاعل (سياسة المتصفحات) */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = 0.8;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setSoundMuted(m: boolean): void {
  muted = m;
  applyMaster();
}

export function setSoundVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  applyMaster();
}

function applyMaster(): void {
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(muted ? 0 : volume, ctx.currentTime + 0.05);
  }
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  /** انزلاق ترددي اختياري (Hz) */
  glideTo?: number;
  /** غلاف: هجوم/انحسار */
  attack?: number;
  release?: number;
}

/** عزف نغمة واحدة داخل مقبض جماعي */
function tone(
  c: AudioContext,
  out: GainNode,
  freq: number,
  at: number,
  dur: number,
  opts: ToneOpts = {},
): void {
  const { type = 'sine', gain = 0.18, glideTo, attack = 0.01, release = 0.08 } = opts;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + attack);
  g.gain.setValueAtTime(gain, at + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** ضجيج مُرشّح (طرقات، انفجارات، خطوات) */
function noise(
  c: AudioContext,
  out: GainNode,
  at: number,
  dur: number,
  opts: { freq?: number; q?: number; gain?: number; type?: BiquadFilterType } = {},
): void {
  const { freq = 800, q = 1, gain = 0.2, type = 'bandpass' } = opts;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at);
  src.stop(at + dur + 0.05);
}

/** مقبض صوت مركّب: قناة فرعية قابلة للإيقاف الفوري */
function play(build: (c: AudioContext, out: GainNode, t0: number) => number): SoundHandle {
  const c = ensureCtx();
  if (!c || !master) return { stop: () => undefined };
  const out = c.createGain();
  out.connect(master);
  const t0 = c.currentTime + 0.02;
  const dur = build(c, out, t0);
  const kill = window.setTimeout(() => {
    out.disconnect();
  }, (dur + 0.4) * 1000);
  return {
    stop: () => {
      window.clearTimeout(kill);
      try {
        out.gain.cancelScheduledValues(c.currentTime);
        out.gain.linearRampToValueAtTime(0, c.currentTime + 0.04);
        window.setTimeout(() => out.disconnect(), 80);
      } catch {
        /* تجاهل */
      }
    },
  };
}

// ─────────────────────────────────────────────
// مكتبة الأصوات — جدول §16-أ كاملًا
// ─────────────────────────────────────────────

/** نقرة زر خفيفة */
export function sfxClick(): SoundHandle {
  return play((c, out, t) => {
    tone(c, out, 1400, t, 0.05, { type: 'triangle', gain: 0.12 });
    tone(c, out, 900, t + 0.02, 0.04, { type: 'sine', gain: 0.08 });
    return 0.1;
  });
}

/** تكتكة المؤقت — urgent=true في آخر 10 ثوانٍ (أعلى وأسرع) */
export function sfxTick(urgent = false): SoundHandle {
  return play((c, out, t) => {
    tone(c, out, urgent ? 1250 : 880, t, 0.045, { type: 'square', gain: urgent ? 0.1 : 0.06 });
    return 0.08;
  });
}

/** نغمة انتقال قصيرة (بداية دور) */
export function sfxDing(): SoundHandle {
  return play((c, out, t) => {
    tone(c, out, 1046.5, t, 0.5, { type: 'sine', gain: 0.16 });
    tone(c, out, 1568, t + 0.02, 0.45, { type: 'sine', gain: 0.08 });
    return 0.55;
  });
}

/** Fanfare الإجابة الصحيحة — أربيجيو مشرق */
export function sfxFanfare(): SoundHandle {
  return play((c, out, t) => {
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => tone(c, out, f, t + i * 0.11, 0.32, { type: 'triangle', gain: 0.16 }));
    tone(c, out, 1318.5, t + 0.46, 0.6, { type: 'triangle', gain: 0.14 });
    return 1.1;
  });
}

/** نغمة الخطأ — هابطة لطيفة غير مهينة */
export function sfxWrong(): SoundHandle {
  return play((c, out, t) => {
    tone(c, out, 392, t, 0.3, { type: 'sine', gain: 0.14 });
    tone(c, out, 329.6, t + 0.22, 0.34, { type: 'sine', gain: 0.13 });
    tone(c, out, 261.6, t + 0.46, 0.5, { type: 'sine', gain: 0.11 });
    return 1.0;
  });
}

/** رنة عملات متساقطة */
export function sfxCoins(n = 6): SoundHandle {
  return play((c, out, t) => {
    for (let i = 0; i < n; i++) {
      const f = 1800 + Math.random() * 1600;
      tone(c, out, f, t + i * 0.07 + Math.random() * 0.03, 0.09, { type: 'square', gain: 0.06 });
      tone(c, out, f * 1.5, t + i * 0.07 + 0.02, 0.06, { type: 'sine', gain: 0.05 });
    }
    return 0.2 + n * 0.07;
  });
}

/** ارتطام حجارة */
export function sfxStoneClack(): SoundHandle {
  return play((c, out, t) => {
    noise(c, out, t, 0.09, { freq: 900, gain: 0.22 });
    noise(c, out, t + 0.12, 0.08, { freq: 700, gain: 0.18 });
    noise(c, out, t + 0.26, 0.12, { freq: 500, gain: 0.2 });
    tone(c, out, 180, t + 0.26, 0.15, { type: 'sine', gain: 0.14 });
    return 0.5;
  });
}

/** طرق بناء (بناء/إصلاح) */
export function sfxBuild(): SoundHandle {
  return play((c, out, t) => {
    for (let i = 0; i < 4; i++) {
      noise(c, out, t + i * 0.28, 0.07, { freq: 1200 - i * 150, gain: 0.2 });
      tone(c, out, 220 - i * 20, t + i * 0.28, 0.1, { type: 'triangle', gain: 0.12 });
    }
    tone(c, out, 523.25, t + 1.15, 0.35, { type: 'triangle', gain: 0.12 });
    return 1.5;
  });
}

/** بوق تجنيد + خطوات */
export function sfxRecruit(): SoundHandle {
  return play((c, out, t) => {
    // بوق قصير
    tone(c, out, 392, t, 0.18, { type: 'sawtooth', gain: 0.1 });
    tone(c, out, 523.25, t + 0.16, 0.3, { type: 'sawtooth', gain: 0.11 });
    // خطوات عسكرية
    for (let i = 0; i < 4; i++) noise(c, out, t + 0.55 + i * 0.22, 0.06, { freq: 300, gain: 0.16 });
    return 1.5;
  });
}

/** صرير منجنيق + صافرة قذيفة */
export function sfxCatapultFire(): SoundHandle {
  return play((c, out, t) => {
    // صرير الذراع
    tone(c, out, 160, t, 0.35, { type: 'sawtooth', gain: 0.08, glideTo: 320 });
    noise(c, out, t, 0.3, { freq: 500, gain: 0.08 });
    // ارتطام الإطلاق
    noise(c, out, t + 0.32, 0.08, { freq: 900, gain: 0.22 });
    // صافرة القذيفة المحلّقة
    tone(c, out, 1500, t + 0.4, 1.1, { type: 'sine', gain: 0.08, glideTo: 500 });
    return 1.6;
  });
}

/** انفجار يتناسب مع الضرر (intensity 0..1) */
export function sfxExplosion(intensity = 0.7): SoundHandle {
  const k = 0.5 + Math.min(1, Math.max(0, intensity)) * 0.5;
  return play((c, out, t) => {
    noise(c, out, t, 0.5 * k, { freq: 250, gain: 0.4 * k, type: 'lowpass' });
    noise(c, out, t + 0.02, 0.25 * k, { freq: 1500, gain: 0.2 * k });
    tone(c, out, 90, t, 0.55 * k, { type: 'sine', gain: 0.3 * k, glideTo: 40 });
    return 0.7 * k;
  });
}

/** انهيار طابق — حجارة وتربة */
export function sfxCollapse(): SoundHandle {
  return play((c, out, t) => {
    noise(c, out, t, 1.1, { freq: 180, gain: 0.32, type: 'lowpass' });
    for (let i = 0; i < 6; i++) noise(c, out, t + 0.15 + i * 0.14, 0.08, { freq: 400 + Math.random() * 600, gain: 0.15 });
    tone(c, out, 60, t, 1.0, { type: 'sine', gain: 0.22, glideTo: 30 });
    return 1.4;
  });
}

/** احتراق ذهب — فحيح + رنة خافتة */
export function sfxGoldBurn(): SoundHandle {
  return play((c, out, t) => {
    noise(c, out, t, 0.9, { freq: 4000, gain: 0.1, type: 'highpass' });
    tone(c, out, 2093, t + 0.1, 0.3, { type: 'sine', gain: 0.05 });
    tone(c, out, 1568, t + 0.35, 0.3, { type: 'sine', gain: 0.04 });
    return 1.0;
  });
}

/** سيوف ودروع متلاحقة */
export function sfxSwords(): SoundHandle {
  return play((c, out, t) => {
    for (let i = 0; i < 5; i++) {
      const at = t + i * 0.16;
      noise(c, out, at, 0.06, { freq: 3000 + Math.random() * 2000, gain: 0.14, type: 'highpass' });
      tone(c, out, 1200 + Math.random() * 800, at, 0.08, { type: 'square', gain: 0.05 });
    }
    return 1.0;
  });
}

/** سقوط جندي */
export function sfxSoldierFall(): SoundHandle {
  return play((c, out, t) => {
    tone(c, out, 500, t, 0.3, { type: 'sine', gain: 0.12, glideTo: 150 });
    noise(c, out, t + 0.28, 0.1, { freq: 350, gain: 0.18 });
    return 0.5;
  });
}

/** عملات مبعثرة على الطريق */
export function sfxCoinScatter(): SoundHandle {
  return sfxCoins(9);
}

/** وصول قافلة — عملات + فانفار مصغّرة */
export function sfxConvoyArrive(): SoundHandle {
  return play((c, out, t) => {
    for (let i = 0; i < 5; i++) {
      const f = 1800 + Math.random() * 1400;
      tone(c, out, f, t + i * 0.07, 0.08, { type: 'square', gain: 0.05 });
    }
    [523.25, 659.25, 783.99].forEach((f, i) =>
      tone(c, out, f, t + 0.45 + i * 0.12, 0.3, { type: 'triangle', gain: 0.13 }),
    );
    return 1.2;
  });
}

/** تتويج ترقية — أرفع من بوق التجنيد */
export function sfxPromotion(): SoundHandle {
  return play((c, out, t) => {
    [659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      tone(c, out, f, t + i * 0.12, 0.34, { type: 'triangle', gain: 0.14 }),
    );
    tone(c, out, 1568, t + 0.5, 0.7, { type: 'sine', gain: 0.1 });
    return 1.3;
  });
}

/** رعد جزاء المعلم + وميض */
export function sfxThunder(): SoundHandle {
  return play((c, out, t) => {
    noise(c, out, t, 1.4, { freq: 120, gain: 0.4, type: 'lowpass' });
    noise(c, out, t + 0.05, 0.2, { freq: 2500, gain: 0.18 });
    tone(c, out, 70, t, 1.2, { type: 'sine', gain: 0.26, glideTo: 35 });
    return 1.5;
  });
}

/** شفاء — رنة لطيفة صاعدة */
export function sfxHeal(): SoundHandle {
  return play((c, out, t) => {
    tone(c, out, 523.25, t, 0.25, { type: 'sine', gain: 0.1 });
    tone(c, out, 783.99, t + 0.14, 0.35, { type: 'sine', gain: 0.1 });
    return 0.6;
  });
}

/** موسيقى التتويج (مقطع احتفالي ~3 ثوانٍ) */
export function sfxVictory(): SoundHandle {
  return play((c, out, t) => {
    const melody: Array<[number, number, number]> = [
      [523.25, 0, 0.28], [659.25, 0.28, 0.28], [783.99, 0.56, 0.28], [1046.5, 0.84, 0.5],
      [783.99, 1.4, 0.22], [1046.5, 1.62, 0.22], [1318.5, 1.84, 0.6],
      [1568, 2.5, 0.8],
    ];
    for (const [f, dt, d] of melody) {
      tone(c, out, f, t + dt, d, { type: 'triangle', gain: 0.13 });
      tone(c, out, f / 2, t + dt, d, { type: 'sine', gain: 0.07 });
    }
    return 3.4;
  });
}

/** صفحة تُقلب (فتح نافذة السؤال) */
export function sfxWhoosh(): SoundHandle {
  return play((c, out, t) => {
    noise(c, out, t, 0.35, { freq: 1200, gain: 0.07, type: 'highpass' });
    return 0.4;
  });
}
