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
  /** Hafif şaka (pasta, su, gıdıklama, kredi): kadın karaktere de yapılabilir; diğerleri "kadına şiddete hayır" */
  soft?: boolean
  /** Toplam puan bu değere ulaşınca açılır (yoksa baştan açık) */
  unlockAt?: number
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'slap', label: 'Tokat', short: 'Tokat', emoji: '🖐️', key: '1', points: 10, cooldown: 360, target: 'head' },
  { id: 'punch', label: 'Boks Eldiveni', short: 'Yumruk', emoji: '🥊', key: '2', points: 14, cooldown: 520, target: 'head' },
  { id: 'slipper', label: 'Terlik', short: 'Terlik', emoji: '🩴', key: '3', points: 12, cooldown: 600, target: 'head' },
  { id: 'sponge', label: 'Sünger Sopa', short: 'Sopa', emoji: '🏏', key: '4', points: 10, cooldown: 380, target: 'head' },
  { id: 'pie', label: 'Kremalı Pasta', short: 'Pasta', emoji: '🥧', key: '5', points: 15, cooldown: 650, target: 'head', soft: true },
  { id: 'water', label: 'Su Tabancası', short: 'Su', emoji: '💦', key: '6', points: 12, cooldown: 600, target: 'head', soft: true },
  { id: 'dizzy', label: 'Lastik Tavuk', short: 'Tavuk', emoji: '🐔', key: '7', points: 14, cooldown: 900, target: 'head' },
  { id: 'tickle', label: 'Gıdıklama Tüyü', short: 'Gıdıkla', emoji: '🪶', key: '8', points: 8, cooldown: 420, target: 'body', soft: true },
  { id: 'shock', label: 'Elektrik', short: 'Elektrik', emoji: '⚡', key: '9', points: 16, cooldown: 1300, target: 'head' },
  { id: 'loan', label: 'Kredi Çek', short: 'Kredi', emoji: '💸', key: '0', points: 18, cooldown: 1800, target: 'head', soft: true },
  { id: 'spider', label: 'Örümcek Şakası', short: 'Örümcek', emoji: '🕷️', key: 'a', points: 11, cooldown: 1200, target: 'head', soft: true },
  { id: 'confetti', label: 'Konfeti Topu', short: 'Konfeti', emoji: '🎉', key: 's', points: 10, cooldown: 900, target: 'head', soft: true },
  { id: 'flour', label: 'Un Torbası', short: 'Un', emoji: '🌾', key: 'd', points: 13, cooldown: 1100, target: 'head', soft: true },
  { id: 'salon', label: 'Kuaför Şakası', short: 'Kuaför', emoji: '💇', key: 'g', points: 12, cooldown: 1600, target: 'head', soft: true },
  { id: 'tape', label: 'Ağzını Bantla', short: 'Bant', emoji: '🩹', key: 'f', points: 12, cooldown: 4500, target: 'head' },
  { id: 'pillow', label: 'Yastık', short: 'Yastık', emoji: '🛏️', key: 'q', points: 9, cooldown: 420, target: 'head', soft: true, unlockAt: 600 },
  { id: 'fish', label: 'Balık Tokadı', short: 'Balık', emoji: '🐟', key: 'w', points: 16, cooldown: 520, target: 'head', unlockAt: 1500 },
  { id: 'goldslipper', label: 'Altın Terlik', short: 'Altın', emoji: '👑', key: 'e', points: 30, cooldown: 900, target: 'head', unlockAt: 3000 },
] as const

export const toolById = (id: ToolId) => TOOLS.find(t => t.id === id)!
