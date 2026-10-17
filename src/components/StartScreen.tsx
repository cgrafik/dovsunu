import { useMemo } from 'react'
import { createMascotFace } from '../face/faceAsset'
import type { SoundManager } from '../game/SoundManager'
import type { CharacterLook } from '../game/types'
import { GameCanvas } from './GameCanvas'
import { SoundControl } from './SoundControl'

interface Props {
  sound: SoundManager
  look: CharacterLook
  reducedMotion: boolean
  onStart: () => void
  onHow: () => void
}

export function StartScreen({ sound, look, reducedMotion, onStart, onHow }: Props) {
  // Fotoğraf yokken önizleme: çizim maskot kendi kendine "oynar" (sessiz demo)
  const mascot = useMemo(() => createMascotFace(), [])
  const demoLook = useMemo(() => ({ ...look, cartoon: false, jersey: { ...look.jersey, name: 'TAYFUN', number: '10' } }), [look])

  return (
    <main className="screen start">
      <div className="topbar" style={{ width: '100%', justifyContent: 'flex-end' }}>
        <SoundControl sound={sound} />
      </div>
      <div className="start-grid">
        <div className="start-actions">
          <h1 className="logo">
            <span className="l1">TRİBÜN</span>
            <span className="l2">ŞAKASI</span>
            <span className="tag">Fotoğrafını yükle · taraftarına pasta at!</span>
          </h1>
          <p className="muted" style={{ maxWidth: 440, lineHeight: 1.5, margin: 0 }}>
            Yüzün tribündeki taraftar karakterine yerleşir. Sünger sopa, kremalı pasta, su tabancası, gıdıklama tüyü…
            60 saniyede en yüksek komboyu yap!
          </p>
          <div className="row">
            <button className="btn big red" onClick={onStart}>Oyuna Başla</button>
            <button className="btn big cream" onClick={onHow}>Nasıl Oynanır?</button>
          </div>
          <p className="small-print" style={{ maxWidth: 420, margin: 0 }}>🔒 Fotoğrafın yalnızca bu tarayıcıda işlenir; hiçbir sunucuya gönderilmez.</p>
        </div>
        <div className="start-stage">
          <GameCanvas face={mascot} look={demoLook} mode="demo" sound={sound} reducedMotion={reducedMotion}
            label="Örnek taraftar karakteri: pasta yiyor, su ile ıslanıyor, gıdıklanıyor" />
        </div>
      </div>
    </main>
  )
}
