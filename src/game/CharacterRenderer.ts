// Karakter: taraftar gövdesi (forma, atkı, kollar, köpük el) + kullanıcının yüzü + ifade katmanları.
// Poz yaylarla tutulur: animasyonlar itki verir, yaylar karakteri başlangıç pozuna geri getirir.
// Kafa dönüşümü (headMatrix) her karede hesaplanır; yüze yapışan efektler (pasta, su) bu dönüşümle çizilir → kaymaz.
import { Spring, clamp } from './math'
import type { CharacterLook, Expression, FaceAsset, Vec } from './types'

/** Kafa yerel ölçüleri: yüz görseli bu dikdörtgene çizilir (oran 4:5) */
export const FACE_W = 260
export const FACE_H = 325
const HIP: Vec = { x: 400, y: 905 }
const NECK_TOP = -318          // gövde yerelinde boyun üstü
const HEAD_FROM_NECK = -150    // boyun üstünden kafa merkezine
const JAW_PX = 46

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
  blush = 0
  /** Dünya → kafa yerel dönüşümü (efektler bunu kullanır) */
  headMatrix = new DOMMatrix()
  bodyMatrix = new DOMMatrix()

  constructor(face: FaceAsset, look: CharacterLook) {
    this.face = face
    this.look = look
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
    this.computeMatrices()
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
  draw(ctx: CanvasRenderingContext2D, screen: DOMMatrix) {
    ctx.save()
    ctx.setTransform(screen.multiply(this.bodyMatrix))
    this.drawArm(ctx, -1, this.pose.armL.value, false)
    this.drawTorso(ctx)
    this.drawArm(ctx, 1, this.pose.armR.value, true)
    ctx.restore()

    ctx.save()
    ctx.setTransform(screen.multiply(this.headMatrix))
    this.drawHead(ctx)
    ctx.restore()
  }

  private drawTorso(ctx: CanvasRenderingContext2D) {
    const { primary, secondary, name, number } = this.look.jersey
    // boyun
    ctx.fillStyle = this.face.skin
    ctx.beginPath(); ctx.roundRect(-40, NECK_TOP - 30, 80, 70, 24); ctx.fill()
    // forma gövdesi
    ctx.fillStyle = primary
    ctx.beginPath()
    ctx.moveTo(-150, NECK_TOP + 22)
    ctx.quadraticCurveTo(-178, NECK_TOP + 40, -170, NECK_TOP + 120)
    ctx.lineTo(-140, 90)
    ctx.lineTo(140, 90)
    ctx.lineTo(170, NECK_TOP + 120)
    ctx.quadraticCurveTo(178, NECK_TOP + 40, 150, NECK_TOP + 22)
    ctx.quadraticCurveTo(0, NECK_TOP - 6, -150, NECK_TOP + 22)
    ctx.fill()
    // yan şeritler
    ctx.fillStyle = secondary
    ctx.fillRect(-150, NECK_TOP + 120, 22, 300); ctx.fillRect(128, NECK_TOP + 120, 22, 300)
    // yaka
    ctx.strokeStyle = secondary; ctx.lineWidth = 12
    ctx.beginPath(); ctx.moveTo(-46, NECK_TOP + 14); ctx.quadraticCurveTo(0, NECK_TOP + 60, 46, NECK_TOP + 14); ctx.stroke()
    // isim + numara
    ctx.fillStyle = secondary
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    if (name) { ctx.font = '700 30px "Bungee", system-ui, sans-serif'; ctx.fillText(name.toLocaleUpperCase('tr').slice(0, 10), 0, NECK_TOP + 108) }
    ctx.font = '400 118px "Bungee", system-ui, sans-serif'
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.strokeText(number || '12', 0, NECK_TOP + 200)
    ctx.fillText(number || '12', 0, NECK_TOP + 200)
    // atkı (çizgili, iki ucu sarkar)
    const stripes = (x: number, y: number, w: number, h: number) => {
      for (let i = 0; i < Math.ceil(h / 18); i++) {
        ctx.fillStyle = i % 2 ? secondary : primary
        ctx.fillRect(x, y + i * 18, w, Math.min(18, h - i * 18))
      }
    }
    ctx.save()
    ctx.beginPath(); ctx.roundRect(-112, NECK_TOP - 6, 224, 44, 20); ctx.clip()
    for (let i = 0; i < 14; i++) { ctx.fillStyle = i % 2 ? secondary : primary; ctx.fillRect(-112 + i * 16, NECK_TOP - 6, 16, 44) }
    ctx.restore()
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.roundRect(-112, NECK_TOP - 6, 224, 44, 20); ctx.stroke()
    const sway = Math.sin(this.t * 2.6) * 6 + this.pose.lean.value * -40
    // atkının sarkan ucu yanda (formadaki ismin üstüne binmesin)
    ctx.save(); ctx.translate(-112, NECK_TOP + 30); ctx.rotate((sway * Math.PI) / 180 * 0.4)
    ctx.beginPath(); ctx.roundRect(-24, 0, 48, 150, 8); ctx.save(); ctx.clip(); stripes(-24, 0, 48, 150); ctx.restore()
    ctx.fillStyle = secondary; for (let i = 0; i < 5; i++) ctx.fillRect(-22 + i * 10, 150, 5, 18)
    ctx.restore()
  }

  /** Kol: omuzdan sallanan iki parça; side −1 sol, +1 sağ. raise 0 (aşağı) … 1 (havada) */
  private drawArm(ctx: CanvasRenderingContext2D, side: -1 | 1, raise: number, foamHand: boolean) {
    const { primary, secondary } = this.look.jersey
    const sh = { x: side * 148, y: NECK_TOP + 50 }
    const swing = Math.sin(this.t * 2.2 + side) * 0.05
    const r = clamp(raise, -0.3, 1.25)
    const a1 = side * (0.28 + r * 2.35 + swing)        // dikeyden (aşağı) açı
    const a2 = a1 + side * (0.35 + r * 0.35)
    const up = 150, fore = 135
    const elbow = { x: sh.x + Math.sin(a1) * up, y: sh.y + Math.cos(a1) * up }
    const hand = { x: elbow.x + Math.sin(a2) * fore, y: elbow.y + Math.cos(a2) * fore }
    ctx.lineCap = 'round'
    ctx.strokeStyle = primary; ctx.lineWidth = 62
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(elbow.x, elbow.y); ctx.stroke()
    ctx.strokeStyle = secondary; ctx.lineWidth = 62
    ctx.beginPath(); ctx.moveTo(elbow.x - (elbow.x - sh.x) * 0.18, elbow.y - (elbow.y - sh.y) * 0.18); ctx.lineTo(elbow.x, elbow.y); ctx.stroke()
    ctx.strokeStyle = this.face.skin; ctx.lineWidth = 46
    ctx.beginPath(); ctx.moveTo(elbow.x, elbow.y); ctx.lineTo(hand.x, hand.y); ctx.stroke()
    if (foamHand) {
      // köpük el: işaret parmağı havada, takım rengi
      // yerel +y (parmak) kolun yönüne (sin a2, cos a2) döner
      ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(-a2)
      ctx.fillStyle = secondary; ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 4
      ctx.beginPath(); ctx.roundRect(-46, -10, 92, 92, 28); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.roundRect(-18, 60, 36, 120, 18); ctx.fill(); ctx.stroke()
      ctx.fillStyle = primary; ctx.font = '400 34px "Bungee", system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('1', 0, 36)
      ctx.restore()
    } else {
      ctx.fillStyle = this.face.skin
      ctx.beginPath(); ctx.arc(hand.x, hand.y, 34, 0, Math.PI * 2); ctx.fill()
    }
  }

  private drawHead(ctx: CanvasRenderingContext2D) {
    const face = this.look.cartoon ? this.face.cartoon : this.face.natural
    const f = this.face.features
    const { primary, secondary } = this.look.jersey
    // kulaklar + kafa tabanı (yüzün yumuşak kenarı arkasında ten rengi)
    ctx.fillStyle = this.face.skin
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * FACE_W * 0.47, 8, 26, 40, 0, 0, Math.PI * 2); ctx.fill() }
    ctx.beginPath(); ctx.ellipse(0, 6, FACE_W * 0.47, FACE_H * 0.47, 0, 0, Math.PI * 2); ctx.fill()

    // yüz: ağız hizasından bölünür; çene (alt parça) jaw kadar aşağı kayar
    const jaw = this.pose.jaw.value * JAW_PX
    const mouth = this.featureLocal(f.mouth)
    const splitPx = clamp(f.mouth.y, 0.5, 0.9) * face.height
    const splitLocal = (splitPx / face.height - 0.5) * FACE_H
    if (jaw > 1) {
      // ağız içi
      const mw = Math.max(0.18, f.mouthWidth) * FACE_W * 0.62
      ctx.fillStyle = '#5a1418'
      ctx.beginPath(); ctx.ellipse(mouth.x, splitLocal + jaw / 2, mw, jaw / 2 + 6, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e0646c'
      ctx.beginPath(); ctx.ellipse(mouth.x, splitLocal + jaw * 0.8, mw * 0.55, jaw * 0.28 + 3, 0, 0, Math.PI * 2); ctx.fill()
    }
    ctx.drawImage(face, 0, 0, face.width, splitPx, -FACE_W / 2, -FACE_H / 2, FACE_W, splitLocal + FACE_H / 2)
    ctx.drawImage(face, 0, splitPx, face.width, face.height - splitPx, -FACE_W / 2, splitLocal + jaw, FACE_W, FACE_H / 2 - splitLocal)

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
    this.drawBeanie(ctx, primary, secondary)
  }

  private drawBeanie(ctx: CanvasRenderingContext2D, primary: string, secondary: string) {
    const top = -FACE_H * 0.5
    ctx.save()
    ctx.fillStyle = primary
    ctx.beginPath()
    ctx.moveTo(-FACE_W * 0.5, top + 70)
    ctx.bezierCurveTo(-FACE_W * 0.52, top - 70, FACE_W * 0.52, top - 70, FACE_W * 0.5, top + 70)
    ctx.closePath(); ctx.fill()
    // şeritler
    ctx.save(); ctx.clip()
    ctx.fillStyle = secondary
    for (let i = 0; i < 3; i++) ctx.fillRect(-FACE_W, top - 30 + i * 30, FACE_W * 2, 12)
    ctx.restore()
    // kıvrık kenar
    ctx.fillStyle = secondary
    ctx.beginPath(); ctx.roundRect(-FACE_W * 0.53, top + 46, FACE_W * 1.06, 40, 18); ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 3
    for (let x = -FACE_W * 0.48; x < FACE_W * 0.5; x += 14) { ctx.beginPath(); ctx.moveTo(x, top + 52); ctx.lineTo(x, top + 80); ctx.stroke() }
    // ponpon
    const bob = Math.sin(this.t * 3) * 4 - this.pose.headRot.value * 30
    ctx.fillStyle = secondary
    ctx.beginPath(); ctx.arc(bob, top - 34, 30, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.beginPath(); ctx.arc(bob - 9, top - 44, 10, 0, Math.PI * 2); ctx.fill()
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
      // göz kırpma
      const e = eyes[1]; lid(e); ctx.strokeStyle = ink; ctx.lineWidth = 7
      ctx.beginPath(); ctx.moveTo(e.x - eyeR, e.y); ctx.quadraticCurveTo(e.x, e.y - eyeR * 0.5, e.x + eyeR, e.y); ctx.stroke()
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
