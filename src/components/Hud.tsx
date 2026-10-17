import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { GameEngine } from '../game/GameEngine'
import type { ScoreManager } from '../game/ScoreManager'

/** Skor / kombo / süre göstergesi — ScoreManager'ın gerçek durumunu okur (sahte sayaç yok) */
export function Hud({ score, engine }: { score: ScoreManager; engine: GameEngine | null }) {
  const s = useSyncExternalStore(score.subscribe, score.getSnapshot)
  const bar = useRef<HTMLElement>(null)
  const [bumpKey, setBumpKey] = useState(0)
  const prev = useRef(s.score)

  useEffect(() => { if (s.score !== prev.current) { prev.current = s.score; setBumpKey(k => k + 1) } }, [s.score])

  // kombo süresi çubuğu (render'sız güncellenir)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${score.comboProgress(performance.now())})`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [score, engine])

  const t = Math.ceil(s.timeLeft)
  return (
    <>
      <div className="chip score" aria-label={`Skor ${s.score}`}>
        <span className="k">Skor</span>
        <span className="v bump" key={bumpKey}>{s.score.toLocaleString('tr-TR')}</span>
      </div>
      <div className="chip combo" aria-label={`Kombo ${s.combo}, çarpan ${s.multiplier}`}>
        <span className="k">Kombo{s.multiplier > 1 ? ` ×${s.multiplier.toLocaleString('tr-TR')}` : ''}</span>
        <span className="v">{s.combo}</span>
        <div className="combo-bar"><i ref={bar} /></div>
      </div>
      <div className={`chip time${s.started && t <= 10 ? ' low' : ''}`} aria-label={`Kalan süre ${t} saniye`}>
        <span className="k">Süre</span>
        <span className="v">{t}</span>
      </div>
    </>
  )
}
