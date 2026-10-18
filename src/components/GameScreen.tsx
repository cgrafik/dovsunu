import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { GameEngine } from '../game/GameEngine'
import type { ScoreManager, ScoreSnapshot } from '../game/ScoreManager'
import type { SoundManager } from '../game/SoundManager'
import { TOOLS } from '../game/tools'
import type { CharacterLook, FaceAsset, ToolId } from '../game/types'
import { GameCanvas } from './GameCanvas'
import { GameControls } from './GameControls'
import { Hud } from './Hud'
import { SoundControl } from './SoundControl'

interface Props {
  face: FaceAsset
  look: CharacterLook
  sound: SoundManager
  score: ScoreManager
  reducedMotion: boolean
  onFinish: (r: { image: string; stats: ScoreSnapshot }) => void
  onExit: () => void
  /** Kadın karakterde "kadına şiddete hayır" bir kez gösterildi: sert araçlar gizlenir */
  hardHidden: boolean
  onViolence: () => void
}

export function GameScreen({ face, look, sound, score, reducedMotion, onFinish, onExit, hardHidden, onViolence }: Props) {
  const hideHard = hardHidden && look.body === 'f'
  const visible = useMemo(() => TOOLS.filter(t => !hideHard || t.soft), [hideHard])
  const [engine, setEngine] = useState<GameEngine | null>(null)
  const [selected, setSelected] = useState<ToolId>(hardHidden && look.body === 'f' ? 'pie' : 'slap')
  const [round, setRound] = useState(0)
  const engineRef = useRef<GameEngine | null>(null)
  const finishedRef = useRef(false)
  const snap = useSyncExternalStore(score.subscribe, score.getSnapshot)

  const onEngine = useCallback((e: GameEngine | null) => { engineRef.current = e; setEngine(e) }, [])
  useEffect(() => { engine?.setSelected(selected) }, [engine, selected])
  // sert araçlar kalkınca dokunuş da hafif araçla olsun
  useEffect(() => { if (hideHard && !TOOLS.find(t => t.id === selected)?.soft) setSelected('pie') }, [hideHard, selected])
  useEffect(() => { score.reset() }, [score])

  const fire = useCallback((t: ToolId) => { sound.unlock(); engineRef.current?.useTool(t) }, [sound])

  const complete = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    score.finish()
    const image = engineRef.current?.snapshot() ?? ''
    onFinish({ image, stats: score.getSnapshot() })
  }, [score, onFinish])

  // klavye: 1–8 araç, Boşluk seçili araç
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement)?.closest('input, textarea, [role="dialog"]')) return
      const t = visible.find(x => x.key === e.key)
      if (t) { e.preventDefault(); setSelected(t.id); fire(t.id); return }
      if (e.key === ' ') { e.preventDefault(); fire(selected) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fire, selected, visible])

  const restart = () => {
    finishedRef.current = false
    score.reset()
    setRound(r => r + 1)   // motor temiz kurulur
  }

  return (
    <main className="screen game">
      <div className="game-layout">
        <div className="game-stage">
          <GameCanvas key={round} face={face} look={look} mode="play" sound={sound} score={score} reducedMotion={reducedMotion}
            onEngine={onEngine} onFinish={complete} onViolence={onViolence}
            label="Oyun alanı: seçili aracı kullanmak için karaktere dokunun" />
          <div className="hud">
            <div className="hud-group"><Hud score={score} engine={engine} /></div>
            <div className="hud-actions">
              <SoundControl sound={sound} />
            </div>
          </div>
          {!snap.started && <div className="hint-start">👆 Karaktere dokun ya da bir araç seç!</div>}
        </div>
        <div className="tools-wrap">
          <GameControls engine={engine} tools={visible} selected={selected} disabled={snap.finished} onSelect={setSelected} onFire={fire} />
          <div className="game-actions">
            <button className="btn small cream" style={{ flex: 1 }} onClick={restart} aria-label="Turu sıfırla">↺ Sıfırla</button>
            <button className="btn small" style={{ flex: 1 }} onClick={complete} disabled={!snap.started || snap.finished}>🏁 Bitir</button>
            <button className="btn small ghost" onClick={onExit} aria-label="Ana menü">Menü</button>
          </div>
        </div>
      </div>
    </main>
  )
}
