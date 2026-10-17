import type { SoundManager } from '../game/SoundManager'
import type { CharacterLook, FaceAsset } from '../game/types'
import { OUTFIT_COLORS, SCENES } from '../game/scenes'
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

// Seçim kartlarının renkleri (ortamın arka planını andırır)
const CARD_COLORS: Record<CharacterLook['scene'], [string, string]> = {
  office: ['#CBD8E4', '#B98A57'], ring: ['#8C83C9', '#E6DFCF'], kitchen: ['#F4F0E8', '#7FB59E'],
  school: ['#7FB08F', '#F2E6CC'], beach: ['#8FD3F5', '#F3D7A0'], home: ['#EBDCC6', '#C9707C'],
}

export function CharacterSetup({ face, look, sound, reducedMotion, onLook, onPlay, onNewPhoto }: Props) {
  return (
    <main className="screen">
      <div className="topbar">
        <button className="btn small ghost" onClick={onNewPhoto}>← Fotoğrafı değiştir</button>
        <h2>Ortamını Seç</h2>
        <SoundControl sound={sound} />
      </div>
      <div className="setup-layout">
        <div className="preview-stage">
          <GameCanvas face={face} look={look} mode="preview" sound={sound} reducedMotion={reducedMotion}
            label="Karakterinin seçilen ortamdaki önizlemesi — dokununca deneme vuruşu yapılır" />
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="panel">
            <h3>Ortam</h3>
            <div className="scenes" role="group" aria-label="Ortamlar">
              {SCENES.map(s => (
                <button key={s.id} className="scene-card" aria-pressed={look.scene === s.id}
                  style={{ ['--a' as string]: CARD_COLORS[s.id][0], ['--b' as string]: CARD_COLORS[s.id][1] }}
                  onClick={() => onLook({ ...look, scene: s.id, color: s.color })}>
                  <span className="emoji" aria-hidden>{s.emoji}</span>
                  <span className="name">{s.label}</span>
                  <span className="blurb">{s.blurb}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            <h3>Kıyafet rengi</h3>
            <div className="swatches" role="group" aria-label="Kıyafet renkleri">
              {OUTFIT_COLORS.map(c => (
                <button key={c.id} className="swatch" style={{ ['--a' as string]: c.hex, ['--b' as string]: c.hex }}
                  aria-label={c.label} title={c.label} aria-pressed={look.color === c.hex}
                  onClick={() => onLook({ ...look, color: c.hex })} />
              ))}
            </div>
            <label className="field" style={{ marginTop: 14 }}>Tabeladaki ad <span className="muted" style={{ fontWeight: 600 }}>(isteğe bağlı)</span>
              <input type="text" value={look.name} maxLength={12} placeholder="ADI"
                onChange={e => onLook({ ...look, name: e.target.value.replace(/[^\p{L}\p{N} .-]/gu, '').toLocaleUpperCase('tr') })} />
            </label>
            <label className="toggle" style={{ marginTop: 10 }}>
              <span>Çizgi film filtresi <span className="muted" style={{ fontWeight: 600 }}>(yüzü karikatürleştirir)</span></span>
              <input type="checkbox" checked={look.cartoon} onChange={e => onLook({ ...look, cartoon: e.target.checked })} />
            </label>
          </div>
          <button className="btn big red" onClick={onPlay}>Başla! 👊</button>
          <p className="small-print" style={{ margin: 0, textAlign: 'center' }}>İpucu: önizlemede karaktere dokun, deneme vuruşu yap.</p>
        </div>
      </div>
    </main>
  )
}
