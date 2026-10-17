// Gerçekçi yüz: fotoğraf, yüz algılamanın bulduğu 468 noktalık ağa gerilir. İfadeler ağı büker (göz kapakları iner,
// çene düşer, ağız köşeleri kalkar, kaşlar oynar), darbeler yanakları yaylı titretir. Ağda göz ve ağız yerinde delik
// var: fotoğrafın gözleri ve ağız içi bu deliklerin altına ayrı yama olarak çizilir. Kapak inince göz gerçekten kapanır,
// çene düşünce ağız açılır (altında koyu ağız içi görünür). Çizim WebGL ile küçük bir ara canvas'a yapılır;
// karakter bu canvas'ı kafasına yapıştırır. WebGL yoksa ya da yüz noktaları yoksa eski çizim kullanılır.
import type { FaceAsset, Vec } from '../game/types'
import { LOOP_EYE_L, LOOP_EYE_R, LOOP_FACE_OVAL, LOOP_MOUTH, MESH_TRIANGLES } from './meshData'

/** İfade kanalları. jaw piksel cinsinden (yüz görseli pikseli), diğerleri −1..1 civarı ağırlık */
export interface FaceShape { jaw: number; blinkL: number; blinkR: number; smile: number; brow: number; frown: number; pucker: number }
type Channel = keyof FaceShape
const CHANNELS: readonly Channel[] = ['jaw', 'blinkL', 'blinkR', 'smile', 'brow', 'frown', 'pucker']

/** Ara canvas'ta yüz görselinin çevresinde bırakılan pay (çene aşağı iner, yanaklar titrer) */
export const WARP_PAD_X = 70
export const WARP_PAD_TOP = 70
export const WARP_PAD_BOTTOM = 160

// Köşe düzeni: 0..467 yüz noktaları, sonra ovalin dışında iki halka (saç, alın, boyun payı), sonra delik merkezleri
const N = 468
const RING = LOOP_FACE_OVAL.length
const MID0 = N, OUT0 = N + RING
const C_MOUTH = N + RING * 2, C_EYE_L = C_MOUTH + 1, C_EYE_R = C_MOUTH + 2
const V_MAIN = C_EYE_R + 1

/** Yamalar: göz yaması kapak/kaş hareketini, ağız yaması çeneyi izlemez (kapak gözün, çene dişlerin üstünden kayar) */
const PATCHES: readonly { loop: readonly number[]; center: number; skip: readonly Channel[] }[] = [
  { loop: LOOP_MOUTH, center: C_MOUTH, skip: ['jaw'] },
  { loop: LOOP_EYE_L, center: C_EYE_L, skip: ['blinkL', 'blinkR', 'brow', 'frown'] },
  { loop: LOOP_EYE_R, center: C_EYE_R, skip: ['blinkL', 'blinkR', 'brow', 'frown'] },
]

// MediaPipe yüz ağı nokta grupları ("L" görselin solundaki göz/kaş)
const LIP_UPPER = [185, 40, 39, 37, 0, 267, 269, 270, 409, 191, 80, 81, 82, 13, 312, 311, 310, 415]
const LIP_LOWER = [146, 91, 181, 84, 17, 314, 405, 321, 375, 95, 88, 178, 87, 14, 317, 402, 318, 324]
const CORNER_L = [61, 78], CORNER_R = [291, 308]
const EYE_UP_L = [246, 161, 160, 159, 158, 157, 173], EYE_LO_L = [7, 163, 144, 145, 153, 154, 155]
const EYE_UP_R = [466, 388, 387, 386, 385, 384, 398], EYE_LO_R = [249, 390, 373, 374, 380, 381, 382]
const EYE_CORNERS_L = [33, 133], EYE_CORNERS_R = [263, 362]
const BROW_L = [70, 63, 105, 66, 107, 46, 53, 52, 65, 55], BROW_R = [300, 293, 334, 296, 336, 276, 283, 282, 295, 285]
const BROW_IN_L = [107, 66, 55, 65], BROW_IN_R = [336, 296, 285, 295]
const BROW_OUT_L = [70, 63, 46, 53], BROW_OUT_R = [300, 293, 276, 283]
const FOREHEAD = [10, 151, 9, 109, 338, 67, 297, 108, 337]
const NOSE = [1, 4, 5, 6, 168, 197, 195, 2, 98, 327]
const CHEEK_L = [205, 50, 187, 123, 147], CHEEK_R = [425, 280, 411, 352, 376]
const CHIN = [152, 148, 176, 149, 150, 377, 400, 378, 379, 199, 175, 200, 18]
const LIP_CENTER = [0, 13, 14, 17]

const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

const VS = `attribute vec2 a_pos; attribute vec2 a_uv; uniform vec2 u_size; varying vec2 v_uv;
void main() { vec2 p = a_pos / u_size * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0); v_uv = a_uv; }`
const FS = `precision mediump float; uniform sampler2D u_tex; uniform vec4 u_color; varying vec2 v_uv;
void main() { gl_FragColor = u_color.a > 0.0 ? u_color : texture2D(u_tex, v_uv); }`

export class FaceWarp {
  readonly canvas = document.createElement('canvas')
  /** Yüz görseli boyutu (piksel); ara canvas bunun çevresine pay ekler */
  readonly texW: number
  readonly texH: number
  private gl: WebGLRenderingContext
  private uColor: WebGLUniformLocation
  private posBuf: WebGLBuffer
  private texNatural: WebGLTexture
  private texCartoon: WebGLTexture
  private lost = false
  /** Göz bebekleri arası mesafe (piksel): tüm ifade büyüklükleri buna göre ölçeklenir */
  private s: number
  private rest = new Float32Array(V_MAIN * 2)
  private shapes = {} as Record<Channel, Float32Array>
  private jig = new Float32Array(V_MAIN * 2)
  private jv = new Float32Array(V_MAIN * 2)
  private stiff = new Float32Array(V_MAIN)
  private patchStart: number[] = []
  private pos: Float32Array
  private mouthFill = { off: 0, count: 0 }
  private eyeFill = { off: 0, count: 0 }
  private textured = { off: 0, count: 0 }
  private eyeColor: [number, number, number, number]

  /** Yüz noktaları yoksa ya da WebGL açılamazsa null (eski çizim kullanılır) */
  static create(asset: FaceAsset): FaceWarp | null {
    const mesh = asset.features.mesh
    if (!mesh || mesh.length < N) return null
    try { return new FaceWarp(asset, mesh) } catch { return null }
  }

  private constructor(asset: FaceAsset, mesh: readonly Vec[]) {
    this.texW = asset.natural.width
    this.texH = asset.natural.height
    this.canvas.width = this.texW + WARP_PAD_X * 2
    this.canvas.height = this.texH + WARP_PAD_TOP + WARP_PAD_BOTTOM
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL yok')
    this.gl = gl
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true })

    // ── Dinlenme konumları (yüz görseli pikseli) ──
    const R = this.rest
    for (let i = 0; i < N; i++) { R[i * 2] = mesh[i].x * this.texW; R[i * 2 + 1] = mesh[i].y * this.texH }
    let cx = 0, cy = 0
    for (const i of LOOP_FACE_OVAL) { cx += R[i * 2]; cy += R[i * 2 + 1] }
    cx /= RING; cy /= RING
    LOOP_FACE_OVAL.forEach((i, k) => {
      for (const [base, f] of [[MID0, 1.35], [OUT0, 2.3]] as const) {
        R[(base + k) * 2] = cx + (R[i * 2] - cx) * f
        R[(base + k) * 2 + 1] = cy + (R[i * 2 + 1] - cy) * f
      }
    })
    for (const p of PATCHES) this.centerOf(R, p.loop, p.center)
    const eyeL = this.pt(C_EYE_L), eyeR = this.pt(C_EYE_R)
    this.s = Math.max(20, Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y))
    // dıştaki köşeler daha sert yay: titreme yüzün ortasından dışa doğru dalgalanır
    const faceR = Math.hypot(R[454 * 2] - R[234 * 2], R[454 * 2 + 1] - R[234 * 2 + 1]) / 2
    for (let v = 0; v < V_MAIN; v++) this.stiff[v] = 210 + 150 * Math.min(1.5, Math.hypot(R[v * 2] - cx, R[v * 2 + 1] - cy) / faceR)
    this.buildShapes()

    // ── Köşe dizileri: ana ağ + yama kopyaları ──
    let vCount = V_MAIN
    for (const p of PATCHES) { this.patchStart.push(vCount); vCount += p.loop.length + 1 }
    this.pos = new Float32Array(vCount * 2)
    const uv = new Float32Array(vCount * 2)
    const setUv = (dst: number, src: number) => { uv[dst * 2] = R[src * 2] / this.texW; uv[dst * 2 + 1] = R[src * 2 + 1] / this.texH }
    for (let v = 0; v < V_MAIN; v++) setUv(v, v)
    PATCHES.forEach((p, k) => { p.loop.forEach((v, j) => setUv(this.patchStart[k] + j, v)); setUv(this.patchStart[k] + p.loop.length, p.center) })

    // ── Üçgenler: önce ağız/göz içi düz renk, sonra yamalar, en son ana ağ ──
    const idx: number[] = []
    const fan = (loop: readonly number[], center: number, map: (v: number, j: number) => number) =>
      loop.forEach((v, j) => idx.push(center, map(v, j), map(loop[(j + 1) % loop.length], (j + 1) % loop.length)))
    this.mouthFill.off = idx.length; fan(LOOP_MOUTH, C_MOUTH, v => v); this.mouthFill.count = idx.length - this.mouthFill.off
    this.eyeFill.off = idx.length; fan(LOOP_EYE_L, C_EYE_L, v => v); fan(LOOP_EYE_R, C_EYE_R, v => v); this.eyeFill.count = idx.length - this.eyeFill.off
    this.textured.off = idx.length
    PATCHES.forEach((p, k) => fan(p.loop, this.patchStart[k] + p.loop.length, (_v, j) => this.patchStart[k] + j))
    idx.push(...MESH_TRIANGLES)
    for (let k = 0; k < RING; k++) {
      const k2 = (k + 1) % RING
      const a = LOOP_FACE_OVAL[k], b = LOOP_FACE_OVAL[k2]
      idx.push(a, b, MID0 + k, b, MID0 + k2, MID0 + k, MID0 + k, MID0 + k2, OUT0 + k, MID0 + k2, OUT0 + k2, OUT0 + k)
    }
    this.textured.count = idx.length - this.textured.off

    // ── WebGL ──
    const prog = gl.createProgram()!
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src); gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader')
      gl.attachShader(prog, sh)
    }
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('program')
    gl.useProgram(prog)
    this.uColor = gl.getUniformLocation(prog, 'u_color')!
    gl.uniform2f(gl.getUniformLocation(prog, 'u_size'), this.canvas.width, this.canvas.height)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0)

    const uvBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW)
    const aUv = gl.getAttribLocation(prog, 'a_uv')
    gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0)
    this.posBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf); gl.bufferData(gl.ARRAY_BUFFER, this.pos, gl.DYNAMIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    const ib = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW)

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    this.texNatural = this.upload(asset.natural)
    this.texCartoon = this.upload(asset.cartoon)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.eyeColor = this.sampleEyeColor(asset.natural)
  }

  get ok() { return !this.lost }

  private pt(v: number): Vec { return { x: this.rest[v * 2], y: this.rest[v * 2 + 1] } }

  private centerOf(P: Float32Array, loop: readonly number[], dst: number) {
    let x = 0, y = 0
    for (const v of loop) { x += P[v * 2]; y += P[v * 2 + 1] }
    P[dst * 2] = x / loop.length; P[dst * 2 + 1] = y / loop.length
  }

  private upload(img: HTMLCanvasElement): WebGLTexture {
    const gl = this.gl, t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  /** Göz içi ortalama rengi: göz kapağı fotoğraftakinden fazla açılırsa aradaki boşluk bu renkle dolar */
  private sampleEyeColor(img: HTMLCanvasElement): [number, number, number, number] {
    const ctx = img.getContext('2d')
    if (!ctx) return [0.85, 0.82, 0.8, 1]
    let r = 0, g = 0, b = 0, n = 0
    for (const c of [C_EYE_L, C_EYE_R]) {
      const p = this.pt(c), half = Math.max(2, Math.round(this.s * 0.06))
      const d = ctx.getImageData(Math.round(p.x) - half, Math.round(p.y) - half, half * 2, half * 2).data
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
    }
    if (!n) return [0.85, 0.82, 0.8, 1]
    return [r / n / 255, g / n / 255, b / n / 255, 1]
  }

  /**
   * Sürücü noktaların yer değiştirmesini çevreye yumuşakça yay (Gauss ağırlıklı ortalama).
   * Sıfır yer değiştirmeli sürücüler "çapa"dır: o bölgeyi yerinde tutar.
   */
  private field(drivers: Map<number, Vec>, radius: number): Float32Array {
    const out = new Float32Array(V_MAIN * 2), R = this.rest, k = 2 * radius * radius
    const list = [...drivers]
    for (let v = 0; v < V_MAIN; v++) {
      const d = drivers.get(v)
      if (d) { out[v * 2] = d.x; out[v * 2 + 1] = d.y; continue }
      let sw = 0, sx = 0, sy = 0
      for (const [i, dd] of list) {
        const dx = R[v * 2] - R[i * 2], dy = R[v * 2 + 1] - R[i * 2 + 1]
        const g = Math.exp(-(dx * dx + dy * dy) / k)
        sw += g; sx += g * dd.x; sy += g * dd.y
      }
      const norm = Math.max(sw, 0.6)
      out[v * 2] = sx / norm; out[v * 2 + 1] = sy / norm
    }
    return out
  }

  private buildShapes() {
    const s = this.s, R = this.rest
    const put = (m: Map<number, Vec>, ids: readonly number[], x: number, y: number) => { for (const i of ids) m.set(i, { x, y }) }
    const lerpTo = (m: Map<number, Vec>, from: readonly number[], to: readonly number[], f: number) =>
      from.forEach((a, j) => { const b = to[j]; m.set(a, { x: (R[b * 2] - R[a * 2]) * f, y: (R[b * 2 + 1] - R[a * 2 + 1]) * f }) })

    // Çene: ağız çizgisinin altı aşağı iner; kulağa doğru etki azalır (çene menteşeden döner). 1 birim = 1 piksel
    const jaw = new Float32Array(V_MAIN * 2)
    const my = (R[13 * 2 + 1] + R[14 * 2 + 1]) / 2, mx = (R[13 * 2] + R[14 * 2]) / 2
    const halfW = Math.abs(R[454 * 2] - R[234 * 2]) / 2
    const upper = new Set(LIP_UPPER), lower = new Set(LIP_LOWER), corner = new Set([...CORNER_L, ...CORNER_R])
    for (let v = 0; v < V_MAIN; v++) {
      const x = R[v * 2], y = R[v * 2 + 1]
      const wx = 1 - 0.6 * smoothstep(halfW * 0.45, halfW * 1.05, Math.abs(x - mx))
      let w = smoothstep(my - s * 0.04, my + s * 0.16, y) * wx
      if (upper.has(v)) w = 0
      else if (lower.has(v)) w = wx
      else if (corner.has(v)) w = 0.42
      jaw[v * 2 + 1] = w
    }
    this.shapes.jaw = jaw

    // Göz kırpma: üst kapak alt kapağa iner, alt kapak biraz kalkar; kaş ve yanak yerinde kalır
    for (const [ch, up, lo, corners, brow, cheek] of [
      ['blinkL', EYE_UP_L, EYE_LO_L, EYE_CORNERS_L, BROW_L, CHEEK_L],
      ['blinkR', EYE_UP_R, EYE_LO_R, EYE_CORNERS_R, BROW_R, CHEEK_R],
    ] as const) {
      const m = new Map<number, Vec>()
      put(m, [...brow, ...cheek, ...NOSE], 0, 0); put(m, corners, 0, 0)
      lerpTo(m, up, lo, 0.84); lerpTo(m, lo, up, 0.12)
      this.shapes[ch] = this.field(m, s * 0.2)
    }

    // Gülümseme: ağız köşeleri dışa-yukarı, yanaklar kalkar, alt kapaklar hafif kısılır
    {
      const m = new Map<number, Vec>()
      put(m, [...NOSE, ...CHIN, ...LIP_CENTER, ...EYE_UP_L, ...EYE_UP_R, ...BROW_L, ...BROW_R], 0, 0)
      put(m, CORNER_L, -s * 0.09, -s * 0.08); put(m, CORNER_R, s * 0.09, -s * 0.08)
      put(m, CHEEK_L, -s * 0.02, -s * 0.06); put(m, CHEEK_R, s * 0.02, -s * 0.06)
      put(m, [...EYE_LO_L, ...EYE_LO_R], 0, -s * 0.035)
      this.shapes.smile = this.field(m, s * 0.3)
    }
    // Kaş kaldırma: kaşlar ve alın kalkar, üst kapak biraz açılır (şaşkınlık)
    {
      const m = new Map<number, Vec>()
      put(m, [...EYE_LO_L, ...EYE_LO_R, ...NOSE, ...CHEEK_L, ...CHEEK_R], 0, 0)
      put(m, [...BROW_L, ...BROW_R], 0, -s * 0.12)
      put(m, FOREHEAD, 0, -s * 0.05)
      put(m, [...EYE_UP_L, ...EYE_UP_R], 0, -s * 0.035)
      this.shapes.brow = this.field(m, s * 0.3)
    }
    // Kaş çatma: iç kaşlar aşağı ve ortaya, üst kapak hafif iner (acı / öfke)
    {
      const m = new Map<number, Vec>()
      put(m, [...EYE_LO_L, ...EYE_LO_R, 1, 4, 5, ...CHEEK_L, ...CHEEK_R], 0, 0)
      put(m, BROW_IN_L, s * 0.05, s * 0.07); put(m, BROW_IN_R, -s * 0.05, s * 0.07)
      put(m, [...BROW_OUT_L, ...BROW_OUT_R], 0, s * 0.02)
      put(m, [...EYE_UP_L, ...EYE_UP_R], 0, s * 0.02)
      this.shapes.frown = this.field(m, s * 0.25)
    }
    // Büzme ("O" ağız): köşeler ortaya toplanır
    {
      const m = new Map<number, Vec>()
      put(m, [...NOSE, ...CHIN, ...CHEEK_L, ...CHEEK_R], 0, 0)
      put(m, CORNER_L, s * 0.07, 0); put(m, CORNER_R, -s * 0.07, 0)
      this.shapes.pucker = this.field(m, s * 0.2)
    }
  }

  /** Darbe: yüz görseli pikselindeki noktaya dir yönünde vuruş (power ≈ 1 tokat) */
  impact(at: Vec, dir: Vec, power: number) {
    const R = this.rest, r = this.s * 0.65, k = 2 * r * r, v0 = 280 * power
    for (let v = 0; v < V_MAIN; v++) {
      const dx = R[v * 2] - at.x, dy = R[v * 2 + 1] - at.y
      const g = Math.exp(-(dx * dx + dy * dy) / k)
      this.jv[v * 2] += dir.x * v0 * g
      this.jv[v * 2 + 1] += dir.y * v0 * g
    }
  }

  update(dt: number) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps
    const J = this.jig, Vv = this.jv, max = this.s * 0.25
    for (let st = 0; st < steps; st++) for (let v = 0; v < V_MAIN; v++) {
      const k = this.stiff[v]
      for (let c = 0; c < 2; c++) {
        const i = v * 2 + c
        Vv[i] += (-k * J[i] - 9 * Vv[i]) * h
        J[i] = Math.max(-max, Math.min(max, J[i] + Vv[i] * h))
      }
    }
  }

  /** Ağı ifadeye göre bük ve ara canvas'a çiz */
  render(shape: FaceShape, cartoon: boolean) {
    if (this.lost) return
    const gl = this.gl, R = this.rest, J = this.jig, P = this.pos
    const active = CHANNELS.filter(c => shape[c] !== 0)
    const deform = (dst: number, v: number, skip: readonly Channel[] | null) => {
      let x = R[v * 2] + J[v * 2], y = R[v * 2 + 1] + J[v * 2 + 1]
      for (const c of active) {
        if (skip && skip.includes(c)) continue
        const w = shape[c], S = this.shapes[c]
        x += w * S[v * 2]; y += w * S[v * 2 + 1]
      }
      P[dst * 2] = x + WARP_PAD_X; P[dst * 2 + 1] = y + WARP_PAD_TOP
    }
    for (let v = 0; v < C_MOUTH; v++) deform(v, v, null)
    for (const p of PATCHES) this.centerOf(P, p.loop, p.center)
    PATCHES.forEach((p, k) => {
      const start = this.patchStart[k]
      p.loop.forEach((v, j) => deform(start + j, v, p.skip))
      let x = 0, y = 0
      for (let j = 0; j < p.loop.length; j++) { x += P[(start + j) * 2]; y += P[(start + j) * 2 + 1] }
      P[(start + p.loop.length) * 2] = x / p.loop.length; P[(start + p.loop.length) * 2 + 1] = y / p.loop.length
    })

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, P)
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform4f(this.uColor, 0.24, 0.05, 0.07, 1)
    gl.drawElements(gl.TRIANGLES, this.mouthFill.count, gl.UNSIGNED_SHORT, this.mouthFill.off * 2)
    gl.uniform4f(this.uColor, ...this.eyeColor)
    gl.drawElements(gl.TRIANGLES, this.eyeFill.count, gl.UNSIGNED_SHORT, this.eyeFill.off * 2)
    gl.uniform4f(this.uColor, 0, 0, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, cartoon ? this.texCartoon : this.texNatural)
    gl.drawElements(gl.TRIANGLES, this.textured.count, gl.UNSIGNED_SHORT, this.textured.off * 2)
  }

  /** Bükülmüş yüzdeki bir yüz noktasının yeri (yüz görseli pikseli) — dil gibi katmanlar için */
  deformedPoint(v: number): Vec { return { x: this.pos[v * 2] - WARP_PAD_X, y: this.pos[v * 2 + 1] - WARP_PAD_TOP } }

  dispose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.canvas.width = 0; this.canvas.height = 0
  }
}
