import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SoundManager } from '../game/SoundManager'

/** Ses aç/kapa + ses seviyesi (ayar cihazda saklanır) */
export function SoundControl({ sound }: { sound: SoundManager }) {
  const s = useSyncExternalStore(sound.subscribe, sound.getSettings)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div className="sound" ref={box}>
      <button className="btn icon small cream" onClick={() => { sound.unlock(); sound.setMuted(!s.muted) }}
        aria-pressed={!s.muted} aria-label={s.muted ? 'Sesi aç' : 'Sesi kapat'} title={s.muted ? 'Sesi aç' : 'Sesi kapat'}>
        {s.muted ? '🔇' : '🔊'}
      </button>
      <button className="btn icon small cream" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Ses seviyesi" title="Ses seviyesi">🎚️</button>
      {open && (
        <div className="vol" role="dialog" aria-label="Ses seviyesi">
          <label>
            Ses seviyesi · %{Math.round(s.volume * 100)}
            <input type="range" min={0} max={1} step={0.05} value={s.volume}
              onChange={e => { sound.unlock(); sound.setVolume(Number(e.target.value)); if (s.muted) sound.setMuted(false) }}
              onPointerUp={() => sound.play('click')} />
          </label>
          <label className="toggle" style={{ marginTop: 10 }}>
            <span>Müzik</span>
            <input type="checkbox" checked={s.music} onChange={e => { sound.unlock(); sound.setMusic(e.target.checked) }} />
          </label>
        </div>
      )}
    </div>
  )
}
