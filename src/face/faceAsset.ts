// Yüz görseli hazırlama: kırp + hizala + kenarı yumuşat (+ çizgi film varyantı). Orijinal fotoğraf değişmez;
// karakter için ayrı, küçük bir katman (400×500) üretilir.
import type { FaceAsset, FaceFeatures, Vec } from '../game/types'
import { FACE_ASPECT, type CropRect } from './FaceDetection'
import { LOOP_FACE_OVAL } from './meshData'

export const FACE_PX_W = 400
export const FACE_PX_H = Math.round(FACE_PX_W * FACE_ASPECT)   // 500
/** Tüm kafa kesiminde kırpma bu oranda büyütülür (saç ve kulaklar sığsın); yüz noktaları normal kırpmaya göre kalır */
export const HEAD_EXPAND = 1.4

export const DEFAULT_FEATURES: FaceFeatures = {
  leftEye: { x: 0.36, y: 0.45 }, rightEye: { x: 0.64, y: 0.45 },
  mouth: { x: 0.5, y: 0.74 }, mouthWidth: 0.3, nose: { x: 0.5, y: 0.6 }, detected: false,
}

const canvas = (w = FACE_PX_W, h = FACE_PX_H) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  return c
}

/** Eliptik, kenarı yumuşak maske: yüz kesik bir dikdörtgen değil, kafaya oturan bir oval olur */
function applyFeatherMask(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!
  const W = c.width, H = c.height
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)   // önceki çizimden kalan dönüşüm maskeyi kaydırmasın
  ctx.globalCompositeOperation = 'destination-in'
  ctx.translate(W / 2, H / 2)
  ctx.scale(1, (H * 0.48) / (W * 0.47))
  const r = W * 0.47
  const g = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.55, 'rgba(0,0,0,0.92)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4)
  ctx.restore()
}

/** Kaynak görselden dönük kırpma → 400×500 yüz katmanı */
export function renderCrop(source: CanvasImageSource, crop: CropRect, outW = FACE_PX_W): HTMLCanvasElement {
  const c = canvas(outW, Math.round(outW * FACE_ASPECT))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.save()
  ctx.translate(c.width / 2, c.height / 2)
  ctx.scale(outW / crop.w, outW / crop.w)
  ctx.rotate(-crop.angle)
  ctx.drawImage(source, -crop.cx, -crop.cy)
  ctx.restore()
  return c
}

/** Çizgi film görünümü: hafif yumuşatma + renk kademeleri + doygunluk + koyu kenar çizgisi */
function cartoonize(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width, H = src.height
  const out = canvas(W, H)
  const sctx = src.getContext('2d')!, octx = out.getContext('2d')!
  const img = sctx.getImageData(0, 0, W, H)
  const d = img.data
  // 1) 3×3 kutu yumuşatma (gürültüyü azaltır, renk alanları düzleşir)
  const blur = new Uint8ClampedArray(d.length)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, n = 0
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const xx = Math.min(W - 1, Math.max(0, x + i)), yy = Math.min(H - 1, Math.max(0, y + j))
      const k = (yy * W + xx) * 4
      r += d[k]; g += d[k + 1]; b += d[k + 2]; n++
    }
    const k = (y * W + x) * 4
    blur[k] = r / n; blur[k + 1] = g / n; blur[k + 2] = b / n; blur[k + 3] = d[k + 3]
  }
  // 2) Parlaklık (kenar bulmak için)
  const lum = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) lum[i] = 0.299 * blur[i * 4] + 0.587 * blur[i * 4 + 1] + 0.114 * blur[i * 4 + 2]
  const res = new ImageData(W, H)
  const o = res.data
  const LV = 6, step = 255 / (LV - 1)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = i * 4
    let r = blur[k], g = blur[k + 1], b = blur[k + 2]
    // doygunluk artışı
    const avg = (r + g + b) / 3
    r = avg + (r - avg) * 1.35; g = avg + (g - avg) * 1.35; b = avg + (b - avg) * 1.35
    // renk kademeleri
    r = Math.round(r / step) * step; g = Math.round(g / step) * step; b = Math.round(b / step) * step
    // Sobel kenar
    let edge = 0
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
      const gx = -lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1] + lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1]
      const gy = -lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1] + lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1]
      edge = Math.hypot(gx, gy)
    }
    const dark = edge > 120 ? 0.35 : edge > 70 ? 0.7 : 1
    o[k] = r * dark; o[k + 1] = g * dark; o[k + 2] = b * dark; o[k + 3] = blur[k + 3]
  }
  octx.putImageData(res, 0, 0)
  return out
}

/** Yanak bölgesinden ten rengi örnekle (boyun, kulak, eller aynı tonda olsun) */
function sampleSkin(c: HTMLCanvasElement, f: FaceFeatures): string {
  const ctx = c.getContext('2d')!
  const pts = [
    { x: f.leftEye.x, y: (f.leftEye.y + f.mouth.y) / 2 }, { x: f.rightEye.x, y: (f.rightEye.y + f.mouth.y) / 2 },
    { x: f.nose.x, y: (f.leftEye.y + f.nose.y) / 2 + 0.03 },
  ]
  let r = 0, g = 0, b = 0, n = 0
  for (const p of pts) {
    const x = Math.round(p.x * c.width) - 6, y = Math.round(p.y * c.height) - 6
    const d = ctx.getImageData(Math.max(0, x), Math.max(0, y), 12, 12).data
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
  }
  if (!n) return '#e8b48f'
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`
}

const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/**
 * Tüm kafa maskesi: kişi haritasından saç + yüz + kulaklar alınır; çenenin altı (boyun, omuz, kıyafet)
 * yumuşakça silinir. Görselin üst ve yan kenarında ince bir geçiş bırakılır (saç kesik görünmesin).
 */
function headAlpha(W: number, H: number, person: Float32Array, mesh: readonly Vec[], expand: number): Float32Array {
  const t = (p: Vec): Vec => ({ x: ((p.x - 0.5) / expand + 0.5) * W, y: ((p.y - 0.5) / expand + 0.5) * H })
  const faceH = t(mesh[152]).y - t(mesh[10]).y
  // Kesim çizgisi: yüz genişliğinde çene hattı (altındaki boyun, yaka gider); yanlarda kulak memesi hizası
  const earL = t(mesh[234]), earR = t(mesh[454])
  const jaw = LOOP_FACE_OVAL.map(i => t(mesh[i])).filter(p => p.y > Math.min(earL.y, earR.y)).sort((a, b) => a.x - b.x)
  const sideCut = (y0: number) => y0 + faceH * 0.2
  const cutAt = (x: number) => {
    if (x <= jaw[0].x) return sideCut(earL.y)
    if (x >= jaw[jaw.length - 1].x) return sideCut(earR.y)
    let k = 1
    while (k < jaw.length - 1 && jaw[k].x < x) k++
    const a = jaw[k - 1], b = jaw[k], u = (x - a.x) / Math.max(1e-3, b.x - a.x)
    const y = a.y + (b.y - a.y) * u
    // kulak hizasından çeneye geçişte kesim kulak memesinin altına iner (kulaklar tam kalsın)
    const nearEar = Math.min(x - jaw[0].x, jaw[jaw.length - 1].x - x) / (faceH * 0.12)
    return Math.max(y + faceH * 0.015, x < (earL.x + earR.x) / 2 ? sideCut(earL.y) - nearEar * faceH : sideCut(earR.y) - nearEar * faceH)
  }
  const cut = new Float32Array(W)
  for (let x = 0; x < W; x++) cut[x] = cutAt(x)

  // 1) Yüz ovali her zaman dolu: kişi ayırıcı gözlük, sakal ya da parlak ışıkta yüzden parça koparsa bile delik kalmaz
  const ovalPts = LOOP_FACE_OVAL.map(i => t(mesh[i]))
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H
  const octx = oc.getContext('2d', { willReadFrequently: true })!
  octx.filter = `blur(${Math.max(2, W * 0.006)}px)`
  octx.fillStyle = '#000'; octx.beginPath()
  ovalPts.forEach((p, i) => (i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y)))
  octx.closePath(); octx.fill()
  const oval = octx.getImageData(0, 0, W, H).data
  oc.width = 0

  // 2) Kişi haritasını yumuşat (tırtıklı kenar kalmasın): iki geçiş 3×3 kutu bulanıklığı
  const blur = (src: Float32Array) => {
    const out = new Float32Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const xx = x + i, yy = y + j
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += src[yy * W + xx]; n++ }
      }
      out[y * W + x] = s / n
    }
    return out
  }
  const soft = blur(blur(person))

  // 3) Kafanın çevresiyle sınırla: yandaki kişiler, omuzlar, arka plandaki eşyalar kesime karışmaz
  const fc = { x: ovalPts.reduce((s, p) => s + p.x, 0) / ovalPts.length, y: ovalPts.reduce((s, p) => s + p.y, 0) / ovalPts.length }
  const faceW = Math.abs(earR.x - earL.x), rx = faceW * 1.0, ry = faceH * 1.05, cy = fc.y - faceH * 0.12

  const fade = faceH * 0.035, edge = Math.max(3, W * 0.012)
  const a = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    const ey = smoothstep(0, edge, y)
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const ex = smoothstep(0, edge, x) * smoothstep(0, edge, W - 1 - x)
      const below = 1 - smoothstep(cut[x] - fade, cut[x] + fade, y)
      const r = Math.hypot((x - fc.x) / rx, (y - cy) / ry)
      const near = 1 - smoothstep(0.9, 1.05, r)
      const p = Math.max(smoothstep(0.25, 0.65, soft[i]) * near, oval[i * 4 + 3] / 255)
      a[i] = p * below * ey * ex
    }
  }
  return a
}

function applyAlpha(c: HTMLCanvasElement, alpha: Float32Array) {
  const ctx = c.getContext('2d')!
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data
  for (let i = 0; i < alpha.length; i++) d[i * 4 + 3] = Math.round(d[i * 4 + 3] * alpha[i])
  ctx.putImageData(img, 0, 0)
}

/**
 * Karakter yüzü. person verilirse (kişi haritası) saçıyla tüm kafa kesilir; görsel normal kırpmanın expand katı
 * genişliğindedir ve yüz noktaları normal kırpmaya göre kalır. Verilmezse eski oval maske kullanılır.
 */
export function buildFaceAsset(face: HTMLCanvasElement, features: FaceFeatures, person: Float32Array | null = null, expand = 1): FaceAsset {
  const tex = (p: Vec): Vec => ({ x: (p.x - 0.5) / expand + 0.5, y: (p.y - 0.5) / expand + 0.5 })
  const texFeatures = { ...features, leftEye: tex(features.leftEye), rightEye: tex(features.rightEye), mouth: tex(features.mouth), nose: tex(features.nose) }
  const skin = sampleSkin(face, texFeatures)       // maske öncesi örnekle (kenar saydamlığı karışmasın)
  const cartoon = cartoonize(face)
  const cutout = !!person && !!features.mesh
  if (cutout) {
    const alpha = headAlpha(face.width, face.height, person!, features.mesh!, expand)
    applyAlpha(face, alpha)
    applyAlpha(cartoon, alpha)
  } else {
    applyFeatherMask(face)
    applyFeatherMask(cartoon)
  }
  return { natural: face, cartoon, features, skin, expand: cutout ? expand : 1, cutout }
}

/** Belleği bırak: oyun sıfırlanınca / yeni fotoğrafta geçici görseller temizlenir */
export function disposeFaceAsset(a: FaceAsset | null) {
  if (!a) return
  for (const c of [a.natural, a.cartoon]) { c.width = 0; c.height = 0 }
  if (a.oval) disposeFaceAsset(a.oval)
}

/** Fotoğraf yokken (açılış ekranı) kullanılan çizim maskot yüzü: "Tayfun" */
export function createMascotFace(): FaceAsset {
  const c = canvas()
  const ctx = c.getContext('2d')!
  const W = FACE_PX_W, H = FACE_PX_H
  const skin = '#f2b98d'
  ctx.fillStyle = skin
  ctx.beginPath(); ctx.ellipse(W / 2, H / 2, W * 0.46, H * 0.47, 0, 0, Math.PI * 2); ctx.fill()
  // yanaklar
  ctx.fillStyle = 'rgba(232,96,80,0.35)'
  for (const x of [0.27, 0.73]) { ctx.beginPath(); ctx.ellipse(W * x, H * 0.63, 34, 22, 0, 0, Math.PI * 2); ctx.fill() }
  // gözler
  for (const x of [0.36, 0.64]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(W * x, H * 0.45, 34, 38, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#2a1d17'; ctx.beginPath(); ctx.arc(W * x + 6, H * 0.46, 15, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W * x + 11, H * 0.45 - 6, 5, 0, Math.PI * 2); ctx.fill()
  }
  // kaşlar
  ctx.strokeStyle = '#3b2418'; ctx.lineWidth = 14; ctx.lineCap = 'round'
  for (const [x, s] of [[0.36, -1], [0.64, 1]] as const) {
    ctx.beginPath(); ctx.moveTo(W * x - 34, H * 0.36 + s * 4); ctx.quadraticCurveTo(W * x, H * 0.33, W * x + 34, H * 0.36 - s * 4); ctx.stroke()
  }
  // burun
  ctx.fillStyle = '#e39b72'; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.6, 26, 22, 0, 0, Math.PI * 2); ctx.fill()
  // bıyık
  ctx.fillStyle = '#3b2418'
  ctx.beginPath()
  ctx.moveTo(W / 2, H * 0.665)
  ctx.bezierCurveTo(W * 0.42, H * 0.63, W * 0.3, H * 0.66, W * 0.3, H * 0.7)
  ctx.bezierCurveTo(W * 0.38, H * 0.69, W * 0.45, H * 0.7, W / 2, H * 0.685)
  ctx.bezierCurveTo(W * 0.55, H * 0.7, W * 0.62, H * 0.69, W * 0.7, H * 0.7)
  ctx.bezierCurveTo(W * 0.7, H * 0.66, W * 0.58, H * 0.63, W / 2, H * 0.665)
  ctx.fill()
  // gülüş
  ctx.strokeStyle = '#7a2e22'; ctx.lineWidth = 9
  ctx.beginPath(); ctx.arc(W / 2, H * 0.71, 46, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke()
  const features: FaceFeatures = { ...DEFAULT_FEATURES, mouth: { x: 0.5, y: 0.76 }, mouthWidth: 0.26, detected: true }
  return buildFaceAsset(c, features)
}
