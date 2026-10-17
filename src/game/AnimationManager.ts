// Merkezi animasyon denetimi: araç efektleri, karakter tepkileri, ifadeler, parçacıklar, yazılar, balonlar.
// • Her araç bir "efekt" başlatır (uçan pasta, sallanan sopa…); çarpma anında tepki (ses + poz itkisi + ifade + yazı).
// • İfadeler öncelikli: daha önemli tepki (sersemleme) varken önemsiz olan (surat) onu bozmaz.
// • Sınırlar: en çok MAX_PARTICLES parçacık, MAX_EFFECTS efekt, 6 yazı — çok hızlı basılsa da sistem bozulmaz.
import type { CharacterRenderer } from './CharacterRenderer'
import { FACE_H, FACE_W } from './CharacterRenderer'
import type { SoundId } from './SoundManager'
import { clamp, easeInCubic, easeOutBack, easeOutCubic, lerp, pick, pickIndexAvoiding, rand } from './math'
import type { Expression, ToolId, Vec } from './types'

const MAX_PARTICLES = 500
const MAX_EFFECTS = 14

export interface AnimHooks {
  sound: (id: SoundId, k?: number) => void
  shake: (amount: number) => void
  /** Arka plandaki kalabalığı coştur (0..1) */
  excite: (amount: number) => void
}

type PShape = 'dot' | 'foam' | 'cream' | 'drop' | 'confetti' | 'spark' | 'stream'
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number; size: number
  color: string; gravity: number; drag: number; shape: PShape; rot: number; vr: number
}

interface Effect { t: number; dur: number; update(dt: number): void; draw(ctx: CanvasRenderingContext2D): void }

interface Decal { kind: 'cream' | 'wet'; t: number; life: number; blobs: { x: number; y: number; r: number; drip: number; speed: number }[] }
interface PopText { text: string; x: number; y: number; t: number; life: number; color: string; rot: number; size: number }
interface Floater { text: string; x: number; y: number; t: number; life: number; color: string }
interface Bubble { text: string; t: number; life: number }

const FONT_DISPLAY = '"Bungee", system-ui, sans-serif'
const FONT_BODY = '"Nunito Variable", "Nunito", system-ui, sans-serif'

const BUBBLES: Record<ToolId, readonly string[]> = {
  sponge: ['Ayyy!', 'Faul bu!', 'Hakem!', 'Kırmızı kart!', 'Penaltııı!'],
  pie: ['Kremalı mı bu?!', 'Gözüm!', 'Tatlı maç!', 'Bu da mı VAR?'],
  water: ['Yağmur mu yağıyor?', 'Islandım!', 'Hayır, saçım!', 'Soğuuk!'],
  tickle: ['Hahaha dur!', 'Gıdıklanıyorum!', 'Yapmaa!', 'Hihihi!'],
  face: ['Şuna bak!', 'Böhöö!', 'Ciddiyim!', 'Poz veriyorum!'],
  dizzy: ['Neredeyim?', 'Skor kaç?', 'Yıldızlar...', 'Hangi maçtayız?'],
  cheer: ['Şampiyon!', 'Bu maç bizim!', 'Oleey oley!', 'Tribünler ayakta!'],
}
const TEXTS: Record<ToolId, readonly string[]> = {
  sponge: ['BONK!', 'POF!', 'PAT!', 'DONK!'],
  pie: ['ŞLAP!', 'ŞAP!', 'PLOF!'],
  water: ['FIŞŞ!', 'ŞIPP!', 'VIZZ!'],
  tickle: ['KIKIR!', 'HİHİ!', 'GIDI GIDI!'],
  face: ['BOİNG!', 'HOPPA!', 'TADAA!'],
  dizzy: ['ZONK!', 'GAKK!', 'BIDIK!'],
  cheer: ['OLEEEY!', 'GOOOL!', 'HADİ BE!'],
}
const TEXT_COLORS: Record<ToolId, string> = {
  sponge: '#FFC93C', pie: '#FF8FB1', water: '#5BC0EB', tickle: '#FF9F43', face: '#B98CFF', dizzy: '#FFE066', cheer: '#7BE495',
}
const CONFETTI = ['#FFC93C', '#FF4B3E', '#5BC0EB', '#7BE495', '#FFFFFF', '#B98CFF']

export class AnimationManager {
  private particles: Particle[] = []
  private effects: Effect[] = []
  private decals: Decal[] = []
  private texts: PopText[] = []
  private floaters: Floater[] = []
  private bubble: Bubble | null = null
  private banner: { text: string; t: number; life: number } | null = null
  private stars: { t: number; life: number } | null = null
  private later: { at: number; fn: () => void }[] = []
  private now = 0
  private exprUntil = 0
  private exprPrio = 0
  private lastFace = -1
  private lastBubble = new Map<ToolId, number>()
  private char: CharacterRenderer
  private hooks: AnimHooks
  reduced: boolean

  constructor(char: CharacterRenderer, hooks: AnimHooks, reduced: boolean) {
    this.char = char
    this.hooks = hooks
    this.reduced = reduced
  }

  /** Çalışan efekt var mı (önizleme/demo modu boşta mı) */
  get busy() { return this.effects.length > 0 || this.exprUntil > this.now }

  clear() {
    this.particles = []; this.effects = []; this.decals = []; this.texts = []; this.floaters = []
    this.bubble = null; this.banner = null; this.stars = null; this.later = []
    this.exprUntil = 0; this.exprPrio = 0
    this.char.expression = 'none'
    this.char.pose.reset()
  }

  private schedule(delay: number, fn: () => void) { this.later.push({ at: this.now + delay, fn }) }

  setExpression(e: Expression, dur: number, prio: number) {
    if (this.now < this.exprUntil && prio < this.exprPrio) return
    this.char.expression = e
    this.exprUntil = this.now + dur
    this.exprPrio = prio
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────────
  private n(count: number) { return Math.max(1, Math.round(count * (this.reduced ? 0.45 : 1))) }

  burst(at: Vec, count: number, shape: PShape, colors: readonly string[], speed: [number, number], opts: Partial<Particle> = {}) {
    const k = this.n(count)
    for (let i = 0; i < k; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
      const a = rand(0, Math.PI * 2), s = rand(speed[0], speed[1])
      this.particles.push({
        x: at.x, y: at.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - s * 0.3, life: rand(0.5, 0.9), max: 0.9,
        size: rand(5, 11), color: pick(colors), gravity: 1400, drag: 1.8, shape, rot: rand(0, 6), vr: rand(-10, 10), ...opts,
      })
    }
  }

  popText(tool: ToolId, at: Vec) {
    if (this.texts.length >= 6) this.texts.shift()
    this.texts.push({ text: pick(TEXTS[tool]), x: at.x + rand(-30, 30), y: at.y - 60, t: 0, life: 0.85, color: TEXT_COLORS[tool], rot: rand(-0.22, 0.22), size: 64 })
  }

  floater(text: string, at: Vec, color = '#FFFFFF') {
    if (this.floaters.length >= 8) this.floaters.shift()
    this.floaters.push({ text, x: at.x, y: at.y, t: 0, life: 1.0, color })
  }

  say(tool: ToolId, chance = 1) {
    if (Math.random() > chance) return
    const list = BUBBLES[tool]
    const i = pickIndexAvoiding(list.length, this.lastBubble.get(tool) ?? -1)
    this.lastBubble.set(tool, i)
    this.bubble = { text: list[i], t: 0, life: 1.7 }
  }

  showBanner(text: string) { this.banner = { text, t: 0, life: 2.3 } }

  private shake(a: number) { if (!this.reduced) this.hooks.shake(a) }

  // ── Tetikleme ────────────────────────────────────────────────────────────────
  trigger(tool: ToolId, at: Vec, zone: 'head' | 'body' | 'none') {
    if (this.effects.length >= MAX_EFFECTS) this.effects.shift()
    const head = this.char.headCenter()
    const target = zone === 'head' ? at : head
    const side: 1 | -1 = at.x >= head.x ? 1 : -1
    switch (tool) {
      case 'sponge': this.effects.push(this.spongeSwing(target, side)); break
      case 'pie': this.effects.push(this.pieThrow(target, side)); break
      case 'water': this.effects.push(this.waterSquirt(target, side)); break
      case 'tickle': this.effects.push(this.feather(zone === 'body' ? at : this.char.bodyToWorld({ x: rand(-60, 60), y: -150 }))); break
      case 'face': this.funnyFace(); break
      case 'dizzy': this.effects.push(this.chickenBop(side)); break
      case 'cheer': this.cheer(); break
    }
  }

  // Sünger sopa: yandan savrulup kafaya iner
  private spongeSwing(target: Vec, side: 1 | -1): Effect {
    const len = 300
    const dir = { x: side, y: -0.35 }, m = Math.hypot(dir.x, dir.y)
    const pivot = { x: target.x + (dir.x / m) * len, y: target.y + (dir.y / m) * len }
    const hitA = Math.atan2(target.y - pivot.y, target.x - pivot.x)
    const startA = hitA - side * 1.7
    let hit = false
    const self: Effect = {
      t: 0, dur: 0.62,
      update: (dt) => {
        self.t += dt
        if (!hit && self.t >= 0.27) { hit = true; this.spongeImpact(target, side) }
      },
      draw: (ctx) => {
        const t = self.t
        let a: number
        if (t < 0.12) a = startA - side * 0.25 * easeOutCubic(t / 0.12)
        else if (t < 0.27) a = lerp(startA - side * 0.25, hitA, easeInCubic((t - 0.12) / 0.15))
        else a = hitA - side * 0.55 * easeOutCubic(Math.min(1, (t - 0.27) / 0.35))
        const alpha = t > 0.45 ? clamp(1 - (t - 0.45) / 0.17, 0, 1) : 1
        ctx.save(); ctx.globalAlpha = alpha
        ctx.translate(pivot.x, pivot.y); ctx.rotate(a)
        // sap
        ctx.fillStyle = '#3B3355'; ctx.beginPath(); ctx.roundRect(-20, -13, 110, 26, 12); ctx.fill()
        // sünger gövde
        ctx.fillStyle = '#FFD23F'; ctx.strokeStyle = '#C9900C'; ctx.lineWidth = 5
        ctx.beginPath(); ctx.roundRect(80, -30, len - 50, 60, 30); ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(201,144,12,0.35)'
        for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(110 + i * 26, -8 + (i % 2) * 18, 5, 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
      },
    }
    return self
  }

  private spongeImpact(at: Vec, side: 1 | -1) {
    const p = this.char.pose
    p.headRot.impulse(-side * 7); p.headX.impulse(-side * 700); p.headSquash.set(0.8); p.jaw.impulse(7); p.lean.impulse(-side * 1.2)
    this.setExpression('shut', 0.6, 2)
    this.hooks.sound('bonk')
    if (Math.random() < 0.5) this.schedule(0.14, () => this.hooks.sound('yell'))
    this.popText('sponge', at)
    this.burst(at, 14, 'foam', ['#FFD23F', '#FFE58A', '#F5B700'], [250, 650])
    this.shake(12)
    this.say('sponge', 0.35)
  }

  // Kremalı pasta: aşağıdan kavis çizerek uçar, yüze yapışır
  private pieThrow(target: Vec, side: 1 | -1): Effect {
    const start = { x: 400 + side * 520, y: 1080 }
    const ctrl = { x: lerp(start.x, target.x, 0.5), y: Math.min(start.y, target.y) - 260 }
    let hit = false
    this.hooks.sound('whoosh')
    const self: Effect = {
      t: 0, dur: 0.44,
      update: (dt) => { self.t += dt; if (!hit && self.t >= self.dur) { hit = true; this.pieImpact(target, side) } },
      draw: (ctx) => {
        if (hit) return
        const u = easeInCubic(Math.min(1, self.t / self.dur)) * 0.6 + Math.min(1, self.t / self.dur) * 0.4
        const x = (1 - u) ** 2 * start.x + 2 * (1 - u) * u * ctrl.x + u * u * target.x
        const y = (1 - u) ** 2 * start.y + 2 * (1 - u) * u * ctrl.y + u * u * target.y
        const s = lerp(0.55, 1.15, u)
        ctx.save(); ctx.translate(x, y); ctx.rotate(-side * u * 4); ctx.scale(s, s)
        ctx.fillStyle = '#B9BDC7'; ctx.beginPath(); ctx.ellipse(0, 14, 72, 22, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#D9A066'; ctx.beginPath(); ctx.ellipse(0, 6, 66, 22, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#FFFDF6'
        for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 18, -4 - Math.abs(i % 2) * 6, 20, 0, Math.PI * 2); ctx.fill() }
        ctx.fillStyle = '#E3263B'; ctx.beginPath(); ctx.arc(0, -22, 10, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      },
    }
    return self
  }

  private pieImpact(at: Vec, side: 1 | -1) {
    const p = this.char.pose
    p.headSquash.set(0.72); p.headRot.impulse(-side * 4); p.headY.impulse(-260); p.lean.impulse(-side * 0.6)
    const local = this.char.toHeadLocal(at)
    const cx = clamp(local.x, -FACE_W * 0.3, FACE_W * 0.3), cy = clamp(local.y, -FACE_H * 0.25, FACE_H * 0.3)
    const blobs = Array.from({ length: 10 }, () => ({ x: cx + rand(-70, 70), y: cy + rand(-60, 50), r: rand(20, 44), drip: 0, speed: 0 }))
    for (let i = 0; i < 4; i++) blobs.push({ x: cx + rand(-60, 60), y: cy + rand(10, 40), r: rand(10, 16), drip: 0, speed: rand(18, 40) })
    if (this.decals.length >= 4) this.decals.shift()
    this.decals.push({ kind: 'cream', t: 0, life: 6, blobs })
    this.setExpression('shut', 1.0, 2)
    this.schedule(1.0, () => this.setExpression('shock', 0.9, 1))
    this.hooks.sound('splat')
    if (Math.random() < 0.5) this.schedule(0.35, () => this.hooks.sound('yell'))
    this.popText('pie', at)
    this.burst(at, 20, 'cream', ['#FFFDF6', '#FFF1D6', '#F7D9B5'], [200, 600])
    this.shake(9)
    this.say('pie', 0.5)
    // tepsi kafadan kayıp düşer
    const tin = { x: at.x, y: at.y, vx: side * rand(120, 260), vy: -320, rot: 0, vr: side * 6 }
    const fall: Effect = {
      t: 0, dur: 1.2,
      update: (dt) => { fall.t += dt; tin.vy += 1500 * dt; tin.x += tin.vx * dt; tin.y += tin.vy * dt; tin.rot += tin.vr * dt },
      draw: (ctx) => {
        ctx.save(); ctx.globalAlpha = clamp(1 - (fall.t - 0.8) / 0.4, 0, 1); ctx.translate(tin.x, tin.y); ctx.rotate(tin.rot)
        ctx.fillStyle = '#B9BDC7'; ctx.beginPath(); ctx.ellipse(0, 0, 70, 20, 0, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#8D929E'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore()
      },
    }
    this.effects.push(fall)
  }

  // Su tabancası: ekran kenarından fışkırır, yüz ıslanır, karakter köpek gibi silkelenir
  private waterSquirt(target: Vec, side: 1 | -1): Effect {
    const gun = { x: side > 0 ? 770 : 30, y: clamp(target.y + 170, 200, 900) }
    const ang = Math.atan2(target.y - gun.y, target.x - gun.x)
    const muzzle = { x: gun.x + Math.cos(ang) * 90, y: gun.y + Math.sin(ang) * 90 }
    const travel = Math.hypot(target.x - muzzle.x, target.y - muzzle.y)
    const speed = 1500
    let wet = false, shook = false, emit = 0
    const self: Effect = {
      t: 0, dur: 1.15,
      update: (dt) => {
        self.t += dt
        if (self.t > 0.06 && self.t < 0.6) {
          emit += dt * 90
          while (emit >= 1) {
            emit -= 1
            if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
            const a = ang + rand(-0.035, 0.035)
            this.particles.push({ x: muzzle.x, y: muzzle.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: travel / speed, max: travel / speed,
              size: rand(7, 12), color: '#7FD3FF', gravity: 0, drag: 0, shape: 'stream', rot: 0, vr: 0 })
          }
        }
        if (!wet && self.t >= 0.06 + travel / speed) { wet = true; this.waterImpact(target, side) }
        if (!shook && self.t >= 0.72) { shook = true; this.dogShake() }
      },
      draw: (ctx) => {
        const slide = self.t < 0.08 ? easeOutCubic(self.t / 0.08) : self.t > 0.7 ? 1 - easeInCubic(Math.min(1, (self.t - 0.7) / 0.2)) : 1
        if (slide <= 0) return
        ctx.save()
        ctx.translate(gun.x + side * (1 - slide) * 160, gun.y); ctx.rotate(ang)
        ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.roundRect(-40, -26, 120, 52, 18); ctx.fill()
        ctx.fillStyle = '#2E86DE'; ctx.beginPath(); ctx.roundRect(60, -12, 34, 24, 8); ctx.fill()
        ctx.beginPath(); ctx.roundRect(-30, -54, 60, 34, 14); ctx.fill()
        ctx.fillStyle = '#1B1F3B'; ctx.beginPath(); ctx.roundRect(-34, 18, 28, 60, 10); ctx.fill()
        ctx.restore()
      },
    }
    this.hooks.sound('splash')
    return self
  }

  private waterImpact(at: Vec, side: 1 | -1) {
    const p = this.char.pose
    p.headRot.impulse(-side * 3); p.headSquash.set(0.88); p.jaw.impulse(5)
    const local = this.char.toHeadLocal(at)
    const blobs = Array.from({ length: 9 }, () => ({ x: clamp(local.x + rand(-90, 90), -FACE_W * 0.42, FACE_W * 0.42), y: clamp(local.y + rand(-70, 40), -FACE_H * 0.4, FACE_H * 0.3), r: rand(6, 11), drip: 0, speed: rand(30, 70) }))
    if (this.decals.length >= 4) this.decals.shift()
    this.decals.push({ kind: 'wet', t: 0, life: 4.5, blobs })
    this.setExpression('shut', 0.7, 2)
    this.popText('water', at)
    this.burst(at, 18, 'drop', ['#5BC0EB', '#9ADCFF', '#E8F7FF'], [250, 700])
    this.shake(5)
    this.say('water', 0.45)
  }

  private dogShake() {
    const p = this.char.pose
    for (let i = 0; i < 4; i++) this.schedule(i * 0.09, () => { p.headRot.impulse((i % 2 ? 1 : -1) * 9); this.burst(this.char.headCenter(), 6, 'drop', ['#5BC0EB', '#9ADCFF'], [400, 800]) })
    this.setExpression('shock', 0.8, 1)
    this.hooks.sound('splash', 0.5)
  }

  // Gıdıklama: tüy gövdede kıpırdar, karakter kahkahayla titrer
  private feather(at: Vec): Effect {
    const p = this.char.pose
    p.jitter = this.reduced ? 0.3 : 1
    p.armL.impulse(4); p.armR.impulse(-3)
    this.char.blush = 1
    this.setExpression('laugh', 1.4, 2)
    this.hooks.sound('giggle')
    this.popText('tickle', at)
    this.say('tickle', 0.6)
    let flap = 0
    const self: Effect = {
      t: 0, dur: 1.1,
      update: (dt) => {
        self.t += dt; flap += dt
        if (flap > 0.13 && self.t < 0.95) { flap = 0; p.jaw.impulse(9); p.squash.impulse(0.6) }
      },
      draw: (ctx) => {
        const a = self.t < 0.12 ? easeOutCubic(self.t / 0.12) : self.t > 0.9 ? clamp(1 - (self.t - 0.9) / 0.2, 0, 1) : 1
        ctx.save(); ctx.globalAlpha = a
        ctx.translate(at.x + Math.sin(self.t * 28) * 34, at.y + Math.cos(self.t * 19) * 10); ctx.rotate(-0.7 + Math.sin(self.t * 30) * 0.45)
        // tüy
        ctx.fillStyle = '#FF7AA8'
        ctx.beginPath(); ctx.moveTo(0, -110); ctx.bezierCurveTo(46, -80, 40, 10, 0, 40); ctx.bezierCurveTo(-40, 10, -46, -80, 0, -110); ctx.fill()
        ctx.strokeStyle = '#C2185B'; ctx.lineWidth = 4
        ctx.beginPath(); ctx.moveTo(0, -100); ctx.lineTo(0, 80); ctx.stroke()
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2
        for (let i = -80; i < 20; i += 14) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(22, i - 12); ctx.moveTo(0, i); ctx.lineTo(-22, i - 12); ctx.stroke() }
        ctx.restore()
      },
    }
    return self
  }

  // Komik surat: ifade değişir, kafa esner
  private funnyFace() {
    const faces: Expression[] = ['googly', 'tongue', 'shock', 'happy']
    const i = pickIndexAvoiding(faces.length, this.lastFace); this.lastFace = i
    const p = this.char.pose
    p.headSquash.set(1.28); p.brow.impulse(10)
    if (faces[i] === 'tongue' || faces[i] === 'shock') p.jaw.impulse(6)
    this.setExpression(faces[i], 2.4, 1)
    this.hooks.sound('boing')
    const h = this.char.headCenter()
    this.popText('face', { x: h.x, y: h.y - 120 })
    this.burst({ x: h.x, y: h.y - 40 }, 12, 'spark', ['#B98CFF', '#FFE066', '#FFFFFF'], [200, 450], { gravity: 200 })
    this.say('face', 0.5)
  }

  // Lastik tavuk: yukarıdan kafaya iner, yıldızlar döner
  private chickenBop(side: 1 | -1): Effect {
    const top = () => this.char.headToWorld({ x: 0, y: -FACE_H * 0.62 })
    const startOff = { x: side * 160, y: -520 }
    let hit = false
    let bounce = { x: 0, y: 0, vx: 0, vy: 0, r: 0 }
    const self: Effect = {
      t: 0, dur: 1.25,
      update: (dt) => {
        self.t += dt
        if (!hit && self.t >= 0.32) {
          hit = true
          const tp = top()
          bounce = { x: tp.x, y: tp.y, vx: side * 260, vy: -650, r: 0 }
          this.dizzyImpact(tp, side)
        }
        if (hit) { bounce.vy += 1800 * dt; bounce.x += bounce.vx * dt; bounce.y += bounce.vy * dt; bounce.r += side * 9 * dt }
      },
      draw: (ctx) => {
        let x: number, y: number, r: number
        if (!hit) {
          const tp = top(), u = easeInCubic(self.t / 0.32)
          x = tp.x + startOff.x * (1 - u); y = tp.y + startOff.y * (1 - u); r = side * (1 - u) * 2.4 - side * 0.4
        } else { x = bounce.x; y = bounce.y; r = bounce.r }
        ctx.save(); ctx.globalAlpha = hit ? clamp(1 - (self.t - 0.9) / 0.35, 0, 1) : 1
        ctx.translate(x, y); ctx.rotate(r + Math.PI)
        // lastik tavuk
        ctx.fillStyle = '#FFD84D'; ctx.strokeStyle = '#C79A00'; ctx.lineWidth = 4
        ctx.beginPath(); ctx.ellipse(0, 40, 40, 90, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.beginPath(); ctx.arc(0, -60, 32, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#E3263B'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 12, -92, 11, 0, Math.PI * 2); ctx.fill() }
        ctx.fillStyle = '#FF9F1C'; ctx.beginPath(); ctx.moveTo(-10, -50); ctx.lineTo(10, -50); ctx.lineTo(0, -22); ctx.fill()
        ctx.fillStyle = '#1B1F3B'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 13, -66, 5, 0, Math.PI * 2); ctx.fill() }
        ctx.strokeStyle = '#FF9F1C'; ctx.lineWidth = 6
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 14, 120); ctx.lineTo(s * 22, 168); ctx.stroke() }
        ctx.restore()
      },
    }
    return self
  }

  private dizzyImpact(at: Vec, side: 1 | -1) {
    const p = this.char.pose
    p.headSquash.set(0.74); p.squash.set(0.86); p.headRot.impulse(side * 4); p.wobble = this.reduced ? 0.35 : 1
    this.stars = { t: 0, life: 2.7 }
    this.setExpression('dizzy', 2.7, 3)
    this.hooks.sound('bonk', 0.8)
    this.schedule(0.18, () => this.hooks.sound('dizzy'))
    this.popText('dizzy', at)
    this.burst(at, 10, 'spark', ['#FFE066', '#FFFFFF'], [250, 500], { gravity: 300 })
    this.shake(10)
    this.schedule(0.9, () => this.say('dizzy', 0.8))
  }

  // Tezahürat: kollar havaya, zıplama, konfeti, kalabalık coşar
  private cheer() {
    const p = this.char.pose
    p.armL.target = 1; p.armR.target = 1; p.armL.impulse(4); p.armR.impulse(4)
    p.y.impulse(-1100); p.squash.set(0.86)
    this.schedule(1.6, () => { p.armL.target = 0; p.armR.target = 0 })
    for (let i = 0; i < 3; i++) this.schedule(0.15 + i * 0.32, () => p.jaw.impulse(10))
    this.setExpression('happy', 1.7, 1)
    this.hooks.sound('cheer')
    this.hooks.excite(1)
    const h = this.char.headCenter()
    this.popText('cheer', { x: h.x, y: h.y - 140 })
    for (let i = 0; i < this.n(70); i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
      this.particles.push({ x: rand(40, 760), y: rand(-80, -10), vx: rand(-80, 80), vy: rand(80, 260), life: rand(1.6, 2.6), max: 2.6,
        size: rand(8, 14), color: pick(CONFETTI), gravity: 260, drag: 0.6, shape: 'confetti', rot: rand(0, 6), vr: rand(-8, 8) })
    }
    this.say('cheer', 0.8)
  }

  // ── Döngü ─────────────────────────────────────────────────────────────────────
  update(dt: number) {
    this.now += dt
    if (this.later.length) {
      const due = this.later.filter(l => l.at <= this.now)
      this.later = this.later.filter(l => l.at > this.now)
      for (const l of due) l.fn()
    }
    if (this.now >= this.exprUntil && this.char.expression !== 'none') { this.char.expression = 'none'; this.exprPrio = 0 }

    for (const e of this.effects) e.update(dt)
    this.effects = this.effects.filter(e => e.t < e.dur)

    for (const p of this.particles) {
      p.life -= dt
      p.vy += p.gravity * dt
      const d = Math.max(0, 1 - p.drag * dt)
      p.vx *= d; p.vy *= d
      p.x += p.vx * dt; p.y += p.vy * dt
      p.rot += p.vr * dt
      // su akışı hedefe varınca damlaya dönüşür
      if (p.shape === 'stream' && p.life <= 0 && this.particles.length < MAX_PARTICLES - 3 && Math.random() < 0.35) {
        this.burst({ x: p.x, y: p.y }, 2, 'drop', ['#5BC0EB', '#9ADCFF'], [150, 450])
      }
    }
    this.particles = this.particles.filter(p => p.life > 0 && p.y < 1300)

    for (const d of this.decals) {
      d.t += dt
      for (const b of d.blobs) if (b.speed) b.drip = Math.min(d.kind === 'wet' ? 220 : 90, b.drip + b.speed * dt)
    }
    this.decals = this.decals.filter(d => d.t < d.life)
    for (const t of this.texts) t.t += dt
    this.texts = this.texts.filter(t => t.t < t.life)
    for (const f of this.floaters) { f.t += dt; f.y -= 90 * dt }
    this.floaters = this.floaters.filter(f => f.t < f.life)
    if (this.bubble) { this.bubble.t += dt; if (this.bubble.t > this.bubble.life) this.bubble = null }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null }
    if (this.stars) { this.stars.t += dt; if (this.stars.t > this.stars.life) this.stars = null }
  }

  /** Kafaya yapışık katmanlar (krema, su, yıldızlar) — kafa dönüşümüyle çizilir */
  drawHeadLayer(ctx: CanvasRenderingContext2D, screen: DOMMatrix) {
    if (!this.decals.length && !this.stars) return
    ctx.save()
    ctx.setTransform(screen.multiply(this.char.headMatrix))
    for (const d of this.decals) {
      const fade = clamp((d.life - d.t) / 1.2, 0, 1)
      ctx.globalAlpha = fade
      if (d.kind === 'cream') {
        for (const b of d.blobs) {
          ctx.fillStyle = '#FFFDF6'
          if (b.speed) { ctx.beginPath(); ctx.roundRect(b.x - b.r * 0.6, b.y, b.r * 1.2, b.drip, b.r * 0.6); ctx.fill(); ctx.beginPath(); ctx.arc(b.x, b.y + b.drip, b.r * 0.8, 0, Math.PI * 2); ctx.fill() }
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill()
        }
        ctx.fillStyle = 'rgba(214,196,170,0.5)'
        for (const b of d.blobs.slice(0, 5)) { ctx.beginPath(); ctx.arc(b.x + b.r * 0.3, b.y + b.r * 0.3, b.r * 0.45, 0, Math.PI * 2); ctx.fill() }
        const cherry = d.blobs[0]; ctx.fillStyle = '#E3263B'; ctx.beginPath(); ctx.arc(cherry.x, cherry.y - cherry.r * 0.6, 10, 0, Math.PI * 2); ctx.fill()
      } else {
        for (const b of d.blobs) {
          const y = b.y + b.drip
          ctx.fillStyle = 'rgba(127,211,255,0.75)'
          ctx.beginPath(); ctx.moveTo(b.x, y - b.r * 2.2); ctx.quadraticCurveTo(b.x + b.r, y, b.x, y + b.r); ctx.quadraticCurveTo(b.x - b.r, y, b.x, y - b.r * 2.2); ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, y - b.r * 0.2, b.r * 0.25, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
    ctx.globalAlpha = 1
    if (this.stars) {
      const s = this.stars, a = clamp(Math.min(s.t / 0.2, (s.life - s.t) / 0.4), 0, 1)
      ctx.globalAlpha = a
      for (let i = 0; i < 5; i++) {
        const ang = s.t * 4.2 + (i / 5) * Math.PI * 2
        const x = Math.cos(ang) * 150, y = -FACE_H * 0.62 + Math.sin(ang) * 34
        const depth = 0.75 + Math.sin(ang) * 0.25
        drawStar(ctx, x, y, 22 * depth, '#FFE066', ang * 2)
      }
    }
    ctx.restore()
  }

  /** Dünya katmanı: araç efektleri, parçacıklar, yazılar, balon, puanlar, afiş */
  drawFront(ctx: CanvasRenderingContext2D) {
    for (const e of this.effects) e.draw(ctx)
    for (const p of this.particles) {
      ctx.globalAlpha = p.shape === 'stream' ? 0.85 : clamp(p.life / (p.max * 0.4), 0, 1)
      ctx.fillStyle = p.color
      switch (p.shape) {
        case 'confetti': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); break
        case 'foam': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.roundRect(-p.size / 2, -p.size / 2, p.size, p.size, 3); ctx.fill(); ctx.restore(); break
        case 'spark': drawStar(ctx, p.x, p.y, p.size, p.color, p.rot); break
        case 'drop': {
          const a = Math.atan2(p.vy, p.vx)
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a)
          ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break
        }
        case 'stream': ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); break
        default: ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    // çizgi film yazıları
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    for (const t of this.texts) {
      const u = t.t / t.life
      const s = u < 0.3 ? easeOutBack(u / 0.3) : 1
      ctx.save(); ctx.globalAlpha = clamp((1 - u) / 0.3, 0, 1)
      ctx.translate(t.x, t.y - u * 30); ctx.rotate(t.rot); ctx.scale(s, s)
      ctx.font = `400 ${t.size}px ${FONT_DISPLAY}`
      ctx.lineWidth = 14; ctx.strokeStyle = '#1B1F3B'; ctx.strokeText(t.text, 0, 0)
      ctx.fillStyle = t.color; ctx.fillText(t.text, 0, 0)
      ctx.restore()
    }
    // puan yazıları
    for (const f of this.floaters) {
      ctx.save(); ctx.globalAlpha = clamp(1 - f.t / f.life, 0, 1)
      ctx.font = `800 34px ${FONT_BODY}`
      ctx.lineWidth = 8; ctx.strokeStyle = '#1B1F3B'; ctx.strokeText(f.text, f.x, f.y)
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y)
      ctx.restore()
    }
    // konuşma balonu (kafanın sağ üstünde)
    if (this.bubble) this.drawBubble(ctx, this.bubble)
    if (this.banner) {
      const b = this.banner, u = b.t / b.life
      const s = u < 0.15 ? easeOutBack(u / 0.15) : 1
      ctx.save(); ctx.globalAlpha = clamp((1 - u) / 0.15, 0, 1); ctx.translate(400, 150); ctx.scale(s, s); ctx.rotate(-0.04)
      ctx.font = `400 46px ${FONT_DISPLAY}`
      const w = ctx.measureText(b.text).width + 70
      ctx.fillStyle = '#FF4B3E'; ctx.beginPath(); ctx.roundRect(-w / 2, -42, w, 84, 18); ctx.fill()
      ctx.strokeStyle = '#1B1F3B'; ctx.lineWidth = 6; ctx.stroke()
      ctx.fillStyle = '#FFF4E0'; ctx.fillText(b.text, 0, 3)
      ctx.restore()
    }
  }

  private drawBubble(ctx: CanvasRenderingContext2D, b: Bubble) {
    const anchor = this.char.headToWorld({ x: FACE_W * 0.42, y: -FACE_H * 0.42 })
    const u = b.t / b.life
    const s = u < 0.18 ? easeOutBack(u / 0.18) : 1
    ctx.save()
    ctx.font = `800 30px ${FONT_BODY}`
    const w = Math.min(330, ctx.measureText(b.text).width + 44), h = 64
    const x = clamp(anchor.x + 40, 20, 780 - w), y = clamp(anchor.y - 90, 20, 900)
    ctx.globalAlpha = clamp((1 - u) / 0.2, 0, 1)
    ctx.translate(x, y + h); ctx.scale(s, s); ctx.translate(0, -h)
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1B1F3B'; ctx.lineWidth = 5
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, 26); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(26, h - 3); ctx.lineTo(10, h + 26); ctx.lineTo(52, h - 3); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(24, h - 8, 30, 8)
    ctx.fillStyle = '#1B1F3B'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(b.text, w / 2, h / 2 + 1, w - 24)
    ctx.restore()
  }
}

export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot)
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(27,31,59,0.55)'; ctx.lineWidth = Math.max(1.5, r * 0.12)
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = (i / 10) * Math.PI * 2 - Math.PI / 2
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore()
}

/** Demo / boş ekran için rastgele bir araç */
export const randomTool = (): ToolId => pick(['sponge', 'pie', 'water', 'tickle', 'face', 'dizzy', 'cheer'] as const)
