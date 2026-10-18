// Kalıcı yüz hasarı: vuruşlar yüzde iz bırakır ve tur boyunca kalır (kızarıklık, el izi, morluk, şişlik, yara bandı,
// is lekesi, damga mürekkebi). İzler yüz görseline işlenir; yüz bükülüp titreyince izler de onunla oynar.
// Çizgi film şakası sınırında kalır: kan ya da açık yara yok.
import { seeded } from './math'
import type { FaceFeatures, Vec } from './types'

export type DamageKind = 'slap' | 'punch' | 'slipper' | 'sponge' | 'pie' | 'water' | 'bonk' | 'shock' | 'stamp'

interface Mark { x: number; y: number; hits: number; hard: number; seed: number }
interface Hand { x: number; y: number; rot: number; flip: number }

/** Yüz görseli pikselinde izler; her vuruşta güncellenir, paint() ile dokuya işlenir */
export class FaceDamage {
  private marks: Mark[] = []
  private hands: Hand[] = []
  private soot: { x: number; y: number; r: number }[] = []
  private stamps: { x: number; y: number; rot: number }[] = []
  private bandages: { x: number; y: number; rot: number }[] = []
  private total = 0
  /** Göz bebekleri arası mesafe (piksel): tüm iz boyutları buna göre */
  private s: number
  private eyeL: Vec
  private eyeR: Vec
  private mouth: Vec

  constructor(features: FaceFeatures, expand: number, w: number, h: number) {
    const t = (p: Vec): Vec => ({ x: ((p.x - 0.5) / expand + 0.5) * w, y: ((p.y - 0.5) / expand + 0.5) * h })
    this.eyeL = t(features.leftEye); this.eyeR = t(features.rightEye); this.mouth = t(features.mouth)
    this.s = Math.max(20, Math.hypot(this.eyeR.x - this.eyeL.x, this.eyeR.y - this.eyeL.y))
  }

  /** Vuruşun bıraktığı iz. side: vuruşun geldiği yan (+1 sağdan). Dokunun yeniden çizilmesi gerekiyorsa true */
  add(kind: DamageKind, side: 1 | -1): boolean {
    const s = this.s, r = (k: number) => (Math.random() - 0.5) * s * k
    // vuruşun yere göre çapası: yanak, göz çevresi, alın…
    const cheek = side > 0 ? this.eyeR : this.eyeL
    const cheekPt = { x: cheek.x + side * s * 0.12, y: (cheek.y + this.mouth.y) / 2 + s * 0.05 }
    const brow = { x: (this.eyeL.x + this.eyeR.x) / 2, y: (this.eyeL.y + this.eyeR.y) / 2 - s * 0.55 }
    let at: Vec | null = null, hard = 0
    switch (kind) {
      case 'slap': at = cheekPt; this.hands.push({ x: cheekPt.x + r(0.2), y: cheekPt.y + r(0.2), rot: side * (0.15 + Math.random() * 0.3), flip: side }); if (this.hands.length > 3) this.hands.shift(); break
      case 'slipper': at = cheekPt; break
      case 'punch': at = { x: cheek.x + side * s * 0.05, y: cheek.y + s * 0.12 }; hard = 1; break
      case 'sponge': case 'bonk': at = brow; hard = 1; break
      case 'shock': for (let i = 0; i < 3; i++) this.soot.push({ x: brow.x + r(1.6), y: brow.y + s * 0.6 + r(1.2), r: s * (0.18 + Math.random() * 0.2) }); if (this.soot.length > 12) this.soot.splice(0, 3); break
      case 'stamp': this.stamps.push({ x: brow.x + r(0.2), y: brow.y + s * 0.05, rot: (Math.random() - 0.6) * 0.4 }); if (this.stamps.length > 2) this.stamps.shift(); break
      default: return false   // pasta, su: iz bırakmaz
    }
    if (at) {
      at = { x: at.x + r(0.15), y: at.y + r(0.15) }
      const near = this.marks.find(m => Math.hypot(m.x - at!.x, m.y - at!.y) < s * 0.45)
      if (near) { near.hits++; near.hard += hard } else {
        this.marks.push({ x: at.x, y: at.y, hits: 1, hard, seed: Math.floor(Math.random() * 1e6) })
        if (this.marks.length > 8) this.marks.shift()
      }
      this.total++
      // çok dayak yiyen yere çapraz yara bandı (en fazla iki)
      if ((this.total === 10 || this.total === 22) && this.bandages.length < 2) {
        const top = [...this.marks].sort((a, b) => b.hits - a.hits)[0]
        this.bandages.push({ x: top.x, y: top.y, rot: (Math.random() - 0.5) * 0.5 })
      }
    }
    return true
  }

  /** İzleri yüz görselinin üstüne çiz (yalnızca yüzün dolu piksellerine: source-atop) */
  paint(ctx: CanvasRenderingContext2D) {
    const s = this.s
    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    for (const m of this.marks) {
      // kızarıklık: vuruldukça koyulaşır
      const rad = s * 0.5 * (1 + Math.min(m.hits, 6) * 0.08), a = Math.min(0.5, 0.14 + 0.07 * m.hits)
      const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, rad)
      g.addColorStop(0, `rgba(225,45,60,${a})`); g.addColorStop(1, 'rgba(225,45,60,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, rad, 0, Math.PI * 2); ctx.fill()
      // morluk: sert vuruşlar ya da çok vuruş (mor çekirdek, sarı-yeşil kenar)
      const bruise = m.hard >= 2 || m.hits >= 4
      if (bruise) {
        const k = Math.min(1, (Math.max(m.hard, m.hits / 2) - 1) * 0.35 + 0.35), rnd = seeded(m.seed)
        for (let i = 0; i < 6; i++) {
          const bx = m.x + (rnd() - 0.5) * s * 0.3, by = m.y + (rnd() - 0.5) * s * 0.25, br = s * (0.1 + rnd() * 0.1)
          const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br * 1.6)
          bg.addColorStop(0, `rgba(95,45,125,${0.32 * k})`); bg.addColorStop(0.6, `rgba(120,70,130,${0.18 * k})`); bg.addColorStop(1, 'rgba(165,170,70,0)')
          ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, br * 1.6, 0, Math.PI * 2); ctx.fill()
        }
      }
      // şişlik: sert vuruşlarla parlak, kabarık bir yumru
      if (m.hard >= 3) {
        const br = s * 0.2
        const sg = ctx.createRadialGradient(m.x - br * 0.3, m.y - br * 0.4, br * 0.1, m.x, m.y, br * 1.3)
        sg.addColorStop(0, 'rgba(255,215,215,0.55)'); sg.addColorStop(0.5, 'rgba(225,95,105,0.35)'); sg.addColorStop(1, 'rgba(160,60,70,0)')
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(m.x, m.y, br * 1.3, 0, Math.PI * 2); ctx.fill()
      }
    }
    // silik el izleri
    for (const h of this.hands) {
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot); ctx.scale(h.flip * s / 110, s / 110)
      ctx.fillStyle = 'rgba(215,40,60,0.22)'
      ctx.beginPath(); ctx.ellipse(0, 6, 30, 34, 0, 0, Math.PI * 2); ctx.fill()
      for (const [fx, fh] of [[-24, 40], [-8, 48], [8, 46], [23, 38]] as const) { ctx.beginPath(); ctx.roundRect(fx - 7, -22 - fh, 14, fh + 6, 7); ctx.fill() }
      ctx.save(); ctx.translate(-30, 14); ctx.rotate(-0.9); ctx.beginPath(); ctx.roundRect(-7, -38, 14, 40, 7); ctx.fill(); ctx.restore()
      ctx.restore()
    }
    // elektrikten is lekeleri
    for (const p of this.soot) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
      g.addColorStop(0, 'rgba(25,22,22,0.32)'); g.addColorStop(1, 'rgba(25,22,22,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
    }
    // kredi damgasının silik mürekkebi
    for (const st of this.stamps) {
      ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.rot); ctx.scale(s / 160, s / 160)
      ctx.strokeStyle = 'rgba(200,30,50,0.3)'; ctx.fillStyle = 'rgba(200,30,50,0.3)'; ctx.lineWidth = 6
      ctx.beginPath(); ctx.roundRect(-110, -32, 220, 64, 8); ctx.stroke()
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '400 30px "Bungee", system-ui, sans-serif'; ctx.fillText('KREDİ ONAY', 0, 2, 200)
      ctx.restore()
    }
    // çapraz yara bandı (çizgi film)
    for (const b of this.bandages) {
      for (const r of [b.rot + 0.7, b.rot - 0.7]) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(r)
        const L = s * 0.75, W = s * 0.22
        ctx.fillStyle = '#E8C39E'; ctx.strokeStyle = 'rgba(120,80,50,0.45)'; ctx.lineWidth = Math.max(1, s * 0.012)
        ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, W / 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#F4DDC2'; ctx.fillRect(-L * 0.16, -W * 0.36, L * 0.32, W * 0.72)
        ctx.fillStyle = 'rgba(120,80,50,0.35)'
        for (const x of [-0.36, -0.26, 0.26, 0.36]) for (const y of [-0.18, 0.18]) { ctx.beginPath(); ctx.arc(L * x, W * y, Math.max(0.8, s * 0.008), 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
      }
    }
    ctx.restore()
  }
}
