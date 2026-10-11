/**
 * يولّد index.html الجذر (موقع GitHub Pages) بعد `vite build --mode pages`.
 * يجد مدخل main-*.js وملف index-*.css المبنيين بأسمائهما المجزّأة ويكتب القالب.
 */
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'passets/assets'
const files = readdirSync(dir)
const entry = files.find((f) => /^main-.*\.js$/.test(f))
const css = files.find((f) => /^index-.*\.css$/.test(f))
if (!entry || !css) {
  console.error('لم يُعثر على مدخل main-*.js أو index-*.css في', dir, files)
  process.exit(1)
}

// الـ CSS المبني سطر واحد ضخم (~96KB) يتجاوز حدود النشر عبر API (وقراءة
// الأسطر الطويلة). نقطّعه عند حدود القواعد «}» إلى أجزاء صغيرة متعددة
// الأسطر تُربط بالترتيب نفسه — تحقّقنا أن «{}» لا تظهر داخل سلاسل CSS
// مقتبسة في هذا البناء، فالتقسيم عند «}» مع سطر جديد آمن دلاليًا.
// حجم الجزء ≤9KB ليبقى ضمن حدود القراءة/الدفع عبر API.
const CSS_PART_MAX = 9_000
const cssRaw = readFileSync(join(dir, css), 'utf8')
const cssParts = []
let buf = ''
for (const chunk of cssRaw.split('}')) {
  const piece = chunk + '}\n'
  if (buf.length + piece.length > CSS_PART_MAX && buf) {
    cssParts.push(buf)
    buf = ''
  }
  buf += piece
}
if (buf) cssParts.push(buf)
const cssBase = css.replace(/\.css$/, '')
const cssPartNames = cssParts.map((_, i) => `${cssBase}.p${i}.css`)
cssParts.forEach((content, i) => writeFileSync(join(dir, cssPartNames[i]), content))
// الأصل الضخم لم يعد مطلوبًا — الأجزاء تكفي (ولا يُدفَع للمستودع)
unlinkSync(join(dir, css))
const cssLinks = cssPartNames.map((n) => `    <link rel="stylesheet" href="./passets/assets/${n}" />`).join('\n')
console.log(`✓ CSS قُسّم إلى ${cssParts.length} أجزاء (أصل: ${(cssRaw.length / 1024).toFixed(0)}KB)`)

const ASSETS = 'https://lazyikoawttfcflpdixs.supabase.co/storage/v1/object/public/game-assets'

const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="قلاع المملكة — لعبة صفّية تجمع بين التحصيل الدراسي والاستراتيجية والمهارة" />
    <link rel="icon" type="image/png" href="${ASSETS}/logo-game.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@700&family=Cairo:wght@700;800;900&family=Tajawal:wght@400;500;700&display=swap"
      rel="stylesheet"
    />
    <title>قلاع المملكة</title>
${cssLinks}
    <!-- التبعيات من esm.sh (بإصدارات package-lock) — الحزم الكبيرة لا تُنشر عبر API -->
    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@19.2.3",
          "react/jsx-runtime": "https://esm.sh/react@19.2.3/jsx-runtime",
          "react-dom": "https://esm.sh/react-dom@19.2.3?external=react",
          "react-dom/client": "https://esm.sh/react-dom@19.2.3/client?external=react",
          "scheduler": "https://esm.sh/scheduler@0.27.0",
          "three": "https://esm.sh/three@0.185.1",
          "@react-three/fiber": "https://esm.sh/@react-three/fiber@9.7.0?external=react,react-dom,three",
          "@react-three/drei": "https://esm.sh/@react-three/drei@10.7.8?external=react,react-dom,three,@react-three/fiber",
          "framer-motion": "https://esm.sh/framer-motion@13.1.1?external=react,react-dom",
          "gsap": "https://esm.sh/gsap@3.15.0",
          "zustand": "https://esm.sh/zustand@5.0.15?external=react",
          "lucide-react": "https://esm.sh/lucide-react@0.562.0?external=react"
        }
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./passets/assets/${entry}"></script>
  </body>
</html>
`

writeFileSync('index.html', html)
console.log('✓ index.html →', entry, '+', css)
