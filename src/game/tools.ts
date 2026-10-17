// Etkileşim araçları: ad, simge, tuş, puan, bekleme süresi
import type { ToolId } from './types'

export interface ToolDef {
  id: ToolId
  label: string
  short: string
  emoji: string
  key: string
  points: number
  /** Aynı aracı tekrar kullanmak için en az bekleme (ms) — art arda basınca animasyon üst üste binmesin */
  cooldown: number
  /** Nereye nişan alır: kafa ya da gövde */
  target: 'head' | 'body'
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'sponge', label: 'Sünger Sopa', short: 'Sopa', emoji: '🏏', key: '1', points: 10, cooldown: 380, target: 'head' },
  { id: 'pie', label: 'Kremalı Pasta', short: 'Pasta', emoji: '🥧', key: '2', points: 15, cooldown: 650, target: 'head' },
  { id: 'water', label: 'Su Tabancası', short: 'Su', emoji: '💦', key: '3', points: 12, cooldown: 600, target: 'head' },
  { id: 'tickle', label: 'Gıdıklama Tüyü', short: 'Gıdıkla', emoji: '🪶', key: '4', points: 8, cooldown: 420, target: 'body' },
  { id: 'face', label: 'Komik Surat', short: 'Surat', emoji: '🤪', key: '5', points: 6, cooldown: 500, target: 'head' },
  { id: 'dizzy', label: 'Lastik Tavuk', short: 'Sersemlet', emoji: '🐔', key: '6', points: 14, cooldown: 900, target: 'head' },
  { id: 'cheer', label: 'Tezahürat', short: 'Tezahürat', emoji: '📣', key: '7', points: 5, cooldown: 1100, target: 'body' },
] as const

export const toolById = (id: ToolId) => TOOLS.find(t => t.id === id)!
