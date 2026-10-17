// Skor, kombo ve tur durumu — tek gerçek kaynak. Arayüz subscribe/getSnapshot ile okur (useSyncExternalStore).
import type { ToolId } from './types'
import { TOOLS, toolById } from './tools'

export const ROUND_SECONDS = 60
/** Bu süre içinde yeni etkileşim gelirse kombo sürer */
export const COMBO_WINDOW_MS = 1600

const MILESTONES: readonly [number, string][] = [
  [100, 'Isınma bitti!'],
  [250, 'Şaplak ustası!'],
  [500, 'Durdurun şunu!'],
  [800, 'Kimse kurtaramaz!'],
  [1200, 'Efsane şaplak!'],
  [1800, 'Nakavt kralı! 🏆'],
  [2600, 'Tarih yazıldı!'],
]

export interface ScoreSnapshot {
  score: number
  combo: number
  maxCombo: number
  multiplier: number
  hits: number
  usage: Record<ToolId, number>
  /** Kalan süre (sn); tur başlamadıysa ROUND_SECONDS */
  timeLeft: number
  started: boolean
  finished: boolean
  /** Son eşik mesajı ve kimliği (arayüz yeni mesajı tanısın diye) */
  message: { id: number; text: string } | null
}

export interface HitResult { gained: number; combo: number; multiplier: number; milestone: string | null; variety: boolean }

const emptyUsage = () => Object.fromEntries(TOOLS.map(t => [t.id, 0])) as Record<ToolId, number>

export class ScoreManager {
  private snap: ScoreSnapshot = this.fresh()
  private lastHitAt = 0
  private lastTool: ToolId | null = null
  private startedAt = 0
  private nextMilestone = 0
  private msgId = 0
  private listeners = new Set<() => void>()

  private fresh(): ScoreSnapshot {
    return { score: 0, combo: 0, maxCombo: 0, multiplier: 1, hits: 0, usage: emptyUsage(), timeLeft: ROUND_SECONDS, started: false, finished: false, message: null }
  }

  getSnapshot = (): ScoreSnapshot => this.snap
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private set(p: Partial<ScoreSnapshot>) { this.snap = { ...this.snap, ...p }; this.listeners.forEach(f => f()) }

  reset() {
    this.lastHitAt = 0; this.lastTool = null; this.startedAt = 0; this.nextMilestone = 0
    this.snap = this.fresh()
    this.listeners.forEach(f => f())
  }

  /** Kombo çarpanı: her 5 kombo +0,5 (en çok ×4) */
  static multiplierFor(combo: number) { return Math.min(4, 1 + Math.floor(combo / 5) * 0.5) }

  /** Bir etkileşim gerçekleşti → puan hesapla; tur bittiyse null */
  hit(tool: ToolId, now: number): HitResult | null {
    if (this.snap.finished) return null
    if (!this.snap.started) this.startedAt = now
    const inWindow = now - this.lastHitAt <= COMBO_WINDOW_MS
    const combo = inWindow ? this.snap.combo + 1 : 1
    const multiplier = ScoreManager.multiplierFor(combo)
    // Çeşitlilik ödülü: bir önceki araçtan farklıysa +3
    const variety = this.lastTool !== null && this.lastTool !== tool
    const gained = Math.round((toolById(tool).points + (variety ? 3 : 0)) * multiplier)
    const score = this.snap.score + gained
    this.lastHitAt = now; this.lastTool = tool

    let milestone: string | null = null
    let message = this.snap.message
    while (this.nextMilestone < MILESTONES.length && score >= MILESTONES[this.nextMilestone][0]) {
      milestone = MILESTONES[this.nextMilestone][1]
      this.nextMilestone++
    }
    if (milestone) message = { id: ++this.msgId, text: milestone }

    this.set({
      score, combo, multiplier, maxCombo: Math.max(this.snap.maxCombo, combo), hits: this.snap.hits + 1,
      usage: { ...this.snap.usage, [tool]: this.snap.usage[tool] + 1 }, started: true, message,
    })
    return { gained, combo, multiplier, milestone, variety }
  }

  /** Her karede: kombo süresi dolduysa sıfırla, kalan süreyi güncelle; tur bitince true */
  tick(now: number): boolean {
    if (!this.snap.started || this.snap.finished) return false
    const p: Partial<ScoreSnapshot> = {}
    if (this.snap.combo > 0 && now - this.lastHitAt > COMBO_WINDOW_MS) { p.combo = 0; p.multiplier = 1 }
    const left = Math.max(0, ROUND_SECONDS - (now - this.startedAt) / 1000)
    if (Math.ceil(left) !== Math.ceil(this.snap.timeLeft)) p.timeLeft = left
    if (left <= 0) { p.timeLeft = 0; p.finished = true }
    if (Object.keys(p).length) this.set(p)
    return p.finished === true
  }

  /** Iska (karakterin dışına dokunuldu): kombo sıfırlanır; eldeki kombo döner */
  miss(): number {
    if (!this.snap.started || this.snap.finished || this.snap.combo === 0) return 0
    const lost = this.snap.combo
    this.lastHitAt = 0
    this.set({ combo: 0, multiplier: 1 })
    return lost
  }

  /** Oyuncu turu erken bitirdi */
  finish() { if (!this.snap.finished) this.set({ finished: true, started: true }) }

  /** Kombo çubuğu için: son vuruştan bu yana kalan pencere (0..1) */
  comboProgress(now: number) {
    if (this.snap.combo === 0) return 0
    return Math.max(0, 1 - (now - this.lastHitAt) / COMBO_WINDOW_MS)
  }
}
