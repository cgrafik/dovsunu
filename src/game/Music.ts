// Arka plan müziği: komik, tempolu bir polka ("um-pa um-pa"): tuba bas, kısa akorlar, zıplayan melodi, zil ve trampet.
// Kayıt değil, Web Audio ile çalınır (lisans sorunu yok, dosya indirilmez). Notalar biraz önceden zamanlanır
// (lookahead), böylece sekme yavaşlasa da ritim kaymaz. Son saniyelerde tempo hızlanır.

const N = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const R = 0   // es (sessizlik)

// 8 ölçü × 8 sekizlik. Akor: C F G C | C F G7 C
const MELODY: readonly number[] = [
  67, 64, 67, 64, 72, R, 67, R,
  69, 65, 69, 65, 72, R, 69, R,
  71, 67, 71, 74, 77, 76, 74, 71,
  72, R, 67, R, 72, R, R, R,
  76, 75, 76, 79, 76, 72, 67, 64,
  65, 69, 72, 77, 76, 74, 72, 69,
  67, 71, 74, 79, 77, 74, 71, 67,
  72, 67, 64, 67, 72, R, 60, R,
]
const BASS: readonly [number, number][] = [[48, 43], [41, 48], [43, 50], [48, 43], [48, 43], [41, 48], [43, 50], [48, 43]]
const CHORDS: readonly (readonly number[])[] = [[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 64, 67], [60, 64, 67], [60, 65, 69], [59, 62, 65, 67], [60, 64, 67]]

export class Music {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private noise: AudioBuffer | null = null
  private timer = 0
  private step = 0
  private nextAt = 0
  private loop = 0
  /** Tempo çarpanı (1 = 150 vuruş/dk) */
  tempo = 1

  get playing() { return this.timer !== 0 }

  /** dest: ana ses düğümü (ses seviyesi ve sessize alma oradan geçer) */
  start(ctx: AudioContext, dest: AudioNode) {
    if (this.timer) return
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.setValueAtTime(0.0001, ctx.currentTime)
    this.out.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.6)
    this.out.connect(dest)
    if (!this.noise) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate), d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this.noise = buf
    }
    this.step = 0; this.loop = 0; this.tempo = 1
    this.nextAt = ctx.currentTime + 0.08
    this.timer = window.setInterval(() => this.schedule(), 40)
    this.schedule()
  }

  /** Yumuşakça kapat */
  stop() {
    if (!this.timer) return
    window.clearInterval(this.timer); this.timer = 0
    const ctx = this.ctx, out = this.out
    if (ctx && out) {
      out.gain.cancelScheduledValues(ctx.currentTime)
      out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12)
      setTimeout(() => out.disconnect(), 800)
    }
    this.out = null
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx || !this.out) return
    while (this.nextAt < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextAt)
      this.nextAt += 60 / (150 * this.tempo) / 2   // sekizlik süre
      this.step = (this.step + 1) % MELODY.length
      if (this.step === 0) this.loop++
    }
  }

  private playStep(i: number, t: number) {
    const bar = Math.floor(i / 8), pos = i % 8, e = 60 / (150 * this.tempo) / 2
    // tuba: vuruş 1 ve 3 (sekizlik 0, 4)
    if (pos === 0 || pos === 4) this.note('triangle', N(BASS[bar][pos === 0 ? 0 : 1]), t, e * 1.6, 0.55, 900)
    // "pa": vuruş 2 ve 4 (sekizlik 2, 6) kısa akor
    if (pos === 2 || pos === 6) for (const m of CHORDS[bar]) this.note('sawtooth', N(m), t, e * 0.55, 0.07, 1800)
    // melodi: her ikinci turda bir oktav yukarı ve ince sesli (çeşitlilik)
    const m = MELODY[i]
    if (m) {
      const up = this.loop % 2 === 1
      this.note(up ? 'triangle' : 'square', N(m + (up ? 12 : 0)), t, e * 0.8, up ? 0.22 : 0.12, 3200, true)
    }
    // ritim: zil her sekizlikte (hafif), trampet 2 ve 4'te
    this.hat(t, pos % 2 ? 0.05 : 0.03)
    if (pos === 2 || pos === 6) this.snare(t)
  }

  private note(type: OscillatorType, f: number, t: number, dur: number, peak: number, cutoff: number, vib = false) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter()
    o.type = type; o.frequency.setValueAtTime(f, t)
    if (vib) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain()
      lfo.frequency.value = 6; depth.gain.value = f * 0.012
      lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05)
    }
    lp.type = 'lowpass'; lp.frequency.value = cutoff
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(lp).connect(g).connect(this.out!)
    o.start(t); o.stop(t + dur + 0.05)
  }

  private hat(t: number, peak: number) {
    const ctx = this.ctx!, s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain()
    s.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 7000
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
    s.connect(hp).connect(g).connect(this.out!); s.start(t); s.stop(t + 0.06)
  }

  private snare(t: number) {
    const ctx = this.ctx!, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain()
    s.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    s.connect(bp).connect(g).connect(this.out!); s.start(t); s.stop(t + 0.14)
  }
}
