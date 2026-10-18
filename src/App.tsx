import { useCallback, useEffect, useMemo, useState } from 'react'
import { CharacterSetup } from './components/CharacterSetup'
import { GameScreen } from './components/GameScreen'
import { HowToPlay } from './components/HowToPlay'
import { PhotoUpload } from './components/PhotoUpload'
import { ResultsScreen } from './components/ResultsScreen'
import { addPoints } from './game/progress'
import type { ToolDef } from './game/tools'
import { StartScreen } from './components/StartScreen'
import { disposeFaceAsset } from './face/faceAsset'
import { ScoreManager, type ScoreSnapshot } from './game/ScoreManager'
import { SoundManager } from './game/SoundManager'
import { SCENES } from './game/scenes'
import type { CharacterLook, FaceAsset } from './game/types'
import { useReducedMotion } from './hooks/useReducedMotion'

type Screen = 'start' | 'upload' | 'setup' | 'game' | 'results'

const DEFAULT_LOOK: CharacterLook = { cartoon: false, scene: SCENES[0].id, color: SCENES[0].color, name: '', body: 'm' }

export default function App() {
  const sound = useMemo(() => new SoundManager(), [])
  const score = useMemo(() => new ScoreManager(), [])
  const reducedMotion = useReducedMotion()
  const [screen, setScreen] = useState<Screen>('start')
  const [how, setHow] = useState(false)
  const [face, setFace] = useState<FaceAsset | null>(null)
  const [look, setLook] = useState<CharacterLook>(DEFAULT_LOOK)
  // kadın karakterde sert araç bir kez denendi mi (sonrası: sert araçlar gizli)
  const [hardHidden, setHardHidden] = useState(false)
  // meydan okuma linki: ?hedef=1234 (arkadaşın skoru)
  const [target] = useState(() => { const v = Number(new URLSearchParams(location.search).get('hedef')); return Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), 999999) : 0 })
  const [result, setResult] = useState<{ image: string; stats: ScoreSnapshot; unlocked: ToolDef[] } | null>(null)

  // Tarayıcı kuralı: ses ancak ilk dokunuştan sonra açılabilir
  useEffect(() => {
    const unlock = () => sound.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); sound.dispose() }
  }, [sound])

  // Yüz görseli değişince eskisi bellekten silinir
  useEffect(() => () => disposeFaceAsset(face), [face])

  /** Fotoğrafla ilgili her şeyi temizle (yeni fotoğraf / ana menü) */
  const forgetPhoto = useCallback(() => { setFace(null); setResult(null); score.reset() }, [score])

  // arayüz tıklama sesi (oyun araçları kendi sesini çalar)
  const onClickCapture = (e: React.MouseEvent) => {
    const b = (e.target as HTMLElement).closest('button')
    if (b && !b.classList.contains('tool') && !b.disabled) sound.play('click')
  }

  return (
    <div className="app" onClickCapture={onClickCapture}>
      {screen === 'start' && (
        <StartScreen sound={sound} look={look} reducedMotion={reducedMotion} target={target}
          onStart={() => setScreen(face ? 'setup' : 'upload')} onHow={() => setHow(true)} />
      )}
      {screen === 'upload' && (
        <PhotoUpload onBack={() => setScreen('start')} onDone={a => { setFace(a); setScreen('setup') }} />
      )}
      {screen === 'setup' && face && (
        <CharacterSetup face={face} look={look} sound={sound} reducedMotion={reducedMotion} onLook={setLook}
          onPlay={() => setScreen('game')} onNewPhoto={() => { forgetPhoto(); setScreen('upload') }} />
      )}
      {screen === 'game' && face && (
        <GameScreen face={face} look={look} sound={sound} score={score} reducedMotion={reducedMotion}
          hardHidden={hardHidden} onViolence={() => setHardHidden(true)}
          onFinish={r => { setResult({ ...r, unlocked: addPoints(r.stats.score) }); setScreen('results') }} onExit={() => setScreen('setup')} />
      )}
      {screen === 'results' && result && (
        <ResultsScreen image={result.image} stats={result.stats} defaultName={look.name} unlocked={result.unlocked} target={target}
          onReplay={() => { setResult(null); setScreen('game') }}
          onNewPhoto={() => { forgetPhoto(); setScreen('upload') }}
          onMenu={() => { forgetPhoto(); setScreen('start') }} />
      )}
      {how && <HowToPlay onClose={() => setHow(false)} />}
    </div>
  )
}
