// Gerçekçi gövdeler: yapay zekayla üretilmiş, boyundan aşağı fotoğraf gibi gövdeler (public/bodies/*.webp,
// kaynak: public/bodies/KAYNAKLAR.md). Her ortamın kıyafeti için erkek ve kadın gövdesi var. Gövdedeki ten (boyun,
// kol, el) yüzün ten rengine uydurulur. Görsel yüklenemezse karakter eski çizim gövdeyle çizilir.
import type { Outfit } from './scenes'

export type BodyType = 'm' | 'f'

interface BodyMeta { w: number; h: number; neckX: number }

/** scripts/ ile üretilen ölçüler (public/bodies/bodies.json): 480 px genişlik, boyun ortası */
const META: Record<string, BodyMeta> = {
  'f-beach': { w: 480, h: 967, neckX: 236.7 }, 'f-home': { w: 480, h: 929, neckX: 238.4 },
  'f-kitchen': { w: 480, h: 865, neckX: 244.2 }, 'f-office': { w: 480, h: 989, neckX: 242.4 },
  'f-ring': { w: 480, h: 705, neckX: 245.3 }, 'f-school': { w: 480, h: 960, neckX: 244.6 },
  'm-beach': { w: 480, h: 898, neckX: 236.3 }, 'm-home': { w: 480, h: 896, neckX: 240.9 },
  'm-kitchen': { w: 480, h: 830, neckX: 243.4 }, 'm-office': { w: 480, h: 810, neckX: 242.5 },
  'm-ring': { w: 480, h: 743, neckX: 239.2 }, 'm-school': { w: 480, h: 808, neckX: 241.1 },
}
const FILE_FOR: Record<Outfit, string> = { suit: 'office', tank: 'ring', chef: 'kitchen', sweater: 'school', hawaii: 'beach', pajama: 'home' }

const images = new Map<string, Promise<HTMLImageElement | null>>()
const tinted = new Map<string, HTMLCanvasElement>()

function loadImage(name: string): Promise<HTMLImageElement | null> {
  if (!images.has(name)) {
    images.set(name, new Promise(resolve => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => { images.delete(name); resolve(null) }
      img.src = `${import.meta.env.BASE_URL}bodies/${name}.webp`
    }))
  }
  return images.get(name)!
}

const parseRgb = (css: string): [number, number, number] => {
  const m = css.match(/\d+(\.\d+)?/g)
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [232, 180, 143]
}

/**
 * Teni yüze uydur: gövdenin kendi ten rengi boynun ortasından örneklenir; buna renkçe yakın pikseller
 * (boyun, kol, el) yüzün ten rengine kaydırılır, ışık ve gölge korunur.
 */
function tintSkin(img: HTMLImageElement, meta: BodyMeta, skinCss: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = meta.w; c.height = meta.h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, meta.w, meta.h)
  const data = ctx.getImageData(0, 0, c.width, c.height), d = data.data
  // referans ten: boyun ortası, üstten birkaç satır aşağısı
  let rr = 0, rg = 0, rb = 0, n = 0
  for (let y = 6; y < 26; y++) for (let x = Math.round(meta.neckX) - 10; x < meta.neckX + 10; x++) {
    const i = (y * c.width + x) * 4
    if (d[i + 3] > 200) { rr += d[i]; rg += d[i + 1]; rb += d[i + 2]; n++ }
  }
  if (n < 20) return c
  rr /= n; rg /= n; rb /= n
  const refSum = rr + rg + rb, rx = rr / refSum, ry = rg / refSum
  const [tr, tg, tb] = parseRgb(skinCss)
  const kr = tr / rr, kg = tg / rg, kb = tb / rb
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue
    const r = d[i], g = d[i + 1], b = d[i + 2], s = r + g + b
    if (s < 60) continue
    // renk (parlaklıktan bağımsız) referansa yakınlığı; parlaklık oranı da makul olmalı
    const dist = Math.hypot(r / s - rx, g / s - ry)
    const lum = s / refSum
    const w = Math.max(0, 1 - dist / 0.045) * (lum > 0.35 && lum < 1.7 ? 1 : 0)
    if (w <= 0) continue
    d[i] = Math.min(255, r * (1 + (kr - 1) * w))
    d[i + 1] = Math.min(255, g * (1 + (kg - 1) * w))
    d[i + 2] = Math.min(255, b * (1 + (kb - 1) * w))
  }
  ctx.putImageData(data, 0, 0)
  return c
}

export interface RealBody { canvas: HTMLCanvasElement; meta: BodyMeta }

/** Gövdeyi hazırla (yüklenmediyse null döner ve yüklemeyi başlatır; hazır olunca bir sonraki karede gelir) */
export function realBody(type: BodyType, outfit: Outfit, skin: string): RealBody | null {
  const name = `${type}-${FILE_FOR[outfit]}`, meta = META[name]
  if (!meta) return null
  const key = `${name}|${skin}`
  const ready = tinted.get(key)
  if (ready) return { canvas: ready, meta }
  void loadImage(name).then(img => { if (img && !tinted.has(key)) tinted.set(key, tintSkin(img, meta, skin)) })
  return null
}

/** Ortam değişmeden önce görselleri arka planda indir */
export function preloadBodies(type: BodyType) { for (const o of Object.values(FILE_FOR)) void loadImage(`${type}-${o}`) }
