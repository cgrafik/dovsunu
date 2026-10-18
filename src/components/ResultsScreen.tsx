import { useEffect, useRef, useState } from 'react'
import { MEDALS, loadRecords, rankFor, saveRecord, type RecordEntry } from '../game/records'
import type { ScoreSnapshot } from '../game/ScoreManager'
import { TOOLS } from '../game/tools'

const TITLES: readonly [number, string][] = [
  [0, 'Isınma Turu'], [150, 'Çırak Şaplakçı'], [400, 'Terlik Ustası'], [800, 'Pasta Pilotu'], [1400, 'Nakavt Kralı'], [2200, 'Efsane Şaplakçı'],
]
const titleFor = (score: number) => [...TITLES].reverse().find(([min]) => score >= min)![1]

interface Props {
  image: string
  stats: ScoreSnapshot
  /** Rekor kaydında önerilen ad (tabeladaki ad) */
  defaultName: string
  onReplay: () => void
  onNewPhoto: () => void
  onMenu: () => void
}

/** Rekor tablosu: yeni rekorsa ad sorulur ve kaydedilir; en iyi 3 skor madalyalarla listelenir */
function Records({ stats, defaultName }: { stats: ScoreSnapshot; defaultName: string }) {
  const [rank] = useState(() => rankFor(stats.score))
  const [name, setName] = useState(defaultName || '')
  const [saved, setSaved] = useState<RecordEntry | null>(null)
  const [list, setList] = useState(loadRecords)
  const save = () => {
    const entry = { name: name.trim().slice(0, 14) || 'Anonim', score: stats.score, combo: stats.maxCombo, date: new Date().toISOString() }
    setList(saveRecord(entry)); setSaved(entry)
  }
  return (
    <div className="panel records" style={{ textAlign: 'left' }}>
      {rank >= 0 && !saved && (
        <div className="new-record">
          <div className="new-record-title">🏆 Yeni rekor! {MEDALS[rank]} {rank + 1}. sıra</div>
          <form className="record-form" onSubmit={e => { e.preventDefault(); save() }}>
            <input type="text" value={name} maxLength={14} placeholder="Adın" aria-label="Rekor için adın"
              onChange={e => setName(e.target.value)} />
            <button className="btn small red" type="submit">Kaydet</button>
          </form>
        </div>
      )}
      <h3>Rekorlar</h3>
      {list.length === 0 && <p className="muted" style={{ margin: 0 }}>Henüz rekor yok. İlk rekoru sen kır!</p>}
      <ol className="record-list">
        {list.map((r, i) => (
          <li key={r.date + i} className={saved && r.date === saved.date ? 'mine' : ''}>
            <span className="medal" aria-hidden>{MEDALS[i]}</span>
            <span className="who">{r.name}</span>
            <span className="pts">{r.score.toLocaleString('tr-TR')}</span>
          </li>
        ))}
      </ol>
      <p className="small-print" style={{ margin: '6px 0 0' }}>Rekorlar yalnızca bu cihazda saklanır.</p>
    </div>
  )
}

export function ResultsScreen({ image, stats, defaultName, onReplay, onNewPhoto, onMenu }: Props) {
  const maxUse = Math.max(1, ...Object.values(stats.usage))
  const used = TOOLS.filter(t => stats.usage[t.id] > 0).length
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])

  const download = () => {
    const a = document.createElement('a')
    a.href = image
    a.download = `samarmatik-3000-${stats.score}.png`
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
        <Records stats={stats} defaultName={defaultName} />
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
