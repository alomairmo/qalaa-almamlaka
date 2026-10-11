import path from "path"
import { defineConfig } from "vitest/config"

// إعداد مستقل للاختبارات: الجذر الحقيقي للمشروع (vite.config الافتراضي صار
// root=source لأجل فصل موقع Pages عن قالب التطوير)
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    root: __dirname,
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
