import { useEffect, useRef } from 'react'
import type { ScoreSnapshot } from '../game/ScoreManager'
import { TOOLS } from '../game/tools'

const TITLES: readonly [number, string][] = [
  [0, 'Isınma Turu'], [150, 'Çırak Şaplakçı'], [400, 'Terlik Ustası'], [800, 'Pasta Pilotu'], [1400, 'Nakavt Kralı'], [2200, 'Efsane Şaplakçı'],
]
const titleFor = (score: number) => [...TITLES].reverse().find(([min]) => score >= min)![1]

interface Props {
  image: string
  stats: ScoreSnapshot
  onReplay: () => void
  onNewPhoto: () => void
  onMenu: () => void
}

export function ResultsScreen({ image, stats, onReplay, onNewPhoto, onMenu }: Props) {
  const maxUse = Math.max(1, ...Object.values(stats.usage))
  const used = TOOLS.filter(t => stats.usage[t.id] > 0).length
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])

  const download = () => {
    const a = document.createElement('a')
    a.href = image
    a.download = `saplak-sov-${stats.score}.png`
    a.click()
  }

  return (
    <main className="screen results">
      <div className="results-card">
        <h2 ref={heading} tabIndex={-1} className="sr-only">Tur sonucu</h2>
        {image && <div className="results-photo"><img src={image} alt="Karakterinin son hâli" /></div>}
        <div className="title-badge">{titleFor(stats.score)}</div>
        <div>
          <div className="muted" style={{ fontWeight: 800, letterSpacing: 1 }}>TOPLAM SKOR</div>
          <div className="big-score">{stats.score.toLocaleString('tr-TR')}</div>
        </div>
        <div className="stats">
          <div className="stat"><div className="v">{stats.maxCombo}</div><div className="k">En yüksek kombo</div></div>
          <div className="stat"><div className="v">{stats.hits}</div><div className="k">Toplam vuruş</div></div>
          <div className="stat"><div className="v">{used}/{TOOLS.length}</div><div className="k">Kullanılan araç</div></div>
        </div>
        <div className="panel" style={{ textAlign: 'left' }}>
          <h3>Kullanılan etkileşimler</h3>
          <div className="usage">
            {TOOLS.map(t => (
              <div key={t.id}>
                <div className="row"><span>{t.emoji} {t.short}</span><span>{stats.usage[t.id]}</span></div>
                <div className="bar" style={{ transform: `scaleX(${stats.usage[t.id] / maxUse})`, opacity: stats.usage[t.id] ? 1 : 0.15 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="result-actions">
          <button className="btn big red" onClick={onReplay}>Tekrar Oyna</button>
          {image && <button className="btn big cream" onClick={download}>📷 Görüntüyü İndir</button>}
        </div>
        <div className="result-actions">
          <button className="btn small ghost" onClick={onNewPhoto}>Yeni Fotoğraf</button>
          <button className="btn small ghost" onClick={onMenu}>Ana Menü</button>
        </div>
        <p className="small-print" style={{ margin: 0 }}>Görüntü yalnızca cihazına indirilir; paylaşıp paylaşmamak sana kalmış.</p>
      </div>
    </main>
  )
}
