// Oyun motoru: canvas çizim döngüsü (requestAnimationFrame) React'ten bağımsız çalışır.
// React yalnızca motoru kurar/yok eder ve komut gönderir (araç kullan, seçili araç, görünüm).
import { AnimationManager, randomTool } from './AnimationManager'
import { CharacterRenderer } from './CharacterRenderer'
import { clamp, pick, rand } from './math'
import type { ScoreManager } from './ScoreManager'
import type { SoundManager } from './SoundManager'
import { toolById } from './tools'
import { WORLD_H, WORLD_W, type CharacterLook, type FaceAsset, type ToolId, type Vec } from './types'

export type EngineMode = 'play' | 'preview' | 'demo'

export interface EngineOptions {
  face: FaceAsset
  look: CharacterLook
  sound: SoundManager
  score?: ScoreManager
  mode: EngineMode
  reducedMotion: boolean
  onFinish?: () => void
}

interface CrowdFan { x: number; y: number; r: number; body: string; skin: string; phase: number; arms: boolean }

const FAN_COLORS = ['#E04848', '#F2C14E', '#3D7DCA', '#F4F1E8', '#2E9E6B', '#8C5BD8', '#F28C38', '#1B1F3B']
const FAN_SKIN = ['#F2C6A0', '#D9A27A', '#B87A54', '#8A5838', '#F5D0B5']

export class GameEngine {
  readonly char: CharacterRenderer
  readonly anim: AnimationManager
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private opts: EngineOptions
  private raf = 0
  private last = 0
  private running = false
  private dpr = 1
  private scale = 1
  private offX = 0
  private offY = 0
  private shakeAmt = 0
  private excite = 0
  private crowd: CrowdFan[] = []
  private t = 0
  private selected: ToolId = 'sponge'
  private readyAt = new Map<ToolId, number>()
  private demoIn = 1.2
  private finished = false
  private prevMult = 1
  private ro: ResizeObserver

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.opts = opts
    this.char = new CharacterRenderer(opts.face, opts.look)
    this.anim = new AnimationManager(this.char, {
      sound: (id, k) => { if (opts.mode !== 'demo') opts.sound.play(id, k) },
      shake: (a) => { this.shakeAmt = Math.min(22, this.shakeAmt + a) },
      excite: (a) => { this.excite = Math.min(1, this.excite + a) },
    }, opts.reducedMotion)
    this.buildCrowd()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    if (opts.mode !== 'demo') canvas.addEventListener('pointerdown', this.onPointerDown)
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    // Yazı tipi (forma numarası, çizgi film yazıları) yüklenmeden ilk kare çizilmesin diye beklemeye gerek yok;
    // yüklendiğinde sonraki kareler zaten doğru yazıyla çizilir.
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.anim.clear()
  }

  setLook(look: CharacterLook) { this.char.look = look }
  setFace(face: FaceAsset) { this.char.face = face }
  setSelected(tool: ToolId) { this.selected = tool }

  /** Bekleme süresinin kalan oranı (0 = hazır) — araç düğmesindeki halka için */
  cooldownLeft(tool: ToolId, now = performance.now()) {
    const ready = this.readyAt.get(tool) ?? 0
    return clamp((ready - now) / toolById(tool).cooldown, 0, 1)
  }

  /** Aracı kullan. at verilmezse aracın hedefine (kafa / gövde) nişan alınır. Kullanılamadıysa false. */
  useTool(tool: ToolId, at?: Vec): boolean {
    if (this.finished) return false
    const now = performance.now()
    if (now < (this.readyAt.get(tool) ?? 0)) return false
    const def = toolById(tool)
    const point = at ?? (def.target === 'head' ? this.char.headCenter() : this.char.bodyToWorld({ x: rand(-50, 50), y: -150 }))
    const zone = at ? this.char.hitZone(at) : def.target
    this.readyAt.set(tool, now + def.cooldown)

    if (this.opts.mode === 'play' && this.opts.score) {
      const r = this.opts.score.hit(tool, now)
      if (!r) return false
      this.anim.trigger(tool, point, zone)
      const multTxt = r.multiplier > 1 ? `  ×${r.multiplier.toLocaleString('tr-TR')}` : ''
      // puan yazısı çizgi film yazısının (yukarıda) yanında, üst üste binmesin
      const side = point.x >= 400 ? 1 : -1
      this.anim.floater(`+${r.gained}${multTxt}`, { x: clamp(point.x + side * 120, 90, 710), y: point.y + 30 }, r.multiplier > 1 ? '#FFC93C' : '#FFFFFF')
      this.opts.sound.play('score', Math.min(6, r.combo / 2))
      if (r.multiplier > this.prevMult) {
        this.opts.sound.play('combo', r.multiplier * 2)
        this.anim.floater(`KOMBO ×${r.multiplier.toLocaleString('tr-TR')}!`, { x: 160, y: 420 }, '#FF4B3E')
        this.excite = Math.min(1, this.excite + 0.4)
      }
      if (r.milestone) {
        this.anim.showBanner(r.milestone)
        this.opts.sound.play('milestone')
        this.excite = 1
      }
      this.prevMult = r.multiplier
    } else {
      this.anim.trigger(tool, point, zone)
    }
    return true
  }

  /** Karakter dışına dokunuş: ıska (kombo biter) */
  private miss(at: Vec) {
    const lost = this.opts.score?.miss() ?? 0
    this.opts.sound.play('whoosh')
    this.anim.floater(lost >= 3 ? `Iska! Kombo ${lost} gitti` : 'Iska!', at, '#FFB4A8')
    this.prevMult = 1
  }

  snapshot(): string { return this.canvas.toDataURL('image/png') }

  // ── Girdi ────────────────────────────────────────────────────────────────────
  private toWorld(clientX: number, clientY: number): Vec {
    const r = this.canvas.getBoundingClientRect()
    const px = (clientX - r.left) * this.dpr, py = (clientY - r.top) * this.dpr
    return { x: (px - this.offX) / this.scale, y: (py - this.offY) / this.scale }
  }

  private onPointerDown = (e: PointerEvent) => {
    this.opts.sound.unlock()
    const at = this.toWorld(e.clientX, e.clientY)
    if (this.opts.mode === 'preview') {
      // önizleme: karaktere dokununca küçük bir şaka (puan yok)
      if (this.char.hitZone(at) !== 'none') this.useTool(pick(['face', 'cheer', 'tickle'] as const), at)
      return
    }
    const zone = this.char.hitZone(at)
    if (zone === 'none') { this.miss(at); return }
    this.useTool(this.selected, at)
  }

  // ── Yerleşim ─────────────────────────────────────────────────────────────────
  private resize() {
    const r = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.round(r.width * this.dpr)), h = Math.max(1, Math.round(r.height * this.dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h }
    this.scale = Math.min(w / WORLD_W, h / WORLD_H)
    this.offX = (w - WORLD_W * this.scale) / 2
    // Dikey fazlalık (telefon) üste verilir: karakter tribünde alta oturur, üstte gökyüzü + projektör (skor şeridinin altı)
    this.offY = h - WORLD_H * this.scale
  }

  private buildCrowd() {
    const rows = [470, 545, 620, 695, 770]
    for (const [ri, y] of rows.entries()) {
      for (let x = -520 + (ri % 2) * 34; x < 1320; x += rand(58, 72)) {
        this.crowd.push({ x, y: y + rand(-6, 6), r: rand(20, 26) + ri * 1.5, body: pick(FAN_COLORS), skin: pick(FAN_SKIN), phase: rand(0, 6), arms: Math.random() < 0.3 })
      }
    }
  }

  // ── Döngü ────────────────────────────────────────────────────────────────────
  private frame = (ts: number) => {
    if (!this.running) return
    const dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000))
    this.last = ts
    this.t += dt
    this.update(dt)
    this.draw()
    this.raf = requestAnimationFrame(this.frame)
  }

  private update(dt: number) {
    this.char.update(dt)
    this.anim.update(dt)
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 60)
    this.excite = Math.max(0, this.excite - dt * 0.35)

    const score = this.opts.score
    if (this.opts.mode === 'play' && score && !this.finished) {
      const before = score.getSnapshot().combo
      const ended = score.tick(performance.now())
      const after = score.getSnapshot().combo
      if (before >= 5 && after === 0) {           // büyük kombo zaman aşımıyla bitti → "vah vah"
        this.opts.sound.play('fail')
        this.anim.floater('Kombo bitti!', { x: 400, y: 300 }, '#FFB4A8')
      }
      if (after === 0) this.prevMult = 1
      if (ended) {
        this.finished = true
        this.anim.showBanner('Düdük çaldı!')
        this.opts.sound.play('cheer')
        this.excite = 1
        setTimeout(() => this.opts.onFinish?.(), 1400)
      }
    }
    if (this.opts.mode === 'demo') {
      this.demoIn -= dt
      if (this.demoIn <= 0 && !this.anim.busy) { this.useTool(randomTool()); this.demoIn = rand(1.6, 2.6) }
    }
  }

  private draw() {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // gökyüzü / stat zemini (tüm canvas)
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#0B2A20'); g.addColorStop(0.55, '#123B2C'); g.addColorStop(1, '#0E2F23')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)

    const sx = this.shakeAmt > 0.1 ? rand(-1, 1) * this.shakeAmt * this.scale : 0
    const sy = this.shakeAmt > 0.1 ? rand(-1, 1) * this.shakeAmt * this.scale : 0
    const screen = new DOMMatrix([this.scale, 0, 0, this.scale, this.offX + sx, this.offY + sy])
    ctx.setTransform(screen)

    this.drawStadium(ctx)
    this.char.draw(ctx, screen)
    this.anim.drawHeadLayer(ctx, screen)
    ctx.setTransform(screen)
    this.drawRailing(ctx)
    this.anim.drawFront(ctx)
  }

  private drawStadium(ctx: CanvasRenderingContext2D) {
    // projektör ışıkları
    for (const x of [60, 740]) {
      const lg = ctx.createRadialGradient(x, 40, 10, x, 40, 420)
      lg.addColorStop(0, 'rgba(255,248,220,0.55)'); lg.addColorStop(0.15, 'rgba(255,248,220,0.18)'); lg.addColorStop(1, 'rgba(255,248,220,0)')
      ctx.fillStyle = lg; ctx.fillRect(x - 440, -400, 880, 880)
      ctx.fillStyle = '#FFF8DC'
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(x - 24 + i * 24, 30 + j * 22, 8, 0, Math.PI * 2); ctx.fill() }
    }
    // tribün basamakları
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    for (let i = 0; i < 6; i++) ctx.fillRect(-600, 440 + i * 75, 2000, 36)
    // kalabalık (coşkuyla zıplar)
    const ex = this.excite, red = this.opts.reducedMotion ? 0.3 : 1
    for (const f of this.crowd) {
      const jump = Math.max(0, Math.sin(this.t * (5 + ex * 6) + f.phase)) * (4 + ex * 22) * red
      const y = f.y - jump
      ctx.globalAlpha = 0.9
      ctx.fillStyle = f.body
      ctx.beginPath(); ctx.roundRect(f.x - f.r * 1.15, y + f.r * 0.7, f.r * 2.3, f.r * 2.4, f.r * 0.8); ctx.fill()
      if (f.arms && ex > 0.35) {
        ctx.strokeStyle = f.body; ctx.lineWidth = f.r * 0.45; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(f.x - f.r, y + f.r); ctx.lineTo(f.x - f.r * 1.5, y - f.r * 1.2)
        ctx.moveTo(f.x + f.r, y + f.r); ctx.lineTo(f.x + f.r * 1.5, y - f.r * 1.2); ctx.stroke()
      }
      ctx.fillStyle = f.skin
      ctx.beginPath(); ctx.arc(f.x, y, f.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
    // karakteri öne çıkaran yumuşak ışık halkası
    const hg = ctx.createRadialGradient(400, 560, 60, 400, 560, 420)
    hg.addColorStop(0, 'rgba(255,244,224,0.22)'); hg.addColorStop(1, 'rgba(255,244,224,0)')
    ctx.fillStyle = hg; ctx.fillRect(-20, 140, 840, 840)
  }

  /** Ön korkuluk + pankart: karakter "tribünde" durur, bacaklar görünmez */
  private drawRailing(ctx: CanvasRenderingContext2D) {
    const { primary, secondary } = this.char.look.jersey
    ctx.fillStyle = '#0A2219'; ctx.fillRect(-600, 930, 2000, 200)
    ctx.fillStyle = '#C8CED6'; ctx.fillRect(-600, 880, 2000, 14)
    ctx.fillStyle = '#8D96A3'; for (let x = -560; x < 1400; x += 130) ctx.fillRect(x, 880, 10, 70)
    // pankart
    ctx.save(); ctx.translate(400, 942); ctx.rotate(-0.012)
    ctx.fillStyle = primary; ctx.beginPath(); ctx.roundRect(-300, -36, 600, 82, 6); ctx.fill()
    ctx.fillStyle = secondary; ctx.fillRect(-300, -36, 600, 9); ctx.fillRect(-300, 37, 600, 9)
    ctx.fillStyle = secondary; ctx.font = '400 40px "Bungee", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('TRİBÜN ŞAKASI', 0, 6)
    ctx.restore()
  }
}
