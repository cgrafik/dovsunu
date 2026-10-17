// MediaPipe yüz ağının üçgenlerini ve sınır döngülerini src/face/meshData.ts dosyasına yazar.
// Ağ verisi kütüphaneden alınır ama oyunun ana paketine 150 KB'lık algılama kodu girmesin diye ayrı dosyaya kopyalanır.
// Çalıştır: node scripts/gen-face-mesh.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const { FaceLandmarker } = await import(path.join(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'))
const T = FaceLandmarker.FACE_LANDMARKS_TESSELATION
const tris = []
for (let i = 0; i < T.length; i += 3) tris.push(T[i].start, T[i + 1].start, T[i + 2].start)

// Sınır kenarları (tek üçgende geçen) → döngüler: dış oval + iki göz + ağız
const count = new Map()
const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`)
for (let i = 0; i < tris.length; i += 3) for (const [a, b] of [[tris[i], tris[i + 1]], [tris[i + 1], tris[i + 2]], [tris[i + 2], tris[i]]]) count.set(key(a, b), (count.get(key(a, b)) ?? 0) + 1)
const adj = new Map()
for (const [k, n] of count) if (n === 1) { const [a, b] = k.split('-').map(Number); (adj.get(a) ?? adj.set(a, []).get(a)).push(b); (adj.get(b) ?? adj.set(b, []).get(b)).push(a) }
const seen = new Set(), loops = []
for (const s of adj.keys()) {
  if (seen.has(s)) continue
  const loop = [s]; seen.add(s)
  let prev = -1, cur = s
  for (;;) { const nx = adj.get(cur).find(v => v !== prev && (!seen.has(v) || (v === s && loop.length > 2))); if (nx === undefined || nx === s) break; loop.push(nx); seen.add(nx); prev = cur; cur = nx }
  loops.push(loop)
}
const find = (v) => loops.find(l => l.includes(v))
const out = `// Otomatik üretildi: node scripts/gen-face-mesh.mjs (MediaPipe Face Landmarker yüz ağı, Apache-2.0). Elle düzenleme.
/** 852 üçgen, nokta indeksleri (0..467) */
export const MESH_TRIANGLES: readonly number[] = ${JSON.stringify(tris)}
/** Ağdaki delikler (sınır döngüleri) */
export const LOOP_FACE_OVAL: readonly number[] = ${JSON.stringify(find(10))}
export const LOOP_MOUTH: readonly number[] = ${JSON.stringify(find(13))}
export const LOOP_EYE_L: readonly number[] = ${JSON.stringify(find(159))}
export const LOOP_EYE_R: readonly number[] = ${JSON.stringify(find(386))}
`
fs.writeFileSync(path.join(root, 'src/face/meshData.ts'), out)
console.log('döngüler:', loops.map(l => `${l.length} (${l[0]})`).join(', '))
console.log('ağız', JSON.stringify(find(13)))
console.log('göz L', JSON.stringify(find(159)))
console.log('göz R', JSON.stringify(find(386)))
