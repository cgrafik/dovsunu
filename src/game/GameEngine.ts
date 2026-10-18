// Oyun motoru: canvas çizim döngüsü (requestAnimationFrame) React'ten bağımsız çalışır.
// React yalnızca motoru kurar/yok eder ve komut gönderir (araç kullan, seçili araç, görünüm).
import { AnimationManager, randomTool } from './AnimationManager'
import { CharacterRenderer } from './CharacterRenderer'
import { clamp, pick, rand } from './math'
import { SCENES, drawSceneBack, drawSceneFront, sceneById } from './scenes'
import type { ScoreManager } from './ScoreManager'
import type { SoundManager } from './SoundManager'
import { toolById } from './tools'
import { TAUNTS } from './taunts'
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

/** Kombo bu sayının katına ulaşınca karakter nakavt olur */
const KO_EVERY = 10

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
  private t = 0
  private selected: ToolId = 'slap'
  private readyAt = new Map<ToolId, number>()
  private demoIn = 1.2
  /** Demo: ortamlar sırayla gezilir */
  private demoSceneIn = 6
  /** Boşta beklerken karakter ortama özgü bir laf eder */
  private idleIn = 3.5
  private finished = false
  private prevMult = 1
  private ro: ResizeObserver
  /** Kışkırtma zamanlaması */
  private startTauntIn = 1.3
  private talkFlap = 0
  /** Laf atarken ağız bu süre boyunca açılıp kapanır */
  private talkFor = 0
  private lowTimeTaunted = false
  private lastTaunt = new Map<string, string>()

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
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    if (opts.mode !== 'demo') canvas.addEventListener('pointerdown', this.onPointerDown)
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.anim.clear()
    this.char.dispose()
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
    this.idleIn = rand(5, 8)
    this.excite = Math.min(1, this.excite + 0.15)

    if (this.opts.mode === 'play' && this.opts.score) {
      const r = this.opts.score.hit(tool, now)
      if (!r) return false
      this.anim.trigger(tool, point, zone)
      // ara sıra vuruşu küçümser: "Bu muydu?"
      if (Math.random() < 0.12) setTimeout(() => { if (this.running && !this.finished) this.taunt('weak') }, 1100)
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
      if (r.combo % KO_EVERY === 0) {
        // nakavt: kafaya gelen efektin çarpması bitince
        setTimeout(() => {
          if (!this.running) return
          this.anim.knockout()
          if (this.char.look.scene === 'ring') this.opts.sound.play('cheer')
        }, 260)
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
    if (Math.random() < 0.7) this.taunt('miss')
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
      // önizleme: karaktere dokununca küçük bir deneme (puan yok)
      if (this.char.hitZone(at) !== 'none') this.useTool(pick(['slap', 'pie', 'tickle', 'slipper'] as const), at)
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
    // Dikey fazlalık (telefon) üste verilir: karakter ve öndeki eşya alta oturur, ortamın üst kısmı uzar
    this.offY = h - WORLD_H * this.scale
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

  /** Kışkırt: balon çıkar, karakter konuşur gibi ağzını oynatır */
  private taunt(kind: keyof typeof TAUNTS) {
    const list = TAUNTS[kind]
    const last = this.lastTaunt.get(kind)
    const options = list.length > 1 ? list.filter(l => l !== last) : list
    const text = pick(options)
    this.lastTaunt.set(kind, text)
    this.anim.showBubble(text)
    this.talkFor = Math.min(1.6, 0.35 + text.length * 0.035)
  }

  private update(dt: number) {
    this.char.update(dt)
    // konuşurken çene açılıp kapanır
    if (this.talkFor > 0) {
      this.talkFor -= dt
      this.talkFlap -= dt
      if (this.talkFlap <= 0) { this.char.pose.jaw.impulse(rand(4, 7)); this.talkFlap = rand(0.1, 0.16) }
    }
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
        this.taunt('comboLost')
      }
      if (after === 0) this.prevMult = 1
      if (ended) {
        this.finished = true
        this.anim.showBanner(sceneById(this.char.look.scene).finish)
        this.opts.sound.play('bell')
        this.excite = 1
        setTimeout(() => this.opts.onFinish?.(), 1400)
      }
    }
    if (this.opts.mode === 'demo') {
      this.demoIn -= dt
      if (this.demoIn <= 0 && !this.anim.busy) { this.useTool(randomTool()); this.demoIn = rand(1.4, 2.4) }
      this.demoSceneIn -= dt
      if (this.demoSceneIn <= 0) {
        const i = SCENES.findIndex(s => s.id === this.char.look.scene)
        const next = SCENES[(i + 1) % SCENES.length]
        this.char.look = { ...this.char.look, scene: next.id, color: next.color }
        this.anim.clear()
        this.demoSceneIn = 6
      }
    } else if (!this.finished) {
      this.idleIn -= dt
      if (this.idleIn <= 0 && !this.anim.busy) {
        if (this.opts.mode === 'play' && Math.random() < 0.7) this.taunt('idle'); else this.anim.sayLine()
        this.idleIn = rand(4, 7)
      }
      if (this.opts.mode === 'play') {
        this.startTauntIn -= dt
        if (this.startTauntIn <= 0 && this.startTauntIn > -dt) this.taunt('start')
        const left = this.opts.score?.getSnapshot().timeLeft ?? 99
        if (!this.lowTimeTaunted && left <= 10 && left > 0) { this.lowTimeTaunted = true; this.taunt('lowTime') }
      }
    }
  }

  private draw() {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height
    const look = this.char.look
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = sceneById(look.scene).base
    ctx.fillRect(0, 0, w, h)

    const sx = this.shakeAmt > 0.1 ? rand(-1, 1) * this.shakeAmt * this.scale : 0
    const sy = this.shakeAmt > 0.1 ? rand(-1, 1) * this.shakeAmt * this.scale : 0
    const screen = new DOMMatrix([this.scale, 0, 0, this.scale, this.offX + sx, this.offY + sy])
    ctx.setTransform(screen)

    const state = { t: this.t, excite: this.opts.reducedMotion ? this.excite * 0.3 : this.excite, name: look.name, color: look.color }
    drawSceneBack(ctx, look.scene, state)
    this.char.draw(ctx, screen)
    this.anim.drawHeadLayer(ctx, screen)
    ctx.setTransform(screen)
    drawSceneFront(ctx, look.scene, state)
    this.anim.drawFront(ctx)
  }
}
