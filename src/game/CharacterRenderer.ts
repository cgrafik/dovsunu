// Karakter: ortama göre kıyafetli gövde (takım elbise, atlet, aşçı önlüğü…) + kullanıcının yüzü + ifadeler + şapka.
// Poz yaylarla tutulur: animasyonlar itki verir, yaylar karakteri başlangıç pozuna geri getirir.
// Kafa dönüşümü (headMatrix) her karede hesaplanır; yüze yapışan efektler (pasta, su) bu dönüşümle çizilir → kaymaz.
import { FaceWarp, WARP_PAD_TOP, WARP_PAD_X, type FaceShape } from '../face/FaceWarp'
import { realBody, type RealBody } from './bodies'
import { Spring, clamp, seeded, shade } from './math'
import { sceneById, type Hat, type Outfit, type SceneDef } from './scenes'
import type { CharacterLook, Expression, FaceAsset, Vec } from './types'

/** Kafa yerel ölçüleri: yüz görseli bu dikdörtgene çizilir (oran 4:5) */
export const FACE_W = 260
export const FACE_H = 325
const HIP: Vec = { x: 400, y: 905 }
const NECK_TOP = -318          // gövde yerelinde boyun üstü
const HEAD_FROM_NECK = -150    // boyun üstünden kafa merkezine
const JAW_PX = 46
/** Gerçekçi gövde görselinin dünya genişliği (kollar dahil) */
const REAL_BODY_W = 540

/** Gerçekçi yüzde (ağ bükme) her ifadenin kanal ağırlıkları; jaw pozdan gelir */
const EXPRESSION_SHAPES: Record<Expression, Partial<FaceShape>> = {
  none: {},
  shut: { blinkL: 1, blinkR: 1, frown: 1, smile: -0.4 },
  laugh: { smile: 1, blinkL: 0.6, blinkR: 0.6, brow: 0.3 },
  happy: { smile: 0.8, blinkL: 0.35, blinkR: 0.35 },
  shock: { brow: 1, blinkL: -0.45, blinkR: -0.45, pucker: 0.7 },
  googly: { brow: 1, blinkL: -0.6, blinkR: -0.6, pucker: 0.3 },
  dizzy: { blinkL: 0.6, blinkR: 0.35, brow: 0.5, smile: -0.25 },
  tongue: { smile: 0.5, blinkR: 1 },
}

export class Pose {
  x = new Spring(0, 120, 11)
  y = new Spring(0, 170, 12)
  lean = new Spring(0, 140, 10)
  squash = new Spring(1, 230, 13)
  headRot = new Spring(0, 170, 9)
  headX = new Spring(0, 210, 12)
  headY = new Spring(0, 210, 12)
  headSquash = new Spring(1, 260, 10)
  armL = new Spring(0, 70, 9)
  armR = new Spring(0, 70, 9)
  jaw = new Spring(0, 240, 16)
  brow = new Spring(0, 120, 10)
  /** Gıdıklama titremesi (sönümlenir) */
  jitter = 0
  /** Sersemleme: kafa daire çizer (sönümlenir) */
  wobble = 0

  private all() { return [this.x, this.y, this.lean, this.squash, this.headRot, this.headX, this.headY, this.headSquash, this.armL, this.armR, this.jaw, this.brow] }

  update(dt: number) {
    for (const s of this.all()) s.update(dt)
    this.jitter = Math.max(0, this.jitter - dt * 1.1)
    this.wobble = Math.max(0, this.wobble - dt * 0.45)
    // güvenli sınırlar (üst üste itki gelse de poz kopmasın)
    this.headRot.value = clamp(this.headRot.value, -0.9, 0.9)
    this.headSquash.value = clamp(this.headSquash.value, 0.55, 1.5)
    this.squash.value = clamp(this.squash.value, 0.7, 1.3)
    this.jaw.value = clamp(this.jaw.value, 0, 1.3)
  }

  reset() { for (const s of this.all()) { s.value = s.target; s.velocity = 0 } this.jitter = 0; this.wobble = 0 }
}

export class CharacterRenderer {
  pose = new Pose()
  face: FaceAsset
  look: CharacterLook
  expression: Expression = 'none'
  /** Göz kırpma zamanlaması */
  private blinkAt = 2
  private blinkT = -1
  private t = 0
  /** Komik gözlerin göz bebeği fiziği */
  private googly = [{ x: 0, y: 0, vx: 0, vy: 0 }, { x: 0, y: 0, vx: 0, vy: 0 }]
  private lastHead: Vec = { x: 0, y: 0 }
  /** Pervaneli şapkanın dönüş açısı (kafa sarsıldıkça hızlanır) */
  private spin = 0
  blush = 0
  /** Dünya → kafa yerel dönüşümü (efektler bunu kullanır) */
  headMatrix = new DOMMatrix()
  bodyMatrix = new DOMMatrix()
  /** Gerçekçi yüz (fotoğraf yüz ağına gerilir); yüz noktaları ya da WebGL yoksa null → eski çizim */
  private warp: FaceWarp | null = null
  private warpFace: FaceAsset | null = null
  private shape: FaceShape = { jaw: 0, blinkL: 0, blinkR: 0, smile: 0, brow: 0, frown: 0, pucker: 0, frizz: 0 }
  /** Elektrik çarpıyor (0..1): yüz parlar, saçlar dikilir */
  zap = 0
  /** Elektrikten kalan is (1 → 0 söner): yüz kararır, saçlar bir süre dik kalır */
  soot = 0

  constructor(face: FaceAsset, look: CharacterLook) {
    this.face = face
    this.look = look
  }

  /** Darbe: yüz ağı vuruş noktası çevresinde yaylanır (side: vuruşun geldiği yan) */
  impact(world: Vec, side: 1 | -1, power: number) {
    if (!this.warp) return
    const h = this.toHeadLocal(world)
    const E = this.face.expand
    this.warp.impact({ x: (h.x / (FACE_W * E) + 0.5) * this.warp.texW, y: (h.y / (FACE_H * E) + 0.5) * this.warp.texH }, { x: -side, y: 0.25 }, power)
  }

  /** Yüz rengi: elektrik anında yanıp sönen parlama, sonra is (kararma) */
  private tint(): [number, number, number] {
    if (this.zap > 0 && Math.sin(this.t * 55) > 0) return [1.9, 1.9, 1.5]
    const k = 1 - 0.62 * this.soot
    return [k, k * 0.97, k * 0.95]
  }

  dispose() { this.warp?.dispose(); this.warp = null; this.warpFace = null }

  private updateWarp(dt: number) {
    if (this.warpFace !== this.face) { this.warp?.dispose(); this.warpFace = this.face; this.warp = FaceWarp.create(this.face) }
    if (!this.warp) return
    const target = EXPRESSION_SHAPES[this.expression]
    const blink = this.expression === 'none' && this.blinkT > 0
    for (const c of ['blinkL', 'blinkR', 'smile', 'brow', 'frown', 'pucker'] as const) {
      const isBlink = c === 'blinkL' || c === 'blinkR'
      const t = isBlink && blink ? 1 : target[c] ?? 0
      this.shape[c] += (t - this.shape[c]) * (1 - Math.exp(-dt * (isBlink ? 40 : 14)))
    }
    this.soot = Math.max(0, this.soot - dt * 0.28)
    const flicker = this.zap > 0 ? 0.75 + 0.25 * Math.sin(this.t * 70) : 0
    this.shape.frizz = Math.max(this.zap * flicker, this.soot * 0.7)
    this.shape.jaw = this.pose.jaw.value * JAW_PX * (this.warp.texH / (FACE_H * this.face.expand))
    this.warp.update(dt)
  }

  /** Yüz özelliğini kafa yerel koordinatına çevir */
  featureLocal(p: Vec): Vec { return { x: (p.x - 0.5) * FACE_W, y: (p.y - 0.5) * FACE_H } }

  update(dt: number) {
    this.t += dt
    this.pose.update(dt)
    this.blush = Math.max(0, this.blush - dt * 0.4)
    // göz kırpma: 2,5–5 sn'de bir, 0,13 sn
    this.blinkAt -= dt
    if (this.blinkAt <= 0) { this.blinkT = 0.13; this.blinkAt = 2.5 + Math.random() * 2.5 }
    if (this.blinkT > 0) this.blinkT -= dt
    this.updateWarp(dt)
    this.computeMatrices()
    this.spin += dt * (5 + Math.min(40, Math.abs(this.pose.headRot.velocity) * 2 + this.pose.wobble * 25))
    // komik göz bebekleri kafanın hareketine gecikmeli tepki verir
    const hx = this.headMatrix.e, hy = this.headMatrix.f
    const ax = (hx - this.lastHead.x) / Math.max(dt, 1e-3), ay = (hy - this.lastHead.y) / Math.max(dt, 1e-3)
    this.lastHead = { x: hx, y: hy }
    for (const g of this.googly) {
      g.vx += (-ax * 0.02 - g.x * 60) * dt; g.vy += (-ay * 0.02 + 900 * 0.02 - g.y * 60) * dt
      g.vx *= 0.9; g.vy *= 0.9
      g.x = clamp(g.x + g.vx * dt, -14, 14); g.y = clamp(g.y + g.vy * dt, -14, 14)
    }
  }

  private computeMatrices() {
    const p = this.pose
    const breathe = Math.sin(this.t * 2.2) * 0.012
    const jx = p.jitter > 0 ? (Math.random() - 0.5) * 16 * p.jitter : 0
    const sy = p.squash.value + breathe, sx = 1 / Math.sqrt(Math.max(0.5, sy))
    this.bodyMatrix = new DOMMatrix()
      .translate(HIP.x + p.x.value + jx, HIP.y + p.y.value)
      .rotate((p.lean.value * 180) / Math.PI)
      .scale(sx, sy)
    const wob = p.wobble
    const wx = Math.cos(this.t * 7) * 18 * wob, wy = Math.sin(this.t * 7) * 8 * wob
    const hs = p.headSquash.value
    this.headMatrix = DOMMatrix.fromMatrix(this.bodyMatrix)
      .translate(0, NECK_TOP)
      .rotate(((p.headRot.value + Math.sin(this.t * 7) * 0.12 * wob) * 180) / Math.PI)
      .translate(p.headX.value + wx, p.headY.value + wy + HEAD_FROM_NECK)
      .scale(1 / Math.sqrt(hs), hs)
  }

  /** Dünya noktasının kafa yerel karşılığı */
  toHeadLocal(world: Vec): Vec { const m = this.headMatrix.inverse(); const q = m.transformPoint(new DOMPoint(world.x, world.y)); return { x: q.x, y: q.y } }
  headToWorld(local: Vec): Vec { const q = this.headMatrix.transformPoint(new DOMPoint(local.x, local.y)); return { x: q.x, y: q.y } }
  bodyToWorld(local: Vec): Vec { const q = this.bodyMatrix.transformPoint(new DOMPoint(local.x, local.y)); return { x: q.x, y: q.y } }
  headCenter(): Vec { return this.headToWorld({ x: 0, y: 0 }) }

  /** Dokunulan nokta karakterin neresinde */
  hitZone(world: Vec): 'head' | 'body' | 'none' {
    const h = this.toHeadLocal(world)
    if ((h.x / (FACE_W * 0.62)) ** 2 + (h.y / (FACE_H * 0.62)) ** 2 <= 1) return 'head'
    const b = this.bodyMatrix.inverse().transformPoint(new DOMPoint(world.x, world.y))
    if (b.x > -190 && b.x < 190 && b.y > NECK_TOP - 10 && b.y < 60) return 'body'
    return 'none'
  }

  // ── Çizim ────────────────────────────────────────────────────────────────────
  private get scene(): SceneDef { return sceneById(this.look.scene) }

  draw(ctx: CanvasRenderingContext2D, screen: DOMMatrix) {
    const sc = this.scene
    ctx.save()
    ctx.setTransform(screen.multiply(this.bodyMatrix))
    const real = realBody(this.look.body, sc.outfit, this.face.skin)
    if (real) this.drawRealBody(ctx, real, sc)
    else {
      this.drawArm(ctx, -1, this.pose.armL.value, sc)
      this.drawTorso(ctx, sc.outfit)
      this.drawArm(ctx, 1, this.pose.armR.value, sc)
    }
    ctx.restore()

    ctx.save()
    ctx.setTransform(screen.multiply(this.headMatrix))
    this.drawHead(ctx, sc.hat)
    ctx.restore()
  }

  /** Gerçekçi gövde (fotoğraf gibi): boynun ortası kafanın altına oturur; kollar görselin içinde */
  private drawRealBody(ctx: CanvasRenderingContext2D, body: RealBody, sc: SceneDef) {
    const k = REAL_BODY_W / body.meta.w
    // çene ile gövde arası: yüzün teninde, aşağı doğru genişleyen boyun; üstte çene gölgesi
    const top = NECK_TOP - 44, bottom = NECK_TOP + 30
    const neck = () => {
      ctx.beginPath()
      ctx.moveTo(-30, top); ctx.lineTo(30, top)
      ctx.quadraticCurveTo(31, bottom - 24, 44, bottom); ctx.lineTo(-44, bottom)
      ctx.quadraticCurveTo(-31, bottom - 24, -30, top); ctx.closePath()
    }
    ctx.fillStyle = this.face.skin; neck(); ctx.fill()
    const shadow = ctx.createLinearGradient(0, top, 0, bottom)
    shadow.addColorStop(0, 'rgba(40,20,10,0.45)'); shadow.addColorStop(0.55, 'rgba(40,20,10,0.12)'); shadow.addColorStop(1, 'rgba(40,20,10,0)')
    ctx.fillStyle = shadow; neck(); ctx.fill()
    const side = ctx.createLinearGradient(-44, 0, 44, 0)
    side.addColorStop(0, 'rgba(40,20,10,0.22)'); side.addColorStop(0.3, 'rgba(40,20,10,0)'); side.addColorStop(0.7, 'rgba(40,20,10,0)'); side.addColorStop(1, 'rgba(40,20,10,0.22)')
    ctx.fillStyle = side; neck(); ctx.fill()
    // kollar savruldukça gövde hafifçe omuzdan sallanır (görselde kol ayrı değil)
    const sway = clamp((this.pose.armR.value - this.pose.armL.value) * 0.03, -0.06, 0.06)
    ctx.save(); ctx.rotate(sway)
    ctx.drawImage(body.canvas, -body.meta.neckX * k, NECK_TOP - 30, body.meta.w * k, body.meta.h * k)
    if (sc.outfit === 'tank' && this.look.name) {
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = '400 26px "Bungee", system-ui, sans-serif'
      ctx.fillText(this.look.name.toLocaleUpperCase('tr').slice(0, 10), 0, NECK_TOP + 150, 200)
    }
    ctx.restore()
  }

  /** Gövde silueti: omuzlardan bele */
  private shirtPath(ctx: CanvasRenderingContext2D) {
    ctx.beginPath()
    ctx.moveTo(-150, NECK_TOP + 22)
    ctx.quadraticCurveTo(-178, NECK_TOP + 40, -170, NECK_TOP + 120)
    ctx.lineTo(-140, 90)
    ctx.lineTo(140, 90)
    ctx.lineTo(170, NECK_TOP + 120)
    ctx.quadraticCurveTo(178, NECK_TOP + 40, 150, NECK_TOP + 22)
    ctx.quadraticCurveTo(0, NECK_TOP - 6, -150, NECK_TOP + 22)
  }

  private drawTorso(ctx: CanvasRenderingContext2D, outfit: Outfit) {
    const c = this.look.color, skin = this.face.skin, N = NECK_TOP
    const fillShirt = (color: string) => { ctx.fillStyle = color; this.shirtPath(ctx); ctx.fill() }
    const clipped = (fn: () => void) => { ctx.save(); this.shirtPath(ctx); ctx.clip(); fn(); ctx.restore() }
    const poly = (pts: readonly (readonly [number, number])[]) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill() }
    // boyun
    ctx.fillStyle = skin
    ctx.beginPath(); ctx.roundRect(-40, N - 30, 80, 70, 24); ctx.fill()

    switch (outfit) {
      case 'suit': {
        fillShirt(c)
        ctx.fillStyle = '#F7F7F2'; poly([[-52, N + 12], [52, N + 12], [0, N + 212]])
        ctx.fillStyle = c === '#D7263D' ? '#1B2A6B' : '#D7263D'
        poly([[-16, N + 20], [16, N + 20], [10, N + 46], [-10, N + 46]])
        poly([[-10, N + 46], [10, N + 46], [24, N + 178], [0, N + 206], [-24, N + 178]])
        ctx.fillStyle = shade(c, -0.22)
        for (const s of [-1, 1]) poly([[s * 52, N + 12], [s * 108, N + 40], [s * 80, N + 92], [s * 100, N + 106], [s * 6, N + 212]])
        ctx.fillStyle = shade(c, -0.4)
        for (const y of [N + 244, N + 294]) { ctx.beginPath(); ctx.arc(0, y, 7, 0, Math.PI * 2); ctx.fill() }
        ctx.fillStyle = '#FFFFFF'; poly([[-132, N + 130], [-100, N + 130], [-108, N + 112], [-122, N + 118]])
        break
      }
      case 'tank': {
        fillShirt(skin)
        clipped(() => {
          ctx.fillStyle = c
          ctx.beginPath()
          ctx.moveTo(-74, N + 2); ctx.lineTo(-44, N + 2)
          ctx.quadraticCurveTo(0, N + 96, 44, N + 2); ctx.lineTo(74, N + 2)
          ctx.quadraticCurveTo(92, N + 124, 160, N + 164); ctx.lineTo(170, 120); ctx.lineTo(-170, 120); ctx.lineTo(-160, N + 164)
          ctx.quadraticCurveTo(-92, N + 124, -74, N + 2)
          ctx.fill()
        })
        if (this.look.name) {
          ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.font = '400 30px "Bungee", system-ui, sans-serif'
          ctx.fillText(this.look.name.toLocaleUpperCase('tr').slice(0, 10), 0, N + 170, 230)
        }
        break
      }
      case 'chef': {
        fillShirt('#FAFAF7')
        clipped(() => {
          ctx.fillStyle = '#C9CED6'
          for (let row = 0; row < 3; row++) for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 40, N + 64 + row * 44, 7, 0, Math.PI * 2); ctx.fill() }
          ctx.strokeStyle = c; ctx.lineWidth = 12; ctx.lineCap = 'round'
          for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 94, N + 140); ctx.lineTo(s * 36, N + 18); ctx.stroke() }
          ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(-106, N + 134, 212, 420, 20); ctx.fill()
          ctx.fillStyle = shade(c, -0.22); ctx.beginPath(); ctx.roundRect(-52, N + 214, 104, 58, 10); ctx.fill()
        })
        ctx.fillStyle = '#FAFAF7'; ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.roundRect(-56, N - 8, 112, 32, 12); ctx.fill(); ctx.stroke()
        break
      }
      case 'sweater': {
        fillShirt(c)
        clipped(() => {
          for (const [y, col, lw] of [[N + 150, shade(c, 0.5), 12], [N + 178, shade(c, -0.25), 8]] as const) {
            ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'miter'
            ctx.beginPath(); for (let x = -210, k = 0; x <= 210; x += 30, k++) { const yy = y + (k % 2 ? 14 : -14); if (k === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy) } ctx.stroke()
          }
        })
        ctx.fillStyle = shade(c, -0.25); poly([[-56, N + 10], [56, N + 10], [0, N + 92]])
        ctx.fillStyle = '#FFFFFF'; poly([[-48, N + 12], [48, N + 12], [0, N + 80]])
        for (const s of [-1, 1]) poly([[s * 4, N + 14], [s * 60, N + 4], [s * 40, N + 56]])
        break
      }
      case 'hawaii': {
        fillShirt(c)
        clipped(() => {
          const r = seeded(3)
          for (let i = 0; i < 22; i++) {
            const x = -175 + r() * 350, y = N + r() * 430, rad = 13 + r() * 8, col = r() < 0.5 ? '#FFF4E0' : '#FFD84D'
            ctx.fillStyle = '#2E9E5B'; ctx.beginPath(); ctx.ellipse(x + rad, y + rad * 0.6, rad * 0.9, rad * 0.4, 0.5, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = col
            for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rad * 0.6, y + Math.sin(a) * rad * 0.6, rad * 0.5, 0, Math.PI * 2); ctx.fill() }
            ctx.fillStyle = '#F28C38'; ctx.beginPath(); ctx.arc(x, y, rad * 0.3, 0, Math.PI * 2); ctx.fill()
          }
        })
        ctx.fillStyle = skin; poly([[-42, N + 8], [42, N + 8], [0, N + 112]])
        ctx.fillStyle = shade(c, 0.25)
        for (const s of [-1, 1]) poly([[s * 40, N + 6], [s * 90, N + 30], [s * 18, N + 98]])
        ctx.strokeStyle = shade(c, -0.25); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, N + 112); ctx.lineTo(0, 100); ctx.stroke()
        break
      }
      case 'pajama': {
        fillShirt(c)
        clipped(() => { ctx.fillStyle = shade(c, 0.35); for (let x = -206; x < 210; x += 46) ctx.fillRect(x, N - 20, 16, 540) })
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 8; ctx.lineJoin = 'round'
        ctx.beginPath(); ctx.moveTo(-54, N + 12); ctx.lineTo(0, N + 96); ctx.lineTo(54, N + 12); ctx.stroke()
        ctx.fillStyle = shade(c, -0.15); ctx.beginPath(); ctx.roundRect(-126, N + 104, 58, 52, 8); ctx.fill()
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-126, N + 104, 58, 6)
        for (let y = N + 126; y < 60; y += 52) { ctx.beginPath(); ctx.arc(0, y, 7, 0, Math.PI * 2); ctx.fill() }
        break
      }
    }
  }

  /** Kol: omuzdan sallanan iki parça; side −1 sol, +1 sağ. raise 0 (aşağı) … 1 (havada) */
  private drawArm(ctx: CanvasRenderingContext2D, side: -1 | 1, raise: number, sc: SceneDef) {
    const c = this.look.color, skin = this.face.skin
    const sleeve: Record<Outfit, { upper: string; fore: string | null; cuff: string | null }> = {
      suit: { upper: c, fore: c, cuff: '#F7F7F2' },
      tank: { upper: skin, fore: null, cuff: null },
      chef: { upper: '#FAFAF7', fore: '#FAFAF7', cuff: null },
      sweater: { upper: c, fore: c, cuff: shade(c, -0.25) },
      hawaii: { upper: c, fore: null, cuff: null },
      pajama: { upper: c, fore: c, cuff: '#FFFFFF' },
    }
    const st = sleeve[sc.outfit]
    const sh = { x: side * 148, y: NECK_TOP + 50 }
    const swing = Math.sin(this.t * 2.2 + side) * 0.05
    const r = clamp(raise, -0.3, 1.25)
    const a1 = side * (0.28 + r * 2.35 + swing)        // dikeyden (aşağı) açı
    const a2 = a1 + side * (0.35 + r * 0.35)
    const up = 150, fore = 135
    const elbow = { x: sh.x + Math.sin(a1) * up, y: sh.y + Math.cos(a1) * up }
    const hand = { x: elbow.x + Math.sin(a2) * fore, y: elbow.y + Math.cos(a2) * fore }
    const seg = (from: Vec, to: Vec, color: string, w: number) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke() }
    ctx.lineCap = 'round'
    seg(sh, elbow, st.upper, 62)
    seg(elbow, hand, st.fore ?? skin, st.fore ? 54 : 46)
    if (st.cuff) seg({ x: elbow.x + (hand.x - elbow.x) * 0.82, y: elbow.y + (hand.y - elbow.y) * 0.82 }, { x: elbow.x + (hand.x - elbow.x) * 0.9, y: elbow.y + (hand.y - elbow.y) * 0.9 }, st.cuff, 56)
    if (sc.gloves) {
      // boks eldiveni: yerel +y kolun yönüne döner
      ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(-a2)
      ctx.fillStyle = '#F4F1E8'; ctx.beginPath(); ctx.roundRect(-32, -20, 64, 34, 10); ctx.fill()
      ctx.fillStyle = '#D7263D'; ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 4
      ctx.beginPath(); ctx.ellipse(0, 46, 50, 58, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(-side * 40, 34, 18, 28, side * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(side * 16, 40, 12, 26, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    } else {
      ctx.fillStyle = skin
      ctx.beginPath(); ctx.arc(hand.x, hand.y, 34, 0, Math.PI * 2); ctx.fill()
    }
  }

  private drawHead(ctx: CanvasRenderingContext2D, hat: Hat) {
    const face = this.look.cartoon ? this.face.cartoon : this.face.natural
    const f = this.face.features
    // kulaklar + kafa tabanı (yüzün yumuşak kenarı arkasında ten rengi)
    ctx.fillStyle = this.face.skin
    // (saçıyla kesilmiş kafada gerçek kulaklar fotoğraftan gelir)
    if (!this.face.cutout) {
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * FACE_W * 0.47, 8, 26, 40, 0, 0, Math.PI * 2); ctx.fill() }
      ctx.beginPath(); ctx.ellipse(0, 6, FACE_W * 0.47, FACE_H * 0.47, 0, 0, Math.PI * 2); ctx.fill()
    }
    // görsel, tüm kafa kesiminde yüz çerçevesinden expand kat büyüktür (yüz aynı boyutta kalır)
    const DW = FACE_W * this.face.expand, DH = FACE_H * this.face.expand

    const warp = this.warp?.ok ? this.warp : null
    if (warp) {
      // gerçekçi yüz: bükülmüş ağ ara canvas'a çizilir (çevresindeki pay da yüz ölçeğiyle yerleşir)
      warp.render(this.shape, this.look.cartoon, this.tint())
      const sx = DW / warp.texW, sy = DH / warp.texH
      ctx.drawImage(warp.canvas, -DW / 2 - WARP_PAD_X * sx, -DH / 2 - WARP_PAD_TOP * sy, warp.canvas.width * sx, warp.canvas.height * sy)
    } else {
      // yüz: ağız hizasından bölünür; çene (alt parça) jaw kadar aşağı kayar
      const jaw = this.pose.jaw.value * JAW_PX
      const mouth = this.featureLocal(f.mouth)
      const splitPx = ((clamp(f.mouth.y, 0.5, 0.9) - 0.5) / this.face.expand + 0.5) * face.height
      const splitLocal = (splitPx / face.height - 0.5) * DH
      if (jaw > 1) {
        // ağız içi
        const mw = Math.max(0.18, f.mouthWidth) * FACE_W * 0.62
        ctx.fillStyle = '#5a1418'
        ctx.beginPath(); ctx.ellipse(mouth.x, splitLocal + jaw / 2, mw, jaw / 2 + 6, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#e0646c'
        ctx.beginPath(); ctx.ellipse(mouth.x, splitLocal + jaw * 0.8, mw * 0.55, jaw * 0.28 + 3, 0, 0, Math.PI * 2); ctx.fill()
      }
      ctx.drawImage(face, 0, 0, face.width, splitPx, -DW / 2, -DH / 2, DW, splitLocal + DH / 2)
      ctx.drawImage(face, 0, splitPx, face.width, face.height - splitPx, -DW / 2, splitLocal + jaw, DW, DH / 2 - splitLocal)
    }

    // allık
    if (this.blush > 0.02 || this.expression === 'happy' || this.expression === 'laugh') {
      const a = Math.max(this.blush, 0.6) * 0.45
      ctx.fillStyle = `rgba(240,80,90,${a})`
      for (const e of [f.leftEye, f.rightEye]) {
        const p = this.featureLocal({ x: e.x, y: (e.y + f.mouth.y) / 2 + 0.02 })
        ctx.beginPath(); ctx.ellipse(p.x + (e.x < 0.5 ? -10 : 10), p.y, 30, 18, 0, 0, Math.PI * 2); ctx.fill()
      }
    }
    this.drawExpression(ctx)
    this.drawHat(ctx, hat)
  }

  private drawHat(ctx: CanvasRenderingContext2D, hat: Hat) {
    const top = -FACE_H * 0.5, c = this.look.color
    const sway = Math.sin(this.t * 3) * 0.08 - this.pose.headRot.value * 0.9
    ctx.save()
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    switch (hat) {
      case 'headband': {
        const y = top + 46
        ctx.fillStyle = '#D7263D'
        ctx.beginPath(); ctx.roundRect(-FACE_W * 0.53, y - 16, FACE_W * 1.06, 32, 14); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-FACE_W * 0.53, y - 3, FACE_W * 1.06, 6)
        ctx.fillStyle = '#D7263D'
        ctx.translate(FACE_W * 0.5, y); ctx.rotate(0.5 + sway)
        ctx.beginPath(); ctx.roundRect(0, -8, 74, 16, 8); ctx.fill()
        ctx.rotate(0.4); ctx.beginPath(); ctx.roundRect(0, -7, 62, 14, 7); ctx.fill()
        break
      }
      case 'toque': {
        ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 4
        ctx.translate(0, top + 40); ctx.rotate(sway * 0.3)
        for (const [x, y, rad] of [[-62, -60, 58], [62, -60, 58], [0, -96, 72]] as const) { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
        ctx.beginPath(); ctx.roundRect(-FACE_W * 0.44, -24, FACE_W * 0.88, 60, 10); ctx.fill(); ctx.stroke()
        ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 3
        for (let x = -80; x <= 80; x += 32) { ctx.beginPath(); ctx.moveTo(x, -18); ctx.lineTo(x, 30); ctx.stroke() }
        break
      }
      case 'propeller': {
        const y = top + 62
        ctx.save(); ctx.beginPath(); ctx.ellipse(0, y, FACE_W * 0.5, 100, 0, Math.PI, 0); ctx.closePath(); ctx.clip()
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#FFD84D' : c; ctx.beginPath(); ctx.moveTo(0, y + 20); ctx.arc(0, y + 20, 200, Math.PI + (i / 4) * Math.PI, Math.PI + ((i + 1) / 4) * Math.PI); ctx.fill() }
        ctx.restore()
        ctx.fillStyle = shade(c, -0.2); ctx.beginPath(); ctx.ellipse(0, y, FACE_W * 0.52, 14, 0, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#555'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, y - 100); ctx.lineTo(0, y - 124); ctx.stroke()
        for (const [k, col] of [[0, '#E5323B'], [Math.PI, '#2E6FD8']] as const) {
          const a = this.spin + k, w = Math.cos(a)
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(w * 38, y - 126, Math.abs(w) * 38 + 3, 10, 0, 0, Math.PI * 2); ctx.fill()
        }
        ctx.fillStyle = '#FFD84D'; ctx.beginPath(); ctx.arc(0, y - 126, 8, 0, Math.PI * 2); ctx.fill()
        break
      }
      case 'sunglasses': {
        ctx.translate(0, top + 52); ctx.rotate(-0.05)
        ctx.fillStyle = '#1B1F3B'
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(s * 54 - 44, -22, 88, 46, 18); ctx.fill() }
        ctx.strokeStyle = '#1B1F3B'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-12, -6); ctx.quadraticCurveTo(0, -16, 12, -6); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 54 - 18, -8, 10, 5, -0.4, 0, Math.PI * 2); ctx.fill() }
        break
      }
      case 'nightcap': {
        const cap = shade(c, 0.15), tip = { x: FACE_W * 0.78 + Math.sin(this.t * 2.4) * 10 - this.pose.headRot.value * 60, y: top + 56 }
        ctx.fillStyle = cap
        ctx.beginPath(); ctx.moveTo(-FACE_W * 0.5, top + 64)
        ctx.bezierCurveTo(-FACE_W * 0.42, top - 110, FACE_W * 0.5, top - 130, tip.x, tip.y)
        ctx.bezierCurveTo(FACE_W * 0.42, top - 40, FACE_W * 0.5, top + 10, FACE_W * 0.5, top + 64)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        for (const [x, y] of [[-60, top - 20], [10, top - 50], [70, top - 30], [-20, top + 20], [60, top + 30]] as const) { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill() }
        ctx.fillStyle = '#FFFFFF'
        ctx.beginPath(); ctx.roundRect(-FACE_W * 0.53, top + 44, FACE_W * 1.06, 40, 18); ctx.fill()
        ctx.beginPath(); ctx.arc(tip.x, tip.y + 6, 24, 0, Math.PI * 2); ctx.fill()
        break
      }
      case 'none': break
    }
    ctx.restore()
  }

  /** İfadeler: gerçek gözlerin üstüne çizgi film katmanı */
  private drawExpression(ctx: CanvasRenderingContext2D) {
    const f = this.face.features
    const eyes = [this.featureLocal(f.leftEye), this.featureLocal(f.rightEye)]
    const eyeR = Math.max(16, Math.hypot(eyes[1].x - eyes[0].x, eyes[1].y - eyes[0].y) * 0.32)
    const skin = this.face.skin
    const lid = (e: Vec) => { ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(e.x, e.y, eyeR * 1.15, eyeR * 0.85, 0, 0, Math.PI * 2); ctx.fill() }
    const ink = '#1d1714'
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const ex = this.expression
    // gerçekçi yüzde gözler, kaşlar ve ağız ağın kendisiyle oynar; üstüne yalnızca dil çizilir
    const warped = !!this.warp?.ok
    if (warped && ex !== 'tongue') return

    // kendiliğinden göz kırpma (yalnızca gözler gerçekten bulunduysa ve başka ifade yokken)
    if (ex === 'none' && this.blinkT > 0 && f.detected) {
      for (const e of eyes) { lid(e); ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(e.x - eyeR, e.y); ctx.quadraticCurveTo(e.x, e.y + eyeR * 0.4, e.x + eyeR, e.y); ctx.stroke() }
    }
    if (ex === 'shut') {
      for (const e of eyes) {
        lid(e); ctx.strokeStyle = ink; ctx.lineWidth = 7
        ctx.beginPath(); ctx.moveTo(e.x - eyeR, e.y - eyeR * 0.4); ctx.lineTo(e.x + eyeR * 0.2, e.y); ctx.lineTo(e.x - eyeR, e.y + eyeR * 0.4); ctx.stroke()
      }
    }
    if (ex === 'laugh' || ex === 'happy') {
      for (const e of eyes) {
        lid(e); ctx.strokeStyle = ink; ctx.lineWidth = 7
        ctx.beginPath(); ctx.arc(e.x, e.y + eyeR * 0.35, eyeR * 0.8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke()
      }
    }
    if (ex === 'dizzy') {
      for (const [i, e] of eyes.entries()) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e.x, e.y, eyeR * 1.15, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = ink; ctx.lineWidth = 4
        ctx.beginPath()
        const dir = i ? 1 : -1
        for (let a = 0; a < Math.PI * 6; a += 0.25) {
          const rr = (a / (Math.PI * 6)) * eyeR
          const x = e.x + Math.cos(a * dir + this.t * 8) * rr, y = e.y + Math.sin(a * dir + this.t * 8) * rr
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
    if (ex === 'googly' || ex === 'shock') {
      for (const [i, e] of eyes.entries()) {
        const R = eyeR * (ex === 'googly' ? 1.45 : 1.3)
        ctx.fillStyle = '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = 4
        ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        const g = this.googly[i]
        const pr = ex === 'googly' ? R * 0.5 : R * 0.22
        ctx.fillStyle = ink
        ctx.beginPath(); ctx.arc(e.x + (ex === 'googly' ? g.x : 0), e.y + (ex === 'googly' ? g.y : 0), pr, 0, Math.PI * 2); ctx.fill()
      }
    }
    if (ex === 'tongue') {
      const m = this.featureLocal(f.mouth)
      const w = Math.max(0.18, f.mouthWidth) * FACE_W * 0.32
      const wag = Math.sin(this.t * 10) * 6
      ctx.fillStyle = '#e8566a'; ctx.strokeStyle = '#a3273b'; ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(m.x - w, m.y + this.pose.jaw.value * JAW_PX * 0.5)
      ctx.quadraticCurveTo(m.x - w * 1.1 + wag, m.y + 70, m.x + wag, m.y + 78)
      ctx.quadraticCurveTo(m.x + w * 1.1 + wag, m.y + 70, m.x + w, m.y + this.pose.jaw.value * JAW_PX * 0.5)
      ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(m.x + wag * 0.5, m.y + 20); ctx.lineTo(m.x + wag, m.y + 60); ctx.stroke()
      // göz kırpma (gerçekçi yüzde kapak ağla iner)
      if (!warped) {
        const e = eyes[1]; lid(e); ctx.strokeStyle = ink; ctx.lineWidth = 7
        ctx.beginPath(); ctx.moveTo(e.x - eyeR, e.y); ctx.quadraticCurveTo(e.x, e.y - eyeR * 0.5, e.x + eyeR, e.y); ctx.stroke()
      }
      if (warped) return
    }
    // kaşlar: ifade varken çizgi film kaşı (brow yayı oynatır)
    if (ex !== 'none' && ex !== 'dizzy') {
      const lift = this.pose.brow.value * 22 + (ex === 'shock' || ex === 'googly' ? 18 : 0)
      ctx.strokeStyle = ink; ctx.lineWidth = 10
      for (const [i, e] of eyes.entries()) {
        const s = i ? 1 : -1
        const y = e.y - eyeR * 1.75 - lift
        ctx.beginPath(); ctx.moveTo(e.x - eyeR * 1.1, y + (ex === 'happy' || ex === 'laugh' ? 0 : s * 6)); ctx.quadraticCurveTo(e.x, y - 12, e.x + eyeR * 1.1, y - (ex === 'happy' || ex === 'laugh' ? 0 : s * 6)); ctx.stroke()
      }
    }
  }
}
