/**
 * كاشف الشاشة البنية داخل الكانفس — يعالج الفشل الصامت الذي لا يلتقطه
 * SceneErrorBoundary (لا استثناء: كاميرا/حالة فاسدة في مكان بلا حارس،
 * فقد سياق WebGL…): المستخدم يرى خلفية الصفحة البنية فقط وبلا زر استعادة.
 *
 * الآلية:
 * - يعمل فقط أثناء اللعب الفعلي (لا عنوان/توتوريال/فوز — هناك قد يكون
 *   المشهد مغطًّى شرعًا أو غير مركّب أصلًا).
 * - يشترك في useFrame بأولوية 1 — أي يتولى الرسم بنفسه (R3F يعطّل الرسم
 *   التلقائي مع مشترك أولوية موجبة). هذا ضروري: preserveDrawingBuffer=false
 *   يعني أن القراءة بعد انتهاء الإطار ترجع أسود دائمًا؛ نرسم ثم نقرأ فورًا
 *   في نفس الإطار عبر gl.readPixels من سياق WebGL الحقيقي.
 * - كل ~BROWN_SAMPLE_INTERVAL_MS يأخذ عيّنات شبكة 5×5 ويحللها بالدالة النقية
 *   analyzeSamples (src/scene/brown-detector.ts). مهلة سماح BROWN_GRACE_MS
 *   بعد التركيب (بدء موسم/استعادة) قبل أول حكم.
 * - حكمان إيجابيان متتاليان (BROWN_REQUIRED_STREAK) ⇒ reportBrownScreen()
 *   فتعرض الواجهة زر «استعادة العرض 🔄» (نفس آلية remount).
 *
 * التكلفة: render واحد لكل إطار (مطابق للرسم التلقائي الذي نحل محله) + قراءة
 * 25 بكسلًا كل ثانيتين — مهملة.
 */
import { useRef } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { useGameStore } from '@/engine';
import { reportBrownScreen } from './bridge';
import {
  analyzeSamples,
  sampleGridPoints,
  BROWN_GRACE_MS,
  BROWN_REQUIRED_STREAK,
  BROWN_SAMPLE_INTERVAL_MS,
  type PixelSample,
} from './brown-detector';

const GRID = sampleGridPoints();

/**
 * قراءة بكسلات الشبكة من مخزن الرسم الحالي (يُستدعى فور gl.render في نفس
 * الإطار). يرجع null عند تعذّر القراءة (سياق مفقود كليًا/استثناء) — لا حكم.
 * ملاحظة: سياق مفقود يرجع أصفارًا (شفاف) ← تلتقطه قاعدة «شفاف = بنية».
 */
function readFrameSamples(state: RootState): PixelSample[] | null {
  try {
    const ctx = state.gl.getContext();
    const w = ctx.drawingBufferWidth;
    const h = ctx.drawingBufferHeight;
    if (!w || !h) return null;
    const buf = new Uint8Array(4);
    const out: PixelSample[] = [];
    for (const p of GRID) {
      const x = Math.min(w - 1, Math.max(0, Math.floor(p.fx * w)));
      const y = Math.min(h - 1, Math.max(0, Math.floor(p.fy * h)));
      ctx.readPixels(x, y, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
      out.push({ r: buf[0], g: buf[1], b: buf[2], a: buf[3] });
    }
    return out;
  } catch (err) {
    console.warn('[scene] تعذّرت قراءة بكسلات الكاشف', err);
    return null;
  }
}

/** مُجري العيّنة — يُركَّب فقط أثناء اللعب الفعلي (بوابة BrownScreenWatchdog) */
function FrameSampler() {
  // bornAt=0 ⇒ أول إطار يهيّئ مهلة السماح (تفادي performance.now أثناء render)
  const ctrl = useRef({ bornAt: 0, lastSampleAt: 0, streak: 0 });

  useFrame((state) => {
    // نتولى الرسم (أولوية موجبة تعطّل رسم R3F التلقائي) ثم نقرأ فورًا —
    // القراءة لاحقًا مع preserveDrawingBuffer=false ترجع أسود زائفًا.
    state.gl.render(state.scene, state.camera);

    const now = performance.now();
    const c = ctrl.current;
    if (c.bornAt === 0) c.bornAt = now; // أول إطار = لحظة بدء مهلة السماح
    if (now - c.bornAt < BROWN_GRACE_MS) {
      c.lastSampleAt = now;
      return;
    }
    if (now - c.lastSampleAt < BROWN_SAMPLE_INTERVAL_MS) return;
    c.lastSampleAt = now;

    const samples = readFrameSamples(state);
    if (!samples) return; // لا حكم بلا قراءة
    if (analyzeSamples(samples).brown) {
      c.streak += 1;
      if (c.streak >= BROWN_REQUIRED_STREAK) reportBrownScreen();
    } else {
      c.streak = 0;
    }
  }, 1);

  return null;
}

/**
 * بوابة التفعيل: الكاشف يعمل فقط في أطوار اللعب الفعلي. خارجها يُفكَّك
 * FrameSampler فيستعيد R3F رسمه التلقائي ولا تُقرأ أي بكسلات.
 */
export default function BrownScreenWatchdog() {
  const enabled = useGameStore((s) => {
    const p = s.state.phase;
    return !s.tutorialActive && p !== 'title' && p !== 'tutorial' && p !== 'victory';
  });
  return enabled ? <FrameSampler /> : null;
}
