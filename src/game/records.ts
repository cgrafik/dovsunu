// Rekor tablosu: en iyi 3 skor bu cihazda saklanır (tarayıcının yerel depolaması; hiçbir sunucuya gitmez).
// Gizli sekmede ya da depolama kapalıysa tablo yalnızca o oturumda tutulur.

export interface RecordEntry { name: string; score: number; combo: number; date: string }

const KEY = 'saplak_rekorlar'
const MAX = 3
let memory: RecordEntry[] = []

export function loadRecords(): RecordEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const list = JSON.parse(raw) as RecordEntry[]
      if (Array.isArray(list)) return list.filter(r => typeof r.score === 'number').slice(0, MAX)
    }
  } catch { /* depolama yok */ }
  return memory
}

/** Bu skor tabloya girer mi; girerse sırası (0 = birinci), girmezse -1 */
export function rankFor(score: number): number {
  if (score <= 0) return -1
  const list = loadRecords()
  const i = list.findIndex(r => score > r.score)
  if (i >= 0) return i
  return list.length < MAX ? list.length : -1
}

export function saveRecord(entry: RecordEntry): RecordEntry[] {
  const list = [...loadRecords(), entry].sort((a, b) => b.score - a.score).slice(0, MAX)
  memory = list
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* depolama yok */ }
  return list
}

export const MEDALS = ['🥇', '🥈', '🥉'] as const
