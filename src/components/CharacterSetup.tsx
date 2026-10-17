import type { SoundManager } from '../game/SoundManager'
import type { CharacterLook, FaceAsset } from '../game/types'
import { JERSEYS } from '../game/jerseys'
import { GameCanvas } from './GameCanvas'
import { SoundControl } from './SoundControl'

interface Props {
  face: FaceAsset
  look: CharacterLook
  sound: SoundManager
  reducedMotion: boolean
  onLook: (l: CharacterLook) => void
  onPlay: () => void
  onNewPhoto: () => void
}

export function CharacterSetup({ face, look, sound, reducedMotion, onLook, onPlay, onNewPhoto }: Props) {
  const j = look.jersey
  const setJersey = (p: Partial<CharacterLook['jersey']>) => onLook({ ...look, jersey: { ...j, ...p } })

  return (
    <main className="screen">
      <div className="topbar">
        <button className="btn small ghost" onClick={onNewPhoto}>← Fotoğrafı değiştir</button>
        <h2>Taraftarını Hazırla</h2>
        <SoundControl sound={sound} />
      </div>
      <div className="setup-layout">
        <div className="preview-stage">
          <GameCanvas face={face} look={look} mode="preview" sound={sound} reducedMotion={reducedMotion}
            label="Karakterinin önizlemesi — dokununca şaka yapar" />
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="panel">
            <h3>Görünüm</h3>
            <label className="toggle">
              <span>Çizgi film filtresi <span className="muted" style={{ fontWeight: 600 }}>(yüzü karikatürleştirir)</span></span>
              <input type="checkbox" checked={look.cartoon} onChange={e => onLook({ ...look, cartoon: e.target.checked })} />
            </label>
          </div>
          <div className="panel">
            <h3>Forma</h3>
            <div className="swatches" role="group" aria-label="Forma renkleri">
              {JERSEYS.map(c => (
                <button key={c.id} className="swatch" style={{ ['--a' as string]: c.primary, ['--b' as string]: c.secondary }}
                  aria-label={c.label} title={c.label} aria-pressed={j.primary === c.primary && j.secondary === c.secondary}
                  onClick={() => setJersey({ primary: c.primary, secondary: c.secondary })} />
              ))}
            </div>
            <div className="two-col" style={{ marginTop: 14 }}>
              <label className="field">Formadaki isim
                <input type="text" value={j.name} maxLength={10} placeholder="ADIN"
                  onChange={e => setJersey({ name: e.target.value.replace(/[^\p{L}\p{N} .-]/gu, '').toLocaleUpperCase('tr') })} />
              </label>
              <label className="field">Numara
                <input type="text" inputMode="numeric" value={j.number} maxLength={2} placeholder="12"
                  onChange={e => setJersey({ number: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
              </label>
            </div>
          </div>
          <button className="btn big red" onClick={onPlay}>Tribüne Çık! ⚽</button>
          <p className="small-print" style={{ margin: 0, textAlign: 'center' }}>İpucu: önizlemede karakterine dokun, ısınma hareketi yapsın.</p>
        </div>
      </div>
    </main>
  )
}
