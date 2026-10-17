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
  { id: 'slap', label: 'Tokat', short: 'Tokat', emoji: '🖐️', key: '1', points: 10, cooldown: 360, target: 'head' },
  { id: 'punch', label: 'Boks Eldiveni', short: 'Yumruk', emoji: '🥊', key: '2', points: 14, cooldown: 520, target: 'head' },
  { id: 'slipper', label: 'Terlik', short: 'Terlik', emoji: '🩴', key: '3', points: 12, cooldown: 600, target: 'head' },
  { id: 'sponge', label: 'Sünger Sopa', short: 'Sopa', emoji: '🏏', key: '4', points: 10, cooldown: 380, target: 'head' },
  { id: 'pie', label: 'Kremalı Pasta', short: 'Pasta', emoji: '🥧', key: '5', points: 15, cooldown: 650, target: 'head' },
  { id: 'water', label: 'Su Tabancası', short: 'Su', emoji: '💦', key: '6', points: 12, cooldown: 600, target: 'head' },
  { id: 'dizzy', label: 'Lastik Tavuk', short: 'Tavuk', emoji: '🐔', key: '7', points: 14, cooldown: 900, target: 'head' },
  { id: 'tickle', label: 'Gıdıklama Tüyü', short: 'Gıdıkla', emoji: '🪶', key: '8', points: 8, cooldown: 420, target: 'body' },
  { id: 'shock', label: 'Elektrik', short: 'Elektrik', emoji: '⚡', key: '9', points: 16, cooldown: 1300, target: 'head' },
  { id: 'loan', label: 'Kredi Çek', short: 'Kredi', emoji: '💸', key: '0', points: 18, cooldown: 1800, target: 'head' },
] as const

export const toolById = (id: ToolId) => TOOLS.find(t => t.id === id)!
