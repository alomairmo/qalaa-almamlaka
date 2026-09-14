import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// لا StrictMode: يتسبب في تشغيل مؤثرات الكانفس مرتين (react-dev.md)
// لا BrowserRouter: اللعبة SPA بشاشة واحدة fullscreen يديرها مدير الشاشات في App
createRoot(document.getElementById('root')!).render(<App />)
