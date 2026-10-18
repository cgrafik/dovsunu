import { useEffect, useRef, useState } from 'react'
import { MEDALS, loadRecords, rankFor, saveRecord, type RecordEntry } from '../game/records'
import type { ScoreSnapshot } from '../game/ScoreManager'
import { nextUnlock, totalPoints } from '../game/progress'
import { TOOLS, type ToolDef } from '../game/tools'

const TITLES: readonly [number, string][] = [
  [0, 'Isınma Turu'], [150, 'Çırak Şaplakçı'], [400, 'Terlik Ustası'], [800, 'Pasta Pilotu'], [1400, 'Nakavt Kralı'], [2200, 'Efsane Şaplakçı'],
]
const titleFor = (score: number) => [...TITLES].reverse().find(([min]) => score >= min)![1]

interface Props {
  image: string
  stats: ScoreSnapshot
  /** Rekor kaydında önerilen ad (tabeladaki ad) */
  defaultName: string
  /** Bu turla açılan araçlar */
  unlocked: ToolDef[]
  /** Arkadaşın meydan okuma skoru (yoksa 0) */
  target: number
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

export function ResultsScreen({ image, stats, defaultName, unlocked, target, onReplay, onNewPhoto, onMenu }: Props) {
  const [shareNote, setShareNote] = useState('')
  /** Arkadaşa meydan oku: telefonda paylaşma menüsü (görüntüyle), yoksa WhatsApp */
  const challenge = async () => {
    const url = `${location.origin}${import.meta.env.BASE_URL}?hedef=${stats.score}`
    const text = `Şamarmatik 3000'de ${stats.score.toLocaleString('tr-TR')} puan yaptım! 😈 Geçebilir misin?`
    try {
      if (image && navigator.canShare) {
        const blob = await (await fetch(image)).blob()
        const file = new File([blob], `samarmatik-3000-${stats.score}.png`, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `${text} ${url}` }); return }
      }
      if (navigator.share) { await navigator.share({ text, url }); return }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener')
    setShareNote('WhatsApp açıldı; mesajı göndermek sana kalmış.')
  }
  const total = totalPoints(), next = nextUnlock(total)
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
        {target > 0 && (
          <div className={`challenge ${stats.score > target ? 'won' : ''}`} role="status">
            {stats.score > target
              ? <>🎉 Arkadaşının <b>{target.toLocaleString('tr-TR')}</b> puanını geçtin!</>
              : <>🎯 Hedef <b>{target.toLocaleString('tr-TR')}</b>: {(target - stats.score + 1).toLocaleString('tr-TR')} puan eksik, bir daha dene!</>}
          </div>
        )}
        {unlocked.map(t => (
          <div key={t.id} className="unlocked-banner" role="status">🎉 Yeni araç açıldı: {t.emoji} <b>{t.label}</b>! <span>(tuş {t.key.toUpperCase()})</span></div>
        ))}
        <div className="panel progress" style={{ textAlign: 'left' }}>
          <div className="row"><b>Toplam puan</b><span>{total.toLocaleString('tr-TR')}</span></div>
          {next ? (
            <>
              <div className="progress-bar" aria-hidden><span style={{ transform: `scaleX(${Math.min(1, total / next.unlockAt!)})` }} /></div>
              <div className="muted small">Sıradaki: {next.emoji} {next.label} · {next.unlockAt!.toLocaleString('tr-TR')} puanda açılır</div>
            </>
          ) : <div className="muted small">Tüm araçlar açık! 🏆</div>}
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
        <button className="btn big" onClick={() => void challenge()}>🤝 Arkadaşına Meydan Oku</button>
        {shareNote && <p className="small-print" style={{ margin: 0 }}>{shareNote}</p>}
        <div className="result-actions">
          <button className="btn small ghost" onClick={onNewPhoto}>Yeni Fotoğraf</button>
          <button className="btn small ghost" onClick={onMenu}>Ana Menü</button>
        </div>
        <p className="small-print" style={{ margin: 0 }}>Görüntü yalnızca cihazına indirilir; paylaşıp paylaşmamak sana kalmış.</p>
      </div>
    </main>
  )
}
