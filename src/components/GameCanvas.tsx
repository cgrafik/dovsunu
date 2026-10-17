import { useEffect, useRef } from 'react'
import { GameEngine, type EngineMode } from '../game/GameEngine'
import type { ScoreManager } from '../game/ScoreManager'
import type { SoundManager } from '../game/SoundManager'
import type { CharacterLook, FaceAsset } from '../game/types'

interface Props {
  face: FaceAsset
  look: CharacterLook
  mode: EngineMode
  sound: SoundManager
  score?: ScoreManager
  reducedMotion: boolean
  onEngine?: (e: GameEngine | null) => void
  onFinish?: () => void
  label: string
}

/**
 * Canvas + oyun motoru köprüsü. Motor yalnızca yüz/mod değişince yeniden kurulur; görünüm (forma rengi vb.)
 * motoru yeniden başlatmadan iletilir. Bileşen kalkınca motor, döngü ve dinleyiciler temizlenir.
 */
export function GameCanvas({ face, look, mode, sound, score, reducedMotion, onEngine, onFinish, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const engine = useRef<GameEngine | null>(null)
  const finishRef = useRef(onFinish)
  const engineCb = useRef(onEngine)
  useEffect(() => { finishRef.current = onFinish; engineCb.current = onEngine })

  useEffect(() => {
    const e = new GameEngine(ref.current!, {
      face, look, sound, score, mode, reducedMotion, onFinish: () => finishRef.current?.(),
    })
    engine.current = e
    e.start()
    engineCb.current?.(e)
    return () => { e.destroy(); engine.current = null; engineCb.current?.(null) }
    // look bilerek bağımlılık değil: aşağıdaki efekt canlı günceller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face, mode, sound, score, reducedMotion])

  useEffect(() => { engine.current?.setLook(look) }, [look])

  return <canvas ref={ref} role="img" aria-label={label} />
}
