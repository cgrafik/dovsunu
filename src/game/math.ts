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
