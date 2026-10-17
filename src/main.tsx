import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Yazı tipleri pakette (dış servise istek yok)
import '@fontsource/bungee/400.css'
import '@fontsource-variable/nunito'
import './index.css'
import App from './App.tsx'

// Canvas da bu yazı tiplerini kullanır: ilk karelerden önce yüklensin (yüklenemezse sistem yazı tipine düşer)
void Promise.allSettled([document.fonts.load('400 40px "Bungee"'), document.fonts.load('800 30px "Nunito Variable"')])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
