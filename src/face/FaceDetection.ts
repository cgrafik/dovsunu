// Yüz algılama — MediaPipe Face Landmarker, tamamen tarayıcıda (wasm + model public/ klasöründen; fotoğraf hiçbir yere gitmez).
// Model ilk kullanımda yüklenir (≈4 MB) ve bellekte tutulur.
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import type { FaceFeatures, Vec } from '../game/types'

const BASE = import.meta.env.BASE_URL

/** Kaynak görselde dönük kırpma çerçevesi (piksel). Oran: h = w × FACE_ASPECT */
export interface CropRect { cx: number; cy: number; w: number; angle: number }
export const FACE_ASPECT = 1.25

export interface DetectedFace {
  /** Önizleme için eksene hizalı kutu (piksel) */
  box: { x: number; y: number; w: number; h: number }
  /** 478 nokta, kaynak görsel pikselinde */
  points: Vec[]
  crop: CropRect
}

let landmarker: Promise<FaceLandmarker> | null = null

async function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarker) {
    landmarker = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe`)
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: `${BASE}models/face_landmarker.task`, delegate },
        runningMode: 'IMAGE' as const, numFaces: 5, minFaceDetectionConfidence: 0.4,
      })
      try { return await FaceLandmarker.createFromOptions(fileset, opts('GPU')) }
      catch { return await FaceLandmarker.createFromOptions(fileset, opts('CPU')) }   // GPU yoksa işlemci
    })()
    landmarker.catch(() => { landmarker = null })   // hata olursa bir dahaki sefere yeniden dene
  }
  return landmarker
}

/** Modeli arka planda önceden yükle (fotoğraf ekranı açılınca) */
export function preloadDetector() { void getLandmarker().catch(() => {}) }

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Yüz noktalarından kırpma: gözler yatay, yüz ortada, alında ve çenede pay bırakılır */
export function cropFromPoints(p: Vec[]): CropRect {
  const leftEye = mid(p[33], p[133]), rightEye = mid(p[362], p[263])
  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)
  const faceW = dist(p[234], p[454]), faceH = dist(p[10], p[152])
  let w = faceW * 1.22
  if (w * FACE_ASPECT < faceH * 1.42) w = (faceH * 1.42) / FACE_ASPECT
  const c = mid(p[10], p[152])
  // Alın noktası saç çizgisinin altında kalır → merkezi biraz yukarı (yüzün kendi "yukarı" yönünde) kaydır
  const up = { x: Math.sin(angle), y: -Math.cos(angle) }
  const shift = w * FACE_ASPECT * 0.05
  return { cx: c.x + up.x * shift, cy: c.y + up.y * shift, w, angle }
}

/** Kaynak piksel noktasını kırpılmış yüz görselinin 0..1 koordinatına çevir */
export function toCropSpace(pt: Vec, crop: CropRect): Vec {
  const dx = pt.x - crop.cx, dy = pt.y - crop.cy
  const c = Math.cos(-crop.angle), s = Math.sin(-crop.angle)
  const x = dx * c - dy * s, y = dx * s + dy * c
  return { x: x / crop.w + 0.5, y: y / (crop.w * FACE_ASPECT) + 0.5 }
}

export function featuresFromPoints(p: Vec[], crop: CropRect): FaceFeatures {
  const f = (pt: Vec) => toCropSpace(pt, crop)
  const ml = f(p[61]), mr = f(p[291])
  return {
    leftEye: f(mid(p[33], p[133])), rightEye: f(mid(p[362], p[263])),
    mouth: f(mid(p[13], p[14])), mouthWidth: Math.hypot(mr.x - ml.x, mr.y - ml.y),
    nose: f(p[1]), detected: true,
    mesh: p.slice(0, 468).map(f),
  }
}

export async function detectFaces(source: HTMLCanvasElement): Promise<DetectedFace[]> {
  const lm = await getLandmarker()
  const res = lm.detect(source)
  const W = source.width, H = source.height
  return (res.faceLandmarks ?? []).map(norm => {
    const points = norm.map(n => ({ x: n.x * W, y: n.y * H }))
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const q of points) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y) }
    return { box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, points, crop: cropFromPoints(points) }
  }).sort((a, b) => a.box.x - b.box.x)   // soldan sağa (seçim listesi fotoğraftaki sırayla)
}
