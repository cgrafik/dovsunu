// Küçük matematik yardımcıları: yay (spring), yumuşatma eğrileri, rastgelelik

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
export const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1))
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInCubic = (t: number) => t * t * t
export const easeOutBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) }
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2

/**
 * Sönümlü yay: değer hedefe (dinlenme pozu) esnekçe döner. Animasyonlar hedefi değil hızı/değeri iter,
 * yay her karede karakteri başlangıç pozuna geri getirir — aynı anda çok etki gelse de poz bozulmaz.
 */
export class Spring {
  value: number
  velocity = 0
  target: number
  stiffness: number
  damping: number

  constructor(rest = 0, stiffness = 170, damping = 12) {
    this.value = rest
    this.target = rest
    this.stiffness = stiffness
    this.damping = damping
  }

  impulse(v: number) { this.velocity += v }
  set(v: number) { this.value = v }

  update(dt: number) {
    // Yarı-örtük Euler; dt küçük adımlara bölünür ki sert yaylar patlamasın
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const a = -this.stiffness * (this.value - this.target) - this.damping * this.velocity
      this.velocity += a * h
      this.value += this.velocity * h
    }
  }
}

/** Aynı öğe art arda gelmesin: son seçilenden farklı rastgele indeks */
export function pickIndexAvoiding(n: number, last: number): number {
  if (n <= 1) return 0
  let i = Math.floor(Math.random() * (n - 1))
  if (i >= last) i++
  return i
}

/** Rengi beyaza (amt > 0) ya da siyaha (amt < 0) doğru karıştır: #rrggbb → #rrggbb */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const to = amt > 0 ? 255 : 0, k = Math.abs(amt)
  const ch = (s: number) => Math.round(lerp((n >> s) & 255, to, k)).toString(16).padStart(2, "0")
  return "#" + ch(16) + ch(8) + ch(0)
}

/** Tohumlu rastgele (sahne süsleri her karede aynı yerde dursun) */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
