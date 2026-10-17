import { useEffect, useRef } from 'react'
import type { GameEngine } from '../game/GameEngine'
import { TOOLS } from '../game/tools'
import type { ToolId } from '../game/types'

interface Props {
  engine: GameEngine | null
  selected: ToolId
  disabled: boolean
  onSelect: (t: ToolId) => void
  onFire: (t: ToolId) => void
}

const TOOL_COLORS: Record<ToolId, string> = {
  slap: '#FF9FB8', punch: '#FF7A6E', slipper: '#7FD3FF', sponge: '#FFC93C', pie: '#FFC2D4', water: '#5BC0EB', dizzy: '#FFE066', tickle: '#FFB36B', shock: '#FFF06B', loan: '#8EDB9A',
}

/**
 * Araç çubuğu. Düğmeye basmak aracı seçer VE hemen hedefe kullanır; canvas'a dokunmak seçili aracı oraya kullanır.
 * Bekleme süresi göstergesi React render'ı tetiklemeden (rAF + doğrudan stil) güncellenir.
 */
export function GameControls({ engine, selected, disabled, onSelect, onFire }: Props) {
  const cds = useRef(new Map<ToolId, HTMLElement>())

  useEffect(() => {
    if (!engine) return
    let raf = 0
    const loop = () => {
      const now = performance.now()
      for (const t of TOOLS) {
        const el = cds.current.get(t.id)
        if (el) el.style.transform = `scaleY(${engine.cooldownLeft(t.id, now)})`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  return (
    <div className="tools" role="toolbar" aria-label="Etkileşim araçları">
      {TOOLS.map(t => (
        <button key={t.id} className="tool" style={{ ['--c' as string]: TOOL_COLORS[t.id] }}
          aria-pressed={selected === t.id} disabled={disabled}
          aria-label={`${t.label} (tuş ${t.key}, ${t.points} puan)`}
          onClick={() => { onSelect(t.id); onFire(t.id) }}>
          <span className="emoji" aria-hidden>{t.emoji}</span>
          <span className="label">{t.short}</span>
          <kbd aria-hidden>{t.key}</kbd>
          <span className="cd" ref={el => { if (el) cds.current.set(t.id, el); else cds.current.delete(t.id) }} />
        </button>
      ))}
    </div>
  )
}
