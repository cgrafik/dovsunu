// Merkezi animasyon denetimi: araç efektleri, karakter tepkileri, ifadeler, parçacıklar, yazılar, balonlar.
// • Her araç bir "efekt" başlatır (tokat eli, yaylı eldiven, uçan terlik, pasta…); çarpma anında tepki (ses + poz itkisi + ifade + yazı).
// • İfadeler öncelikli: daha önemli tepki (nakavt) varken önemsiz olan onu bozmaz.
// • Sınırlar: en çok MAX_PARTICLES parçacık, MAX_EFFECTS efekt, 6 yazı — çok hızlı basılsa da sistem bozulmaz.
import type { CharacterRenderer } from './CharacterRenderer'
import { FACE_H, FACE_W } from './CharacterRenderer'
import type { SoundId } from './SoundManager'
import { clamp, easeInCubic, easeOutBack, easeOutCubic, lerp, pick, pickIndexAvoiding, rand } from './math'
import { sceneById } from './scenes'
import type { Expression, ToolId, Vec } from './types'

const MAX_PARTICLES = 500
const MAX_EFFECTS = 14

export interface AnimHooks {
  sound: (id: SoundId, k?: number) => void
  shake: (amount: number) => void
  /** Sahneyi coştur (0..1): kalabalık, saat, tablo… */
  excite: (amount: number) => void
}

type PShape = 'dot' | 'foam' | 'cream' | 'drop' | 'confetti' | 'spark' | 'stream' | 'bill' | 'flame' | 'smoke'
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number; size: number
  color: string; gravity: number; drag: number; shape: PShape; rot: number; vr: number
  /** Banknot: kalan ömür bu değerin altına inince tutuşur, yanarak kısalır ve küle döner */
  burnAt?: number
}

interface Effect { t: number; dur: number; update(dt: number): void; draw(ctx: CanvasRenderingContext2D): void }

interface Decal {
  kind: 'cream' | 'wet' | 'hand' | 'bump' | 'stamp'
  t: number; life: number
  blobs: { x: number; y: number; r: number; drip: number; speed: number }[]
  /** el izi / şişlik: kafa yerel konum + açı */
  x?: number; y?: number; rot?: number
}
interface PopText { text: string; x: number; y: number; t: number; life: number; color: string; rot: number; size: number }
interface Floater { text: string; x: number; y: number; t: number; life: number; color: string }
interface Bubble { text: string; t: number; life: number }

const FONT_DISPLAY = '"Bungee", system-ui, sans-serif'
const FONT_BODY = '"Nunito Variable", "Nunito", system-ui, sans-serif'

const BUBBLES: Record<ToolId, readonly string[]> = {
  slap: ['Ayyy!', 'Yanağım!', 'Bu neydi?!', 'Şaka mı bu?!'],
  punch: ['Yıldızları gördüm!', 'Ufff!', 'Bu yumruk muydu?', 'Hakem!'],
  slipper: ['Anne?!', 'Terlik mi uçtu?!', 'Kaçamadım!', 'Uslu duracağım!'],
  sponge: ['Ayyy!', 'Kafam!', 'Yumuşakmış ama!', 'Yine mi?!'],
  pie: ['Kremalı mı bu?!', 'Gözüm!', 'Diyetteyim!', 'Çilekli mi?'],
  water: ['Islandım!', 'Hayır, saçım!', 'Soğuuk!', 'Yağmur mu yağıyor?'],
  dizzy: ['Neredeyim?', 'Yıldızlar...', 'Bugün günlerden ne?', 'Tavuk mu konuştu?'],
  tickle: ['Hahaha dur!', 'Gıdıklanıyorum!', 'Yapmaa!', 'Hihihi!'],
  shock: ['Saçlarım!', 'Fişi çekin!', 'Bzzt bzzt!', 'Elektrik faturası kimde?!'],
  loan: ['Benim imzam yok!', 'Ne kredisi?!', 'Faizi ne kadar?!', 'Paralarım yanıyor!'],
}
const TEXTS: Record<ToolId, readonly string[]> = {
  slap: ['ŞAAP!', 'ŞLAK!', 'TOKAT!', 'ŞAK!'],
  punch: ['POW!', 'GÜM!', 'DAN!', 'KÜT!'],
  slipper: ['TAK!', 'PAT!', 'ŞAPP!', 'TIK!'],
  sponge: ['BONK!', 'POF!', 'PAT!', 'DONK!'],
  pie: ['ŞLAP!', 'ŞAP!', 'PLOF!'],
  water: ['FIŞŞ!', 'ŞIPP!', 'VIZZ!'],
  dizzy: ['ZONK!', 'GAKK!', 'BIDIK!'],
  tickle: ['KIKIR!', 'HİHİ!', 'GIDI GIDI!'],
  shock: ['BZZZT!', 'ZIRRT!', 'VIZZT!'],
  loan: ['ONAYLANDI!', 'DAMGA!', 'ÇAT!'],
}
const TEXT_COLORS: Record<ToolId, string> = {
  slap: '#FF8FB1', punch: '#FF4B3E', slipper: '#5BC0EB', sponge: '#FFC93C', pie: '#FFB3C7', water: '#7FD3FF', dizzy: '#FFE066', tickle: '#FF9F43', shock: '#FFF06B', loan: '#7BE495',
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
  private lastLine = -1
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
    if (Math.random() < 0.3) { this.sayLine(); return }
    const list = BUBBLES[tool]
    const i = pickIndexAvoiding(list.length, this.lastBubble.get(tool) ?? -1)
    this.lastBubble.set(tool, i)
    this.bubble = { text: list[i], t: 0, life: 1.7 }
  }

  /** Ortama özgü laf (boşta beklerken de söylenir) */
  sayLine() {
    const lines = sceneById(this.char.look.scene).lines
    this.lastLine = pickIndexAvoiding(lines.length, this.lastLine)
    this.bubble = { text: lines[this.lastLine], t: 0, life: 2.2 }
  }

  /** Her 10 komboda: karakter nakavt olur (yıldızlar, sersem gözler, konfeti) */
  knockout() {
    const p = this.char.pose
    p.wobble = this.reduced ? 0.35 : 1; p.headSquash.set(0.8); p.squash.set(0.85); p.armL.impulse(5); p.armR.impulse(5)
    this.stars = { t: 0, life: 2.6 }
    this.setExpression('dizzy', 2.4, 4)
    this.hooks.sound('dizzy'); this.hooks.sound('bell')
    this.hooks.excite(1)
    const h = this.char.headCenter()
    // o anki laf balonu ve vuruş yazıları "NAKAVT!" ile üst üste binmesin
    this.bubble = null
    this.texts = this.texts.filter(t => t.t > t.life * 0.6)
    this.texts.push({ text: 'NAKAVT!', x: 400, y: 150, t: 0, life: 1.4, color: '#FF4B3E', rot: -0.06, size: 92 })
    this.burst({ x: h.x, y: h.y - 120 }, 26, 'confetti', CONFETTI, [250, 650], { gravity: 600, life: 1.4, max: 1.4 })
  }

  private addDecal(d: Decal) {
    if (this.decals.length >= 7) this.decals.shift()
    this.decals.push(d)
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
      case 'slap': this.effects.push(this.slapSwing(target, side)); break
      case 'punch': this.effects.push(this.gloveSpring(target, side)); break
      case 'slipper': this.effects.push(this.slipperThrow(side)); break
      case 'sponge': this.effects.push(this.spongeSwing(target, side)); break
      case 'pie': this.effects.push(this.pieThrow(target, side)); break
      case 'water': this.effects.push(this.waterSquirt(target, side)); break
      case 'dizzy': this.effects.push(this.chickenBop(side)); break
      case 'tickle': this.effects.push(this.feather(zone === 'body' ? at : this.char.bodyToWorld({ x: rand(-60, 60), y: -150 }))); break
      case 'shock': this.effects.push(this.shockZap(side)); break
      case 'loan': this.effects.push(this.loanStamp(side)); break
    }
  }

  // Tokat: dev çizgi film eli yandan savrulur, yanakta kırmızı el izi kalır
  private slapSwing(target: Vec, side: 1 | -1): Effect {
    const IN = 0.15
    let hit = false
    this.hooks.sound('whoosh')
    const self: Effect = {
      t: 0, dur: 0.5,
      update: (dt) => { self.t += dt; if (!hit && self.t >= IN) { hit = true; this.slapImpact(target, side) } },
      draw: (ctx) => {
        const t = self.t
        const u = t < IN ? easeInCubic(t / IN) : 1 - easeOutCubic(Math.min(1, (t - IN) / 0.3)) * 0.8
        const x = target.x + side * lerp(430, 70, u), y = target.y + lerp(-60, 10, u)
        ctx.save(); ctx.globalAlpha = t > 0.35 ? clamp(1 - (t - 0.35) / 0.15, 0, 1) : 1
        // hız çizgileri
        if (t < IN + 0.05) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 6; ctx.lineCap = 'round'
          for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + side * 90, y + i * 34); ctx.lineTo(x + side * 190, y + i * 34); ctx.stroke() }
        }
        ctx.translate(x, y); ctx.rotate(side * (0.35 - u * 0.5)); ctx.scale(side, 1)
        drawCartoonHand(ctx)
        ctx.restore()
      },
    }
    return self
  }

  private slapImpact(at: Vec, side: 1 | -1) {
    this.char.impact(at, side, 1)
    const p = this.char.pose
    p.headRot.impulse(-side * 11); p.headX.impulse(-side * 950); p.jaw.impulse(6); p.lean.impulse(-side * 0.9)
    p.armL.impulse(rand(3, 6)); p.armR.impulse(rand(3, 6))
    this.addDecal({ kind: 'hand', t: 0, life: 4.5, blobs: [], x: side * FACE_W * 0.24, y: FACE_H * 0.06, rot: side * rand(0.1, 0.4) })
    this.char.blush = 1
    this.setExpression('shut', 0.45, 2)
    this.schedule(0.45, () => this.setExpression('shock', 0.7, 1))
    this.hooks.sound('slap')
    if (Math.random() < 0.45) this.schedule(0.12, () => this.hooks.sound('yell'))
    this.popText('slap', at)
    this.burst(at, 12, 'spark', ['#FFFFFF', '#FFB3C7', '#FFE066'], [250, 600], { gravity: 300 })
    this.shake(11)
    this.say('slap', 0.4)
  }

  // Boks eldiveni: ekran kenarından yaylı kolla fırlar, kafa geriye savrulur
  private gloveSpring(target: Vec, side: 1 | -1): Effect {
    const base = { x: side > 0 ? 880 : -80, y: clamp(target.y + 30, 200, 900) }
    const reach = { x: target.x + side * 70, y: target.y + 10 }
    const OUT = 0.11
    let hit = false
    this.hooks.sound('boing', 0.6)
    const self: Effect = {
      t: 0, dur: 0.55,
      update: (dt) => { self.t += dt; if (!hit && self.t >= OUT) { hit = true; this.punchImpact(target, side) } },
      draw: (ctx) => {
        const t = self.t
        const u = t < OUT ? easeOutCubic(t / OUT) : t < 0.22 ? 1 : 1 - easeInCubic(Math.min(1, (t - 0.22) / 0.3))
        const g = { x: lerp(base.x, reach.x, u), y: lerp(base.y, reach.y, u) }
        // yay (zikzak)
        const n = 12, dx = g.x - base.x, dy = g.y - base.y, len = Math.hypot(dx, dy) || 1
        const nx = -dy / len, ny = dx / len
        ctx.strokeStyle = '#9AA4AF'; ctx.lineWidth = 8; ctx.lineJoin = 'round'
        ctx.beginPath(); ctx.moveTo(base.x, base.y)
        for (let i = 1; i < n; i++) { const k = i / n, o = (i % 2 ? 1 : -1) * 22; ctx.lineTo(base.x + dx * k + nx * o, base.y + dy * k + ny * o) }
        ctx.lineTo(g.x, g.y); ctx.stroke()
        ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.atan2(-dy, -dx) + Math.PI)
        ctx.fillStyle = '#F4F1E8'; ctx.beginPath(); ctx.roundRect(-74, -34, 34, 68, 10); ctx.fill()
        ctx.fillStyle = '#D7263D'; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 5
        ctx.beginPath(); ctx.ellipse(0, 0, 62, 54, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.beginPath(); ctx.ellipse(-14, -44, 30, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(10, 18, 30, 12, 0, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      },
    }
    return self
  }

  private punchImpact(at: Vec, side: 1 | -1) {
    this.char.impact(at, side, 1.3)
    const p = this.char.pose
    p.headRot.impulse(-side * 7); p.headX.impulse(-side * 1150); p.headY.impulse(-260); p.headSquash.set(0.78)
    p.lean.impulse(-side * 1.5); p.squash.set(0.9); p.jaw.impulse(9); p.armL.impulse(5); p.armR.impulse(5)
    this.setExpression('googly', 1.1, 2)
    this.hooks.sound('punch')
    if (Math.random() < 0.5) this.schedule(0.15, () => this.hooks.sound('yell'))
    this.popText('punch', at)
    this.burst(at, 16, 'spark', ['#FFE066', '#FFFFFF', '#FF8FB1'], [300, 750], { gravity: 250 })
    this.shake(16)
    this.say('punch', 0.4)
  }

  // Terlik: köşeden dönerek uçar, kafaya iner, sekip düşer; kafada çizgi film şişliği kalır
  private slipperThrow(side: 1 | -1): Effect {
    const start = { x: 400 + side * 560, y: -160 }
    const off = rand(-30, 30)
    const top = () => this.char.headToWorld({ x: off, y: -FACE_H * 0.42 })
    let aim = top()
    const FLY = 0.42
    let hit = false
    let b = { x: 0, y: 0, vx: 0, vy: 0, r: 0 }
    this.hooks.sound('whoosh')
    const self: Effect = {
      t: 0, dur: 1.4,
      update: (dt) => {
        self.t += dt
        if (!hit) aim = top()
        if (!hit && self.t >= FLY) { hit = true; b = { x: aim.x, y: aim.y, vx: side * 240, vy: -600, r: 0 }; this.slipperImpact(aim, side) }
        if (hit) { b.vy += 1700 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.r += side * 11 * dt }
      },
      draw: (ctx) => {
        let x: number, y: number, r: number
        if (!hit) {
          const u = Math.min(1, self.t / FLY), ctrl = { x: lerp(start.x, aim.x, 0.5), y: Math.min(start.y, aim.y) - 120 }
          x = (1 - u) ** 2 * start.x + 2 * (1 - u) * u * ctrl.x + u * u * aim.x
          y = (1 - u) ** 2 * start.y + 2 * (1 - u) * u * ctrl.y + u * u * aim.y
          r = -side * u * Math.PI * 4
        } else { x = b.x; y = b.y; r = b.r }
        ctx.save(); ctx.globalAlpha = hit ? clamp(1 - (self.t - 1.0) / 0.4, 0, 1) : 1
        ctx.translate(x, y); ctx.rotate(r)
        drawSlipper(ctx)
        ctx.restore()
      },
    }
    return self
  }

  private slipperImpact(at: Vec, side: 1 | -1) {
    this.char.impact(at, side, 0.9)
    const p = this.char.pose
    p.headSquash.set(0.68); p.headY.impulse(380); p.squash.set(0.84); p.headRot.impulse(side * 3); p.jaw.impulse(7)
    const local = this.char.toHeadLocal(at)
    this.addDecal({ kind: 'bump', t: 0, life: 6, blobs: [], x: clamp(local.x, -70, 70), y: -FACE_H * 0.44, rot: rand(-0.3, 0.3) })
    this.setExpression('shut', 0.5, 2)
    this.schedule(0.5, () => this.setExpression('shock', 0.8, 1))
    this.hooks.sound('thwack')
    if (Math.random() < 0.4) this.schedule(0.18, () => this.hooks.sound('yell'))
    this.popText('slipper', at)
    this.burst(at, 10, 'spark', ['#FFE066', '#FFFFFF'], [200, 500], { gravity: 300 })
    this.shake(10)
    this.say('slipper', 0.5)
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
    this.char.impact(at, side, 1.1)
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
    this.char.impact(at, side, 0.7)
    const p = this.char.pose
    p.headSquash.set(0.72); p.headRot.impulse(-side * 4); p.headY.impulse(-260); p.lean.impulse(-side * 0.6)
    const local = this.char.toHeadLocal(at)
    const cx = clamp(local.x, -FACE_W * 0.3, FACE_W * 0.3), cy = clamp(local.y, -FACE_H * 0.25, FACE_H * 0.3)
    const blobs = Array.from({ length: 10 }, () => ({ x: cx + rand(-70, 70), y: cy + rand(-60, 50), r: rand(20, 44), drip: 0, speed: 0 }))
    for (let i = 0; i < 4; i++) blobs.push({ x: cx + rand(-60, 60), y: cy + rand(10, 40), r: rand(10, 16), drip: 0, speed: rand(18, 40) })
    this.addDecal({ kind: 'cream', t: 0, life: 6, blobs })
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
    this.char.impact(at, side, 0.3)
    const p = this.char.pose
    p.headRot.impulse(-side * 3); p.headSquash.set(0.88); p.jaw.impulse(5)
    const local = this.char.toHeadLocal(at)
    const blobs = Array.from({ length: 9 }, () => ({ x: clamp(local.x + rand(-90, 90), -FACE_W * 0.42, FACE_W * 0.42), y: clamp(local.y + rand(-70, 40), -FACE_H * 0.4, FACE_H * 0.3), r: rand(6, 11), drip: 0, speed: rand(30, 70) }))
    this.addDecal({ kind: 'wet', t: 0, life: 4.5, blobs })
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
    this.char.impact(at, side, 0.8)
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

  // Elektrik: tepeden yıldırım iner; karakter titreyip yanıp söner, saçları dikilir, yüzü isle kararır, kafasından duman çıkar
  private shockZap(side: 1 | -1): Effect {
    const IN = 0.12, ZAP = 1.0
    let hit = false
    this.hooks.sound('zap')
    const self: Effect = {
      t: 0, dur: IN + ZAP + 0.1,
      update: (dt) => {
        self.t += dt
        if (!hit && self.t >= IN) { hit = true; this.shockImpact(side) }
        const on = hit && self.t < IN + ZAP
        this.char.zap = on ? 1 : 0
        if (on) {
          this.char.pose.jitter = Math.max(this.char.pose.jitter, 0.9)
          if (Math.random() < dt * 30) {
            const h = this.char.headCenter(), a = rand(0, Math.PI * 2), r = rand(90, 190)
            this.burst({ x: h.x + Math.cos(a) * r, y: h.y + 80 + Math.sin(a) * r * 1.4 }, 2, 'spark', ['#FFF6A8', '#FFFFFF', '#9BE7FF'], [150, 420], { gravity: 250 })
          }
        }
      },
      draw: (ctx) => {
        const t = self.t, h = this.char.headCenter()
        ctx.save()
        if (t < IN + 0.07) {
          const u = clamp(t / IN, 0, 1), top = { x: h.x + side * 90, y: -420 }
          drawBolt(ctx, top, { x: lerp(top.x, h.x, u), y: lerp(top.y, h.y - 120, u) }, 26, '#FFF06B')
        }
        if (hit && t < IN + ZAP) {
          // vücudu saran kıvılcım arkları (her karede yeniden: çıtırdar)
          for (let i = 0; i < 4; i++) {
            const a = rand(0, Math.PI * 2), r1 = rand(120, 170), a2 = a + rand(0.5, 1.2)
            drawBolt(ctx, { x: h.x + Math.cos(a) * r1, y: h.y + Math.sin(a) * r1 }, { x: h.x + Math.cos(a2) * r1, y: h.y + Math.sin(a2) * r1 }, 12, i % 2 ? '#9BE7FF' : '#FFF06B')
          }
          for (let i = 0; i < 2; i++) {
            const p1 = this.char.bodyToWorld({ x: rand(-170, 170), y: rand(-300, 40) }), p2 = this.char.bodyToWorld({ x: rand(-170, 170), y: rand(-300, 40) })
            drawBolt(ctx, p1, p2, 10, '#FFF06B')
          }
          if (Math.sin(t * 48) > 0.55) { ctx.fillStyle = 'rgba(255,250,210,0.13)'; ctx.fillRect(-600, -1200, 2000, 2400) }
        }
        ctx.restore()
      },
    }
    return self
  }

  private shockImpact(side: 1 | -1) {
    const p = this.char.pose, h = this.char.headCenter()
    p.armL.impulse(10); p.armR.impulse(10); p.jaw.impulse(11); p.headY.impulse(-320); p.squash.set(1.12)
    this.char.impact(h, side, 0.6)
    this.char.soot = 1
    this.char.blush = 0
    this.setExpression('shock', 1.05, 3)
    this.schedule(1.05, () => this.setExpression('dizzy', 1.3, 2))
    this.hooks.sound('buzz')
    this.schedule(0.15, () => this.hooks.sound('yell'))
    this.schedule(0.45, () => this.hooks.sound('zap'))
    this.popText('shock', h)
    this.shake(9)
    this.hooks.excite(0.6)
    // elektrik bitince kafadan duman tüter
    for (let i = 0; i < 4; i++) this.schedule(1.0 + i * 0.25, () => {
      const top = this.char.headToWorld({ x: rand(-60, 60), y: -FACE_H * 0.5 })
      this.burst(top, 3, 'smoke', ['rgba(70,70,78,0.55)', 'rgba(120,120,130,0.5)'], [30, 90], { gravity: -140, drag: 1.4, life: 1.5, max: 1.5, size: 16 })
    })
    this.schedule(1.1, () => this.say('shock', 0.9))
  }

  // Kredi çek: dev mühür alnına "KREDİ ONAY" basar; ceplerinden paralar fırlar, havada tutuşup kül olur
  private loanStamp(side: 1 | -1): Effect {
    const IN = 0.32
    let hit = false
    this.hooks.sound('whoosh')
    const spot = () => this.char.headToWorld({ x: 0, y: -FACE_H * 0.17 })
    const self: Effect = {
      t: 0, dur: IN + 0.45,
      update: (dt) => { self.t += dt; if (!hit && self.t >= IN) { hit = true; this.loanImpact(spot(), side) } },
      draw: (ctx) => {
        const t = self.t, s0 = spot()
        let y: number, a = 1
        if (t < IN) y = lerp(-380, s0.y - 70, easeInCubic(t / IN))
        else { const u = clamp((t - IN) / 0.45, 0, 1); y = s0.y - 70 - easeOutCubic(u) * 160; a = 1 - u }
        ctx.save(); ctx.globalAlpha = a; ctx.translate(s0.x + side * 6, y); ctx.rotate(side * -0.08)
        drawRubberStamp(ctx)
        ctx.restore()
      },
    }
    return self
  }

  private loanImpact(at: Vec, side: 1 | -1) {
    const p = this.char.pose
    p.headY.impulse(460); p.headSquash.set(0.78); p.squash.set(0.9); p.jaw.impulse(6)
    this.char.impact(at, side, 0.7)
    this.addDecal({ kind: 'stamp', t: 0, life: 4.5, blobs: [], x: rand(-10, 10), y: -FACE_H * 0.17, rot: rand(-0.18, 0.08) })
    this.hooks.sound('stamp')
    this.setExpression('shock', 0.9, 2)
    this.popText('loan', at)
    const debt = pick(['75.000', '250.000', '500.000', '1.000.000'])
    this.floater(`-${debt} ₺ BORÇ`,{ x: clamp(at.x, 170, 630), y: at.y - 150 }, '#FF4B3E')
    this.shake(7)
    // paralar ceplerden fırlar
    this.schedule(0.22, () => {
      this.hooks.sound('cash')
      const pocket = this.char.bodyToWorld({ x: 0, y: -110 })
      for (let i = 0; i < this.n(14); i++) {
        if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
        const life = rand(1.6, 2.1)
        this.particles.push({
          x: pocket.x + rand(-90, 90), y: pocket.y + rand(-30, 30), vx: rand(-300, 300), vy: rand(-720, -420), life, max: life,
          size: rand(26, 34), color: '#7BC47F', gravity: 420, drag: 1.5, shape: 'bill', rot: rand(-1, 1), vr: rand(-5, 5), burnAt: life - rand(0.45, 0.7),
        })
      }
    })
    this.schedule(0.7, () => this.hooks.sound('fire'))
    this.schedule(0.5, () => this.say('loan', 1))
    // ağlama: gözlerden yaş damlaları
    this.schedule(1.0, () => this.setExpression('shut', 1.3, 2))
    const f = this.char.face.features
    for (let i = 0; i < 7; i++) this.schedule(1.0 + i * 0.17, () => {
      for (const e of [f.leftEye, f.rightEye]) {
        const w = this.char.headToWorld(this.char.featureLocal({ x: e.x, y: e.y + 0.04 }))
        this.burst(w, 1, 'drop', ['#7FD3FF', '#BDEBFF'], [60, 160], { gravity: 900, size: 7 })
      }
    })
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
    // yanan banknotlar: alev saçar, bitince küle döner
    for (const p of this.particles) {
      if (p.shape !== 'bill' || p.burnAt === undefined || p.life > p.burnAt) continue
      if (this.particles.length < MAX_PARTICLES - 4 && Math.random() < dt * 22) {
        this.particles.push({ x: p.x + rand(-p.size, p.size), y: p.y, vx: rand(-30, 30), vy: rand(-160, -60), life: 0.45, max: 0.45, size: rand(7, 12), color: pick(['#FFB020', '#FF6A1A', '#FFE066']), gravity: -200, drag: 2, shape: 'flame', rot: 0, vr: 0 })
      }
      if (p.life <= 0) this.burst({ x: p.x, y: p.y }, 3, 'dot', ['#3A3330', '#5C5450', '#2A2422'], [30, 90], { gravity: 260, size: 4, life: 1, max: 1 })
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
      } else if (d.kind === 'hand') {
        ctx.save(); ctx.translate(d.x ?? 0, d.y ?? 0); ctx.rotate(d.rot ?? 0)
        ctx.globalAlpha = fade * 0.5; ctx.fillStyle = '#E2304A'
        ctx.beginPath(); ctx.ellipse(0, 6, 30, 34, 0, 0, Math.PI * 2); ctx.fill()
        for (const [fx, h] of [[-24, 40], [-8, 48], [8, 46], [23, 38]] as const) { ctx.beginPath(); ctx.roundRect(fx - 7, -22 - h, 14, h + 6, 7); ctx.fill() }
        ctx.save(); ctx.translate(-30, 14); ctx.rotate(-0.9); ctx.beginPath(); ctx.roundRect(-7, -38, 14, 40, 7); ctx.fill(); ctx.restore()
        ctx.restore()
      } else if (d.kind === 'stamp') {
        const g = d.t < 0.12 ? easeOutBack(d.t / 0.12) : 1
        ctx.save(); ctx.translate(d.x ?? 0, d.y ?? 0); ctx.rotate(d.rot ?? 0); ctx.scale(g, g)
        ctx.globalAlpha = fade * 0.9
        ctx.strokeStyle = '#D7263D'; ctx.lineWidth = 7
        ctx.beginPath(); ctx.roundRect(-120, -38, 240, 76, 10); ctx.stroke()
        ctx.fillStyle = '#D7263D'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = `400 32px ${FONT_DISPLAY}`; ctx.fillText('KREDİ ONAY', 0, -8, 222)
        ctx.font = `800 16px ${FONT_BODY}`; ctx.fillText('FAİZ %300 · 120 AY', 0, 22, 222)
        ctx.restore()
      } else if (d.kind === 'bump') {
        const g = d.t < 0.25 ? easeOutBack(d.t / 0.25) : 1, rad = 30 * g
        ctx.save(); ctx.translate(d.x ?? 0, d.y ?? 0); ctx.rotate(d.rot ?? 0)
        ctx.fillStyle = this.char.face.skin; ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.ellipse(0, 0, rad, rad * 1.05, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(235,80,95,0.45)'; ctx.beginPath(); ctx.ellipse(0, 0, rad * 0.8, rad * 0.8, 0, Math.PI, 0); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-rad * 0.35, -rad * 0.6, rad * 0.22, rad * 0.14, -0.5, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
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
        case 'bill': ctx.globalAlpha = 1; drawBill(ctx, p); break
        case 'flame': { const r = p.size * clamp(p.life / p.max, 0.25, 1); ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.7, r, 0, 0, Math.PI * 2); ctx.fill(); break }
        case 'smoke': { const r = p.size * (1 + (p.max - p.life) * 1.6); ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); break }
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

/** Tokat eli: avuç bize dönük, parmaklar yukarı (scale(-1, 1) ile aynalanır) */
function drawCartoonHand(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1B1F3B'; ctx.lineWidth = 6; ctx.lineJoin = 'round'
  for (const [fx, h] of [[-33, 70], [-11, 84], [11, 80], [33, 66]] as const) { ctx.beginPath(); ctx.roundRect(fx - 11, 4 - h, 22, h + 10, 11); ctx.fill(); ctx.stroke() }
  ctx.save(); ctx.translate(-46, 40); ctx.rotate(-0.8); ctx.beginPath(); ctx.roundRect(-11, -58, 22, 62, 11); ctx.fill(); ctx.stroke(); ctx.restore()
  ctx.beginPath(); ctx.roundRect(-46, -10, 92, 96, 34); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#E5323B'; ctx.beginPath(); ctx.roundRect(-50, 80, 100, 30, 10); ctx.fill(); ctx.stroke()
}

/** Plastik terlik: taban + üst bant */
function drawSlipper(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#2E6FD8'; ctx.strokeStyle = '#1B1F3B'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.ellipse(0, 0, 84, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#5BC0EB'; ctx.beginPath(); ctx.ellipse(-6, 0, 66, 22, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#FFC93C'; ctx.beginPath(); ctx.roundRect(14, -38, 40, 76, 14); ctx.fill(); ctx.stroke()
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
export const randomTool = (): ToolId => pick(['slap', 'punch', 'slipper', 'sponge', 'pie', 'water', 'dizzy', 'tickle', 'shock', 'loan'] as const)

/** Kırık çizgili yıldırım: dış parıltı + beyaz çekirdek */
function drawBolt(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, width: number, color: string) {
  const n = 7, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len
  const pts: Vec[] = [a]
  for (let i = 1; i < n; i++) { const k = i / n, o = rand(-1, 1) * len * 0.12; pts.push({ x: a.x + dx * k + nx * o, y: a.y + dy * k + ny * o }) }
  pts.push(b)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const [w, c, al] of [[width * 2.4, color, 0.35], [width, color, 1], [width * 0.35, '#FFFFFF', 1]] as const) {
    ctx.globalAlpha = al; ctx.strokeStyle = c; ctx.lineWidth = w
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** Ahşap saplı dev mühür (taban aşağıda) */
function drawRubberStamp(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#1B1F3B'; ctx.lineWidth = 5; ctx.lineJoin = 'round'
  ctx.fillStyle = '#A0632E'; ctx.beginPath(); ctx.ellipse(0, -150, 46, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#C17A3A'; ctx.beginPath(); ctx.roundRect(-18, -128, 36, 80, 10); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#5B6270'; ctx.beginPath(); ctx.roundRect(-110, -54, 220, 34, 8); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#D7263D'; ctx.beginPath(); ctx.roundRect(-104, -22, 208, 22, 6); ctx.fill(); ctx.stroke()
}

/** Banknot; burnAt'ten sonra üstten yanarak kısalır, yanan kenarda alev */
function drawBill(ctx: CanvasRenderingContext2D, p: Particle) {
  const b = p.burnAt !== undefined ? clamp((p.burnAt - p.life) / Math.max(0.01, p.burnAt), 0, 1) : 0
  const w = p.size * 1.9, h = p.size, left = h * (1 - b)
  if (left < 1) return
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot)
  const top = h / 2 - left
  ctx.fillStyle = '#7BC47F'; ctx.strokeStyle = '#2F6B3A'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.rect(-w / 2, top, w, left); ctx.fill(); ctx.stroke()
  ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, top, w, left); ctx.clip()
  ctx.fillStyle = '#5DA866'; ctx.beginPath(); ctx.ellipse(0, 0, h * 0.42, h * 0.36, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#E8F7E6'; ctx.font = `800 ${Math.round(h * 0.55)}px ${FONT_BODY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('₺', 0, 1)
  ctx.restore()
  if (b > 0) {
    ctx.fillStyle = '#2A1E18'; ctx.fillRect(-w / 2, top, w, Math.min(left, 4))
    ctx.fillStyle = '#FF8A1F'
    for (let i = 0; i < 4; i++) { const x = -w / 2 + (i + 0.5) * (w / 4), fh = rand(6, 14); ctx.beginPath(); ctx.ellipse(x, top - fh * 0.4, 5, fh * 0.6, 0, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = '#FFE066'
    for (let i = 0; i < 3; i++) { const x = -w / 2 + (i + 0.8) * (w / 3.4); ctx.beginPath(); ctx.ellipse(x, top - 3, 3, 6, 0, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.restore()
}
