// Yüz görseli hazırlama: kırp + hizala + kenarı yumuşat (+ çizgi film varyantı). Orijinal fotoğraf değişmez;
// karakter için ayrı, küçük bir katman (400×500) üretilir.
import type { FaceAsset, FaceFeatures } from '../game/types'
import { FACE_ASPECT, type CropRect } from './FaceDetection'

export const FACE_PX_W = 400
export const FACE_PX_H = Math.round(FACE_PX_W * FACE_ASPECT)   // 500

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
export function renderCrop(source: CanvasImageSource, crop: CropRect): HTMLCanvasElement {
  const c = canvas()
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.save()
  ctx.translate(FACE_PX_W / 2, FACE_PX_H / 2)
  ctx.scale(FACE_PX_W / crop.w, FACE_PX_W / crop.w)
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

export function buildFaceAsset(face: HTMLCanvasElement, features: FaceFeatures): FaceAsset {
  const skin = sampleSkin(face, features)       // maske öncesi örnekle (kenar saydamlığı karışmasın)
  const cartoon = cartoonize(face)
  applyFeatherMask(face)
  applyFeatherMask(cartoon)
  return { natural: face, cartoon, features, skin }
}

/** Belleği bırak: oyun sıfırlanınca / yeni fotoğrafta geçici görseller temizlenir */
export function disposeFaceAsset(a: FaceAsset | null) {
  if (!a) return
  for (const c of [a.natural, a.cartoon]) { c.width = 0; c.height = 0 }
}

/** Fotoğraf yokken (açılış ekranı) kullanılan çizim maskot yüzü: "Taraftar Tayfun" */
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
