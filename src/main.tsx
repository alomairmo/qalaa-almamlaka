import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ASSET_BASE, assetUrl } from './asset-base'

// في بناء Pages: حقن روابط الأصول الخارجية في متغيرات CSS قبل أي رسم
if (ASSET_BASE) {
  const st = document.documentElement.style
  st.setProperty('--asset-cursor', `url("${assetUrl('/cursor-scimitar.svg')}")`)
  st.setProperty('--asset-parchment', `url("${assetUrl('/parchment-texture.png')}")`)
  st.setProperty('--asset-zellige', `url("${assetUrl('/zellige-border.svg')}")`)
}

// لا StrictMode: يتسبب في تشغيل مؤثرات الكانفس مرتين (react-dev.md)
// لا BrowserRouter: اللعبة SPA بشاشة واحدة fullscreen يديرها مدير الشاشات في App
createRoot(document.getElementById('root')!).render(<App />)
