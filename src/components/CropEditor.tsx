import { useCallback, useEffect, useRef } from 'react'
import type { CropRect } from '../face/FaceDetection'

interface Props {
  source: HTMLCanvasElement
  crop: CropRect
  /** Yakınlaştırma / döndürme kaydırıcılarının referansı (ilk kırpma) */
  base: CropRect
  onChange: (c: CropRect) => void
}

const ZOOM_MIN = 0.5, ZOOM_MAX = 3.5

/**
 * Yüz kırpma: ekrandaki çerçeve, karaktere yerleşecek yüzün aynısını gösterir (oval kılavuz + göz hizası).
 * Sürükle = kaydır, tekerlek / iki parmak = yakınlaştır, kaydırıcılar = yakınlaştır ve döndür.
 */
export function CropEditor({ source, crop, base, onChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cropRef = useRef(crop)
  useEffect(() => { cropRef.current = crop })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; w: number } | null>(null)

  const draw = useCallback(() => {
    const c = ref.current
    if (!c) return
    const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr)
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.scale(W / crop.w, W / crop.w)
    ctx.rotate(-crop.angle)
    ctx.drawImage(source, -crop.cx, -crop.cy)
    ctx.restore()
    // oval dışını karart
    ctx.save()
    ctx.fillStyle = 'rgba(8,20,15,0.62)'
    ctx.beginPath(); ctx.rect(0, 0, W, H)
    ctx.ellipse(W / 2, H / 2, W * 0.47, H * 0.48, 0, 0, Math.PI * 2)
    ctx.fill('evenodd')
    ctx.strokeStyle = '#FFC93C'; ctx.lineWidth = 3 * dpr; ctx.setLineDash([10 * dpr, 8 * dpr])
    ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W * 0.47, H * 0.48, 0, 0, Math.PI * 2); ctx.stroke()
    // göz hizası kılavuzu
    ctx.strokeStyle = 'rgba(255,244,224,0.55)'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 6 * dpr])
    ctx.beginPath(); ctx.moveTo(W * 0.18, H * 0.45); ctx.lineTo(W * 0.82, H * 0.45); ctx.stroke()
    ctx.restore()
  }, [source, crop])

  useEffect(() => {
    draw()
    const ro = new ResizeObserver(draw)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [draw])

  const viewToSource = (dx: number, dy: number) => {
    const c = ref.current!, k = cropRef.current.w / c.getBoundingClientRect().width
    const a = cropRef.current.angle
    return { x: (dx * Math.cos(a) - dy * Math.sin(a)) * k, y: (dx * Math.sin(a) + dy * Math.cos(a)) * k }
  }

  const clampW = (w: number) => Math.min(base.w / ZOOM_MIN, Math.max(base.w / ZOOM_MAX, w))

  const onDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), w: cropRef.current.w }
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const cur = cropRef.current
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      onChange({ ...cur, w: clampW(pinch.current.w * (pinch.current.dist / Math.max(1, d))) })
      return
    }
    const d = viewToSource(e.clientX - prev.x, e.clientY - prev.y)
    onChange({ ...cur, cx: cur.cx - d.x, cy: cur.cy - d.y })
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }
  const onWheel = (e: React.WheelEvent) => {
    const cur = cropRef.current
    onChange({ ...cur, w: clampW(cur.w * (e.deltaY > 0 ? 1.08 : 1 / 1.08)) })
  }

  // klavye: oklar kaydırır, +/- yakınlaştırır
  const onKey = (e: React.KeyboardEvent) => {
    const cur = cropRef.current, step = cur.w * 0.03
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>
    if (move[e.key]) { e.preventDefault(); onChange({ ...cur, cx: cur.cx + move[e.key][0], cy: cur.cy + move[e.key][1] }) }
    if (e.key === '+' || e.key === '=') onChange({ ...cur, w: clampW(cur.w / 1.08) })
    if (e.key === '-') onChange({ ...cur, w: clampW(cur.w * 1.08) })
  }

  const zoom = base.w / crop.w
  const rotDeg = Math.round(((crop.angle - base.angle) * 180) / Math.PI)

  return (
    <div className="crop">
      <div className="crop-view" tabIndex={0} role="application"
        aria-label="Yüz kırpma alanı: sürükleyerek kaydırın, tekerlek ya da iki parmakla yakınlaştırın, ok tuşlarıyla kaydırın"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} onKeyDown={onKey}>
        <canvas ref={ref} />
      </div>
      <div className="crop-controls">
        <label className="slider-row">Yakınlaştır
          <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.01} value={zoom}
            onChange={e => onChange({ ...crop, w: base.w / Number(e.target.value) })} />
        </label>
        <label className="slider-row">Döndür {rotDeg}°
          <input type="range" min={-35} max={35} step={1} value={rotDeg}
            onChange={e => onChange({ ...crop, angle: base.angle + (Number(e.target.value) * Math.PI) / 180 })} />
        </label>
        <p className="small-print" style={{ margin: 0 }}>Yüzü sarı ovale, gözleri kesikli çizgiye hizala.</p>
      </div>
    </div>
  )
}
