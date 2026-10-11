import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

// تبعيات خارجية في بناء Pages — تُحمَّل من esm.sh عبر importmap في index.html الجذر
// (ملفات الثنائيات الكبيرة لا يمكن نشرها لـ GitHub عبر API، فالحزم تبقى على CDN)
const PAGES_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'three',
  '@react-three/fiber',
  '@react-three/drei',
  'framer-motion',
  'gsap',
  'zustand',
  'lucide-react',
]

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  if (mode === 'pages') {
    // بناء GitHub Pages: كل وحدة src ملف صغير في passets/ (قابلة للدفع عبر API)
    return {
      base: './',
      plugins: [react()],
      publicDir: false,
      resolve: {
        alias: { "@": path.resolve(__dirname, "./src") },
      },
      build: {
        outDir: path.resolve(__dirname, 'passets'),
        emptyOutDir: true,
        rollupOptions: {
          external: PAGES_EXTERNALS,
          input: path.resolve(__dirname, 'src/main.tsx'),
          preserveEntrySignatures: 'strict',
          output: {
            format: 'es',
            preserveModules: true,
            preserveModulesRoot: 'src',
          },
        },
      },
    }
  }

  // الوضع الافتراضي (تطوير + بناء Kimi): المصدر تحت source/ لأن جذر المستودع
  // محجوز لموقع Pages الجاهز
  return {
    root: 'source',
    base: './',
    plugins: [inspectAttr(), react()],
    publicDir: path.resolve(__dirname, 'public'),
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      port: 3000,
    },
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
  }
});
