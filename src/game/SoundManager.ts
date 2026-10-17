// Ses yöneticisi — tüm efektler Web Audio ile programatik üretilir (ses dosyası yok → lisans sorunu yok).
// • Tarayıcı kuralı: AudioContext yalnızca kullanıcının ilk dokunuşunda açılır (unlock()).
// • Çeşitlilik: her sesin birkaç varyantı var; aynı varyant art arda çalmaz, perde rastgele ±%8 kayar.
// • Koruma: aynı ses 60 ms içinde tekrar çalmaz, aynı anda en çok MAX_VOICES ses.
import { pickIndexAvoiding, rand } from './math'

export type SoundId =
  | 'click' | 'slap' | 'punch' | 'thwack' | 'bonk' | 'splat' | 'splash' | 'giggle' | 'yell' | 'cheer' | 'fail'
  | 'score' | 'combo' | 'milestone' | 'dizzy' | 'boing' | 'whoosh' | 'bell'

type Voice = (s: SoundManager, t: number, k: number) => number   // dönüş: sesin süresi (sn)

const MAX_VOICES = 24
const PREF_KEY = 'saplak_ses'

export interface SoundSettings { muted: boolean; volume: number }

export class SoundManager {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private settings: SoundSettings
  private lastVariant = new Map<SoundId, number>()
  private lastAt = new Map<SoundId, number>()
  private voices = 0
  private listeners = new Set<() => void>()

  constructor() {
    let s: SoundSettings = { muted: false, volume: 0.7 }
    try { const raw = localStorage.getItem(PREF_KEY); if (raw) s = { ...s, ...JSON.parse(raw) } } catch { /* gizli mod */ }
    this.settings = s
  }

  // ── Ayarlar (React useSyncExternalStore ile okunur) ─────────────────────────
  getSettings = (): SoundSettings => this.settings
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(this.settings)) } catch { /* gizli mod */ }
    this.listeners.forEach(f => f())
  }
  setMuted(muted: boolean) { this.settings = { ...this.settings, muted }; this.applyGain(); this.emit() }
  setVolume(volume: number) { this.settings = { ...this.settings, volume: Math.max(0, Math.min(1, volume)) }; this.applyGain(); this.emit() }
  private applyGain() {
    if (!this.master || !this.ctx) return
    const v = this.settings.muted ? 0 : this.settings.volume * 0.85
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
  }

  /** İlk kullanıcı etkileşiminde çağrılır (tıklama / dokunma / tuş) */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      // Hafif sıkıştırıcı: üst üste binen sesler patlamasın
      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -14; comp.ratio.value = 4
      this.master.connect(comp).connect(this.ctx.destination)
      this.noise = this.makeNoise()
      this.applyGain()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Belleği bırak (uygulama kapanırken) */
  dispose() {
    void this.ctx?.close()
    this.ctx = null; this.master = null; this.noise = null
  }

  play(id: SoundId, intensity = 1) {
    const ctx = this.ctx
    if (!ctx || !this.master || this.settings.muted || ctx.state !== 'running') return
    const now = performance.now()
    if (now - (this.lastAt.get(id) ?? 0) < 60 || this.voices >= MAX_VOICES) return
    this.lastAt.set(id, now)
    const variants = VOICES[id]
    const i = pickIndexAvoiding(variants.length, this.lastVariant.get(id) ?? -1)
    this.lastVariant.set(id, i)
    this.voices++
    const dur = variants[i](this, ctx.currentTime + 0.005, intensity)
    setTimeout(() => { this.voices = Math.max(0, this.voices - 1) }, (dur + 0.1) * 1000)
  }

  // ── Yapı taşları ────────────────────────────────────────────────────────────
  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return buf
  }

  /** Zarf: 0'dan tepeye hızlı çıkış, sonra üstel sönüş */
  env(t: number, attack: number, dur: number, peak: number, dest: AudioNode = this.master!): GainNode {
    const g = this.ctx!.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    g.connect(dest)
    return g
  }

  tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, opts: { attack?: number; vibrato?: [number, number]; dest?: AudioNode } = {}) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    const detune = rand(0.92, 1.08)
    o.frequency.setValueAtTime(f0 * detune, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * detune), t + dur)
    if (opts.vibrato) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain()
      lfo.frequency.value = opts.vibrato[0]; depth.gain.value = opts.vibrato[1]
      lfo.connect(depth).connect(o.frequency)
      lfo.start(t); lfo.stop(t + dur + 0.05)
    }
    o.connect(this.env(t, opts.attack ?? 0.008, dur, peak, opts.dest))
    o.start(t); o.stop(t + dur + 0.05)
  }

  noiseBurst(t: number, dur: number, peak: number, filter: BiquadFilterType, f0: number, f1: number, q = 1, dest?: AudioNode) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = rand(0.9, 1.1)
    const bq = ctx.createBiquadFilter()
    bq.type = filter; bq.Q.value = q
    bq.frequency.setValueAtTime(f0, t)
    bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur)
    src.connect(bq).connect(this.env(t, 0.005, dur, peak, dest))
    src.start(t, rand(0, 0.5)); src.stop(t + dur + 0.05)
  }

  /** Ünlü (formant) süzgeci: testere dişi dalgayı insan sesine benzetir */
  formant(t: number, dur: number, f1: number, f2: number, peak: number): GainNode {
    const ctx = this.ctx!
    const out = this.env(t, 0.03, dur, peak)
    const input = ctx.createGain()
    for (const [f, q, g] of [[f1, 6, 1], [f2, 8, 0.6]] as const) {
      const bq = ctx.createBiquadFilter(); bq.type = 'bandpass'; bq.frequency.value = f; bq.Q.value = q
      const gg = ctx.createGain(); gg.gain.value = g
      input.connect(bq).connect(gg).connect(out)
    }
    return input
  }
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

// ── Ses tarifleri (her biri sesin süresini döner) ──────────────────────────────
const VOICES: Record<SoundId, Voice[]> = {
  click: [
    (s, t) => { s.tone('sine', 900, 700, t, 0.05, 0.25); s.tone('triangle', 1600, 1500, t, 0.03, 0.08); return 0.06 },
    (s, t) => { s.tone('sine', 1100, 850, t, 0.05, 0.22); return 0.05 },
  ],
  // Tokat: keskin şaklama + kısa tok vuruş
  slap: [
    (s, t, k) => {
      s.noiseBurst(t, 0.09, 0.85 * k, 'highpass', 2600, 1300, 0.8); s.noiseBurst(t, 0.05, 0.5, 'bandpass', 1300, 800, 1.5)
      s.tone('sine', 260, 120, t, 0.08, 0.4 * k); return 0.15
    },
    (s, t, k) => {
      s.noiseBurst(t, 0.07, 0.9 * k, 'highpass', 3200, 1800, 0.7); s.noiseBurst(t + 0.01, 0.06, 0.4, 'bandpass', 900, 600, 2)
      s.tone('triangle', 1800, 900, t + 0.02, 0.05, 0.08); return 0.12
    },
  ],
  // Yumruk: derin gümleme + çatırtı
  punch: [
    (s, t, k) => {
      s.tone('sine', 120, 40, t, 0.26, 0.95 * k); s.noiseBurst(t, 0.15, 0.6 * k, 'lowpass', 700, 150)
      s.noiseBurst(t, 0.05, 0.3, 'bandpass', 2200, 900, 1.2); return 0.32
    },
    (s, t, k) => {
      s.tone('sine', 140, 45, t, 0.24, 0.9 * k); s.tone('triangle', 320, 90, t, 0.12, 0.25 * k)
      s.noiseBurst(t, 0.1, 0.5, 'lowpass', 1200, 200); return 0.3
    },
  ],
  // Terlik: lastik tabanın düz "şap" sesi
  thwack: [
    (s, t, k) => {
      s.noiseBurst(t, 0.07, 0.75 * k, 'bandpass', 1800, 700, 3); s.tone('square', 420, 180, t, 0.06, 0.12)
      s.tone('sine', 180, 70, t, 0.12, 0.45 * k); return 0.16
    },
    (s, t, k) => {
      s.noiseBurst(t, 0.06, 0.8 * k, 'bandpass', 2200, 900, 2.5); s.tone('sine', 210, 80, t, 0.1, 0.4 * k)
      s.tone('sine', 900, 1300, t + 0.08, 0.08, 0.06); return 0.2
    },
  ],
  // Sünger sopa: tok darbe + yay "boing"
  bonk: [
    (s, t, k) => {
      s.tone('sine', 190, 55, t, 0.2, 0.7 * k); s.noiseBurst(t, 0.08, 0.35 * k, 'lowpass', 900, 200)
      s.tone('sine', 230, 470, t + 0.04, 0.38, 0.22, { vibrato: [18, 45] }); return 0.45
    },
    (s, t, k) => {
      s.tone('sine', 170, 60, t, 0.18, 0.65 * k); s.tone('triangle', 900, 1600, t + 0.02, 0.12, 0.16); return 0.25
    },
    (s, t, k) => {
      s.tone('sine', 210, 50, t, 0.2, 0.7 * k); s.noiseBurst(t, 0.06, 0.3, 'bandpass', 1400, 500, 2)
      s.tone('sine', 1300, 280, t + 0.06, 0.32, 0.14); return 0.4
    },
  ],
  // Pasta: ıslak şap sesi
  splat: [
    (s, t, k) => {
      s.noiseBurst(t, 0.28, 0.55 * k, 'bandpass', 1600, 260, 1.4); s.tone('sine', 130, 45, t, 0.14, 0.5 * k)
      for (let i = 0; i < 3; i++) s.tone('sine', rand(500, 900), rand(250, 400), t + 0.08 + i * rand(0.04, 0.07), 0.04, 0.08)
      return 0.4
    },
    (s, t, k) => {
      s.noiseBurst(t, 0.22, 0.5 * k, 'lowpass', 2400, 300, 1); s.tone('sine', 110, 40, t, 0.16, 0.55 * k)
      s.noiseBurst(t + 0.12, 0.18, 0.18, 'bandpass', 900, 400, 4); return 0.35
    },
  ],
  // Su: fışkırma + damlalar
  splash: [
    (s, t, k) => {
      s.noiseBurst(t, 0.5, 0.4 * k, 'bandpass', 3200, 1400, 0.9)
      for (let i = 0; i < 7; i++) s.tone('sine', rand(1400, 2600), rand(700, 1200), t + rand(0.05, 0.5), 0.045, 0.07)
      return 0.6
    },
    (s, t, k) => {
      s.noiseBurst(t, 0.35, 0.45 * k, 'highpass', 1800, 900, 0.7)
      for (let i = 0; i < 5; i++) s.tone('sine', rand(1800, 3000), rand(900, 1400), t + rand(0.1, 0.45), 0.04, 0.06)
      return 0.5
    },
  ],
  // Kıkırdama: "ha-ha-ha" heceleri
  giggle: [
    (s, t) => {
      const base = rand(300, 380), n = 6
      for (let i = 0; i < n; i++) {
        const st = t + i * 0.12
        const f = base * (1 + 0.12 * Math.sin(i * 1.3)) * (i === n - 1 ? 0.8 : 1)
        s.tone('sawtooth', f * 1.1, f * 0.92, st, 0.09, 1, { dest: s.formant(st, 0.1, 850, 1250, 0.35) })
      }
      return n * 0.12 + 0.1
    },
    (s, t) => {
      const base = rand(380, 460), n = 5
      for (let i = 0; i < n; i++) {
        const st = t + i * 0.1
        s.tone('sawtooth', base * (1.15 - i * 0.04), base * (1 - i * 0.04), st, 0.075, 1, { dest: s.formant(st, 0.085, 650, 1700, 0.32) })
      }
      return n * 0.1 + 0.1
    },
  ],
  // Çizgi film bağırışı: "AAAH!" / "OUUUH!"
  yell: [
    (s, t) => { s.tone('sawtooth', 320, 540, t, 0.55, 1, { attack: 0.04, vibrato: [7, 18], dest: s.formant(t, 0.6, 780, 1180, 0.4) }); return 0.6 },
    (s, t) => { s.tone('sawtooth', 260, 170, t, 0.6, 1, { attack: 0.04, vibrato: [6, 14], dest: s.formant(t, 0.62, 420, 820, 0.45) }); return 0.65 },
    (s, t) => { s.tone('sawtooth', 520, 300, t, 0.45, 1, { attack: 0.02, vibrato: [9, 22], dest: s.formant(t, 0.5, 700, 1300, 0.38) }); return 0.5 },
  ],
  // Ring kalabalığı: uğultu + "o-le!" koro + alkış (nakavtta)
  cheer: [
    (s, t) => {
      for (const f of [500, 900, 1500]) s.noiseBurst(t, 1.4, 0.16, 'bandpass', f, f * 1.15, 0.8)
      const notes = [[67, 0.0], [64, 0.32]] as const
      for (const [n, at] of notes) for (let v = 0; v < 4; v++) {
        const f = NOTE(n) * rand(0.985, 1.015) / 2
        s.tone('sawtooth', f, f, t + at + rand(0, 0.03), 0.36, 1, { attack: 0.05, dest: s.formant(t + at, 0.4, 720, 1150, 0.12) })
      }
      for (let i = 0; i < 6; i++) s.noiseBurst(t + 0.8 + i * 0.13, 0.05, 0.25, 'highpass', 1800, 1500, 0.7)
      return 1.6
    },
    (s, t) => {
      for (const f of [400, 800, 1300, 2000]) s.noiseBurst(t, 1.2, 0.14, 'bandpass', f * 0.8, f * 1.3, 0.9)
      for (let i = 0; i < 9; i++) s.noiseBurst(t + 0.15 + i * rand(0.08, 0.12), 0.04, 0.22, 'highpass', 2000, 1600, 0.7)
      return 1.3
    },
  ],
  // Komik başarısızlık: "vah vah vaaah"
  fail: [
    (s, t) => {
      const ns = [55, 54, 53, 52]
      ns.forEach((n, i) => {
        const st = t + i * 0.28, d = i === 3 ? 0.7 : 0.24
        s.tone('sawtooth', NOTE(n), NOTE(n) * (i === 3 ? 0.97 : 1), st, d, 0.16, { attack: 0.03, vibrato: i === 3 ? [6, 6] : undefined })
      })
      return 1.6
    },
  ],
  score: [(s, t, k) => { s.tone('triangle', 660 * (1 + 0.08 * k), 700 * (1 + 0.08 * k), t, 0.08, 0.18); return 0.1 }],
  combo: [
    (s, t, k) => {
      const base = 72 + Math.min(10, Math.round(k))
      ;[0, 4, 7].forEach((st, i) => s.tone('triangle', NOTE(base + st), NOTE(base + st), t + i * 0.06, 0.09, 0.2))
      return 0.3
    },
  ],
  milestone: [
    (s, t) => {
      ;[72, 76, 79, 84].forEach((n, i) => s.tone('square', NOTE(n), NOTE(n), t + i * 0.1, i === 3 ? 0.45 : 0.12, 0.09))
      ;[72, 76, 79].forEach(n => s.tone('triangle', NOTE(n), NOTE(n), t + 0.3, 0.5, 0.08))
      return 0.9
    },
  ],
  // Sersemleme: cıvıldayan kuşlar
  dizzy: [
    (s, t) => { for (let i = 0; i < 7; i++) s.tone('sine', rand(2300, 2800), rand(3200, 3800), t + i * rand(0.09, 0.15), 0.06, 0.07); return 1.1 },
  ],
  boing: [
    (s, t) => { s.tone('sine', 150, 620, t, 0.45, 0.32, { vibrato: [24, 70] }); return 0.5 },
    (s, t) => { s.tone('square', 260, 290, t, 0.35, 0.08, { vibrato: [11, 30] }); s.tone('sine', 520, 760, t, 0.3, 0.12); return 0.4 },
  ],
  whoosh: [(s, t) => { s.noiseBurst(t, 0.25, 0.25, 'bandpass', 380, 2600, 1.2); return 0.3 }],
  // Gong / ring zili: üç kez "ding"
  bell: [
    (s, t) => {
      for (let i = 0; i < 3; i++) {
        const st = t + i * 0.22
        s.tone('sine', 1320, 1316, st, 0.9, 0.22); s.tone('sine', 3640, 3630, st, 0.5, 0.06); s.tone('sine', 2200, 2195, st, 0.6, 0.05)
      }
      return 1.4
    },
  ],
}
