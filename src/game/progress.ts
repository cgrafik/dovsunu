// İlerleme: tüm turların toplam puanı bu cihazda birikir; belli eşiklerde yeni araçlar açılır.
import { TOOLS, type ToolDef } from './tools'

const KEY = 'samarmatik_toplam'
let memory = 0

export function totalPoints(): number {
  try { const v = Number(localStorage.getItem(KEY)); if (Number.isFinite(v) && v > 0) return v } catch { /* depolama yok */ }
  return memory
}

export const isUnlocked = (t: ToolDef, total = totalPoints()) => !t.unlockAt || total >= t.unlockAt

/** Tur puanını ekle; bu turla yeni açılan araçları döner */
export function addPoints(points: number): ToolDef[] {
  const before = totalPoints(), after = before + Math.max(0, Math.round(points))
  memory = after
  try { localStorage.setItem(KEY, String(after)) } catch { /* depolama yok */ }
  return TOOLS.filter(t => t.unlockAt && before < t.unlockAt && after >= t.unlockAt)
}

/** Sıradaki kilitli araç (yoksa null) */
export function nextUnlock(total = totalPoints()): ToolDef | null {
  return [...TOOLS].filter(t => t.unlockAt && total < t.unlockAt).sort((a, b) => a.unlockAt! - b.unlockAt!)[0] ?? null
}
