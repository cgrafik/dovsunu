// Ortamlar — oyuncu seçer. Her ortam: arka plan, öndeki eşya (karakterin alt gövdesini örter), kıyafet, şapka,
// karakterin ara sıra söylediği laflar ve tur sonu afişi. Çizimler programatik (görsel dosyası yok).
// Dünya 800×1000; telefonda üstte, geniş ekranda yanlarda boşluk kalabildiği için arka planlar geniş çizilir.
import { seeded, shade } from './math'
import type { SceneId } from './types'

export type Outfit = 'suit' | 'tank' | 'chef' | 'sweater' | 'hawaii' | 'pajama'
export type Hat = 'none' | 'headband' | 'toque' | 'propeller' | 'sunglasses' | 'nightcap'

export interface SceneDef {
  id: SceneId
  label: string
  emoji: string
  blurb: string
  outfit: Outfit
  hat: Hat
  /** Karakterin elinde boks eldiveni */
  gloves: boolean
  /** Varsayılan kıyafet rengi */
  color: string
  /** Canvas'ın dünya dışında kalan kısmı için zemin rengi */
  base: string
  /** Karakterin ara sıra söylediği laflar */
  lines: readonly string[]
  /** Tur sonu afişi */
  finish: string
  /** Ortamdaki tabelaya yazılan metin */
  sign: (name: string) => string
}

export const OUTFIT_COLORS: readonly { id: string; label: string; hex: string }[] = [
  { id: 'lacivert', label: 'Lacivert', hex: '#2B3A67' },
  { id: 'kirmizi', label: 'Kırmızı', hex: '#D7263D' },
  { id: 'yesil', label: 'Yeşil', hex: '#1F8A4C' },
  { id: 'turuncu', label: 'Turuncu', hex: '#F28C38' },
  { id: 'mavi', label: 'Mavi', hex: '#3D7DCA' },
  { id: 'mor', label: 'Mor', hex: '#7A4CC2' },
  { id: 'sari', label: 'Sarı', hex: '#E8B417' },
]

export const SCENES: readonly SceneDef[] = [
  {
    id: 'office', label: 'Ofis', emoji: '🏢', blurb: 'Patron masasında', outfit: 'suit', hat: 'none', gloves: false,
    color: '#2B3A67', base: '#CBD8E4', finish: 'Mesai bitti!',
    lines: ['Raporu yarın veririm!', 'Toplantıdayım!', 'Zam yok!', 'Mesai uzadı!', 'İzin günümdü!'],
    sign: n => (n ? `MÜDÜR ${n}` : 'GENEL MÜDÜR'),
  },
  {
    id: 'ring', label: 'Boks Ringi', emoji: '🥊', blurb: 'Işıklar, kalabalık', outfit: 'tank', hat: 'headband', gloves: true,
    color: '#3D7DCA', base: '#120E24', finish: 'GONG! Nakavt!',
    lines: ['Hakem, faul!', 'Gong nerede?!', 'Daha ısınmadım!', 'Kemer benim!', 'Köşeme dönüyorum!'],
    sign: n => n || 'ŞAMPİYON',
  },
  {
    id: 'kitchen', label: 'Mutfak', emoji: '🍳', blurb: 'Ocakta çorba var', outfit: 'chef', hat: 'toque', gloves: false,
    color: '#D7263D', base: '#F4F0E8', finish: 'Servis kapandı!',
    lines: ['Çorba taşıyor!', 'Tuzu fazla mı?', 'Servis bekliyor!', 'Şef benim!', 'Ocak açık kaldı!'],
    sign: n => (n ? `ŞEF ${n}` : 'BAŞ AŞÇI'),
  },
  {
    id: 'school', label: 'Sınıf', emoji: '🏫', blurb: 'Kara tahta önünde', outfit: 'sweater', hat: 'propeller', gloves: false,
    color: '#1F8A4C', base: '#F2E6CC', finish: 'Teneffüs zili!',
    lines: ['Ödevi köpek yedi!', 'Öğretmenim!', 'Teneffüs ne zaman?', 'Ben yapmadım!', 'Kopya değil!'],
    sign: n => n || 'ÖĞRENCİ',
  },
  {
    id: 'beach', label: 'Plaj', emoji: '🏖️', blurb: 'Güneş, kum, deniz', outfit: 'hawaii', hat: 'sunglasses', gloves: false,
    color: '#F28C38', base: '#5BB8EE', finish: 'Güneş battı!',
    lines: ['Kremim nerede?', 'Deniz soğuk!', 'Şezlong benim!', 'Kumdan kaleyi yıktın!', 'Tatildeyim!'],
    sign: n => n || 'TATİLCİ',
  },
  {
    id: 'home', label: 'Ev', emoji: '🛋️', blurb: 'Kanepe ve çay', outfit: 'pajama', hat: 'nightcap', gloves: false,
    color: '#3D7DCA', base: '#EBDCC6', finish: 'Çay demlendi!',
    lines: ['Çay demlendi mi?', 'Kumanda nerede?', 'Terliğimi gördün mü?', 'Dizim kaçıyor!', 'Misafir gelecek!'],
    sign: n => n || 'EVİN DİREĞİ',
  },
]

export const sceneById = (id: SceneId): SceneDef => SCENES.find(s => s.id === id) ?? SCENES[0]

export interface SceneState {
  t: number
  /** 0..1: vuruşlar ve kombolarla artar, sahne süsleri (kalabalık, saat, çerçeve) buna tepki verir */
  excite: number
  name: string
  color: string
}

const DISPLAY = '"Bungee", system-ui, sans-serif'
const BODY = '"Nunito Variable", "Nunito", system-ui, sans-serif'
const INK = '#1B1F3B'
// Geniş çizim alanı (dünya koordinatı)
const L = -900, R = 1700, TOP = -1100, W = R - L

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) => {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
}
const label = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, maxW: number) => {
  ctx.font = `400 ${size}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = color; ctx.fillText(text, x, y, maxW)
}

/** Karakterin arkasında kalan her şey */
export function drawSceneBack(ctx: CanvasRenderingContext2D, id: SceneId, s: SceneState) {
  ctx.save()
  switch (id) {
    case 'office': officeBack(ctx, s); break
    case 'ring': ringBack(ctx, s); break
    case 'kitchen': kitchenBack(ctx, s); break
    case 'school': schoolBack(ctx, s); break
    case 'beach': beachBack(ctx, s); break
    case 'home': homeBack(ctx, s); break
  }
  ctx.restore()
}

/** Karakterin önündeki eşya (masa, ring ipleri, tezgâh…) — tabela burada */
export function drawSceneFront(ctx: CanvasRenderingContext2D, id: SceneId, s: SceneState) {
  ctx.save()
  const sign = sceneById(id).sign(s.name.toLocaleUpperCase('tr'))
  switch (id) {
    case 'office': officeFront(ctx, s, sign); break
    case 'ring': ringFront(ctx, s, sign); break
    case 'kitchen': kitchenFront(ctx, s, sign); break
    case 'school': schoolFront(ctx, s, sign); break
    case 'beach': beachFront(ctx, s, sign); break
    case 'home': homeFront(ctx, s, sign); break
  }
  ctx.restore()
}

// ── Ofis ───────────────────────────────────────────────────────────────────────
function officeBack(ctx: CanvasRenderingContext2D, s: SceneState) {
  ctx.fillStyle = '#CBD8E4'; ctx.fillRect(L, TOP, W, 2200)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; for (let x = L; x < R; x += 160) ctx.fillRect(x, TOP, 6, 2200)
  // pencere + şehir manzarası
  rr(ctx, 26, 106, 308, 388, 10, '#F4F7FA')
  ctx.save(); ctx.beginPath(); ctx.rect(42, 122, 276, 356); ctx.clip()
  const sky = ctx.createLinearGradient(0, 122, 0, 478); sky.addColorStop(0, '#8FCBF2'); sky.addColorStop(1, '#E2F3FC')
  ctx.fillStyle = sky; ctx.fillRect(42, 122, 276, 356)
  const r = seeded(7)
  for (let x = 38; x < 320;) {
    const w = 34 + r() * 40, h = 90 + r() * 210
    ctx.fillStyle = r() < 0.5 ? '#7FA3C2' : '#6B8FB0'; ctx.fillRect(x, 478 - h, w - 5, h)
    ctx.fillStyle = 'rgba(255,255,230,0.75)'
    for (let wy = 478 - h + 12; wy < 470; wy += 22) for (let wx = x + 7; wx < x + w - 12; wx += 14) if (r() < 0.55) ctx.fillRect(wx, wy, 6, 9)
    x += w
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; for (let y = 126; y < 210; y += 13) ctx.fillRect(42, y, 276, 5)   // panjur
  ctx.restore()
  ctx.fillStyle = '#F4F7FA'; ctx.fillRect(176, 122, 8, 356); ctx.fillRect(42, 296, 276, 8)
  // duvar saati: kombo arttıkça akrep-yelkovan çılgınca döner
  const cx = 645, cy = 150
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 7
  ctx.beginPath(); ctx.arc(cx, cy, 56, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.lineWidth = 4; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44); ctx.lineTo(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50); ctx.stroke() }
  const mA = s.t * (0.5 + s.excite * 14), hA = mA / 12
  ctx.lineCap = 'round'
  ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(hA) * 26, cy - Math.cos(hA) * 26); ctx.stroke()
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(mA) * 40, cy - Math.cos(mA) * 40); ctx.stroke()
  // "VERİM" afişi: grafik aşağı iniyor
  rr(ctx, 545, 252, 190, 200, 8, '#FFFFFF')
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(545, 252, 190, 200)
  label(ctx, 'VERİM', 640, 282, 26, INK, 170)
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(568, 310); ctx.lineTo(568, 430); ctx.lineTo(715, 430); ctx.stroke()
  ctx.strokeStyle = '#E5323B'; ctx.lineWidth = 6; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(575, 325); ctx.lineTo(610, 350); ctx.lineTo(635, 338); ctx.lineTo(668, 392); ctx.lineTo(708, 418); ctx.stroke()
  // saksı bitkisi (pencerenin altında)
  ctx.fillStyle = '#2E8B57'
  for (let i = 0; i < 7; i++) { ctx.save(); ctx.translate(110, 700); ctx.rotate(-0.9 + i * 0.3 + Math.sin(s.t * 1.3 + i) * 0.03); ctx.beginPath(); ctx.ellipse(0, -90, 22, 92, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore() }
  rr(ctx, 64, 700, 92, 140, 12, '#C9643B')
}

function officeFront(ctx: CanvasRenderingContext2D, s: SceneState, sign: string) {
  ctx.fillStyle = '#7A5230'; ctx.fillRect(L, 866, W, 220)
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = L + 100; x < R; x += 260) ctx.fillRect(x, 880, 6, 140)
  ctx.fillStyle = '#A0703F'; ctx.fillRect(L, 836, W, 30)
  ctx.fillStyle = '#B98A57'; ctx.fillRect(L, 836, W, 6)
  // kahve kupası + buhar
  rr(ctx, 104, 784, 56, 52, 10, '#FFFFFF')
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(160, 808, 14, -Math.PI / 2, Math.PI / 2); ctx.stroke()
  ctx.fillStyle = '#E5323B'; ctx.font = `400 20px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♥', 132, 810)
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    for (let y = 0; y < 50; y += 5) { const x = 122 + i * 18 + Math.sin(s.t * 3 + y * 0.15 + i) * 5; if (y === 0) ctx.moveTo(x, 776 - y); else ctx.lineTo(x, 776 - y) }
    ctx.stroke()
  }
  // evrak yığını
  for (let i = 0; i < 5; i++) rr(ctx, 196 + (i % 2) * 6, 828 - i * 7, 100, 8, 2, i % 2 ? '#FFFFFF' : '#EEF1F4')
  // monitör (arkası bize dönük)
  rr(ctx, 600, 700, 170, 112, 12, '#2C3148')
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(685, 756, 16, 0, Math.PI * 2); ctx.fill()
  rr(ctx, 677, 810, 16, 26, 3, '#2C3148')
  ctx.fillStyle = '#2C3148'; ctx.beginPath(); ctx.ellipse(685, 836, 46, 7, 0, 0, Math.PI * 2); ctx.fill()
  // isimlik
  ctx.fillStyle = '#4E3420'; ctx.beginPath(); ctx.moveTo(280, 836); ctx.lineTo(296, 794); ctx.lineTo(504, 794); ctx.lineTo(520, 836); ctx.fill()
  rr(ctx, 304, 799, 192, 30, 4, '#E8C25A')
  label(ctx, sign, 400, 815, 17, '#4A3510', 180)
}

// ── Boks ringi ─────────────────────────────────────────────────────────────────
const CROWD = ['#2A2347', '#33295A', '#3D3166', '#2B2F55', '#3A2A4E']
function ringBack(ctx: CanvasRenderingContext2D, s: SceneState) {
  ctx.fillStyle = '#120E24'; ctx.fillRect(L, TOP, W, 2200)
  const spot = ctx.createRadialGradient(400, -200, 20, 400, 300, 760)
  spot.addColorStop(0, 'rgba(255,240,200,0.32)'); spot.addColorStop(1, 'rgba(255,240,200,0)')
  ctx.fillStyle = spot; ctx.fillRect(L, TOP, W, 2200)
  // ışık iskelesi
  ctx.fillStyle = '#2A2540'; ctx.fillRect(L, 0, W, 16)
  for (let x = -40; x < 900; x += 120) { ctx.fillStyle = '#FFF3C4'; ctx.beginPath(); ctx.arc(x, 24, 10, 0, Math.PI * 2); ctx.fill() }
  // kalabalık: vuruşlarla coşar, flaşlar patlar
  const r = seeded(11), ex = s.excite
  for (let ri = 0; ri < 5; ri++) {
    const y0 = 420 + ri * 70, rad = 18 + ri * 2
    for (let x = L + (ri % 2) * 30; x < R; x += 56 + r() * 14) {
      const color = CROWD[Math.floor(r() * CROWD.length)], phase = r() * 6, flashy = r() < 0.1
      const jump = Math.max(0, Math.sin(s.t * (4 + ex * 6) + phase)) * (2 + ex * 18)
      const y = y0 - jump
      ctx.fillStyle = color
      ctx.beginPath(); ctx.roundRect(x - rad * 1.15, y + rad * 0.7, rad * 2.3, rad * 2.4, rad * 0.8); ctx.fill()
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill()
      if (flashy && ((s.t * 1.7 + phase) % 4) < 0.05 + ex * 0.3) {
        const g = ctx.createRadialGradient(x, y + rad, 2, x, y + rad, 40)
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g; ctx.fillRect(x - 40, y + rad - 40, 80, 80)
      }
    }
  }
  // ring zemini
  ctx.fillStyle = '#E6DFCF'; ctx.fillRect(L, 760, W, 400)
  const sh = ctx.createLinearGradient(0, 760, 0, 820); sh.addColorStop(0, 'rgba(0,0,0,0.25)'); sh.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sh; ctx.fillRect(L, 760, W, 60)
}

function ringFront(ctx: CanvasRenderingContext2D, s: SceneState, sign: string) {
  for (const [x, pad] of [[30, '#D7263D'], [770, '#2E6FD8']] as const) {
    rr(ctx, x - 14, 720, 28, 300, 6, '#C9CED6')
    rr(ctx, x - 22, 716, 44, 230, 12, pad)
  }
  const ropes = [['#E5323B', 772], ['#F4F1E8', 832], ['#2E6FD8', 892]] as const
  for (const [i, [color, y]] of ropes.entries()) {
    const sag = 16 + Math.sin(s.t * 5 + i) * s.excite * 10
    for (const [c, dy, lw] of [['rgba(0,0,0,0.3)', 6, 12], [color, 0, 12]] as const) {
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(L, y + dy); ctx.lineTo(30, y + dy); ctx.quadraticCurveTo(400, y + dy + sag, 770, y + dy); ctx.lineTo(R, y + dy); ctx.stroke()
    }
  }
  ctx.fillStyle = '#1B2A6B'; ctx.fillRect(L, 932, W, 120)
  ctx.fillStyle = '#FFC93C'; ctx.fillRect(L, 932, W, 6)
  label(ctx, sign, 400, 968, 34, '#FFC93C', 520)
}

// ── Mutfak ─────────────────────────────────────────────────────────────────────
function kitchenBack(ctx: CanvasRenderingContext2D, s: SceneState) {
  ctx.fillStyle = '#F4F0E8'; ctx.fillRect(L, TOP, W, 2200)
  ctx.strokeStyle = '#DED6C8'; ctx.lineWidth = 3; ctx.beginPath()
  for (let y = TOP, row = 0; y < 1000; y += 44, row++) {
    ctx.moveTo(L, y); ctx.lineTo(R, y)
    for (let x = L + (row % 2) * 44; x < R; x += 88) { ctx.moveTo(x, y); ctx.lineTo(x, y + 44) }
  }
  ctx.stroke()
  // asılı mutfak gereçleri: vuruşlarla sallanır
  rr(ctx, 30, 112, 320, 12, 6, '#9AA4AF')
  const tools = ['spatula', 'ladle', 'whisk', 'pan'] as const
  for (const [i, kind] of tools.entries()) {
    const x = 78 + i * 76
    ctx.save(); ctx.translate(x, 122); ctx.rotate(Math.sin(s.t * 1.7 + i) * 0.05 + Math.sin(s.t * 12 + i) * s.excite * 0.3)
    ctx.strokeStyle = '#6C7580'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 8, 8, 0, Math.PI * 2); ctx.stroke()
    if (kind === 'pan') {
      rr(ctx, -6, 14, 12, 90, 5, '#3B3B3B')
      ctx.fillStyle = '#3B3B3B'; ctx.beginPath(); ctx.arc(0, 150, 50, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 150, 38, 0, Math.PI * 2); ctx.fill()
    } else {
      rr(ctx, -6, 14, 12, 120, 5, kind === 'spatula' ? '#A0703F' : '#B7C0CA')
      ctx.fillStyle = '#B7C0CA'; ctx.strokeStyle = '#8F99A5'; ctx.lineWidth = 4
      if (kind === 'spatula') { ctx.fillStyle = '#E5323B'; ctx.beginPath(); ctx.roundRect(-22, 130, 44, 64, 10); ctx.fill() }
      if (kind === 'ladle') { ctx.beginPath(); ctx.arc(0, 150, 26, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke() }
      if (kind === 'whisk') for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(0, 170, 6 + Math.abs(k) * 7, 40, 0, 0, Math.PI * 2); ctx.stroke() }
    }
    ctx.restore()
  }
  // günün menüsü
  rr(ctx, 494, 74, 272, 200, 10, '#8B5A2B')
  rr(ctx, 506, 86, 248, 176, 6, '#2F3A35')
  label(ctx, 'GÜNÜN MENÜSÜ', 630, 116, 20, '#F4F1E8', 230)
  ctx.font = `700 24px ${BODY}`; ctx.fillStyle = 'rgba(240,238,228,0.9)'; ctx.textAlign = 'left'
  for (const [i, t] of ['• Mercimek', '• Kuru fasulye', '• Sütlaç'].entries()) ctx.fillText(t, 528, 160 + i * 34)
  // raf + tencereler
  rr(ctx, 470, 340, 320, 14, 4, '#A0703F')
  rr(ctx, 490, 272, 96, 68, 12, '#C8743C'); rr(ctx, 480, 266, 116, 12, 6, '#A85F2E')
  rr(ctx, 612, 288, 74, 52, 10, '#B7C0CA'); rr(ctx, 606, 282, 86, 10, 5, '#8F99A5')
  rr(ctx, 708, 262, 44, 78, 10, 'rgba(255,255,255,0.7)'); rr(ctx, 708, 286, 44, 54, 8, '#F2C14E'); rr(ctx, 704, 254, 52, 12, 4, '#D7263D')
}

function kitchenFront(ctx: CanvasRenderingContext2D, s: SceneState, sign: string) {
  ctx.fillStyle = '#3F6B5C'; ctx.fillRect(L, 866, W, 220)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 4
  for (let x = L + 30; x < R; x += 200) { ctx.strokeRect(x, 886, 170, 160); rr(ctx, x + 70, 900, 30, 8, 4, '#C9CED6') }
  ctx.fillStyle = '#ECE9E3'; ctx.fillRect(L, 834, W, 32)
  ctx.fillStyle = '#CFCAC0'; ctx.fillRect(L, 860, W, 6)
  // kesme tahtası: domates + havuç
  rr(ctx, 70, 818, 220, 20, 8, '#C99A63')
  ctx.fillStyle = '#E5323B'; ctx.beginPath(); ctx.arc(130, 800, 20, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#2E8B57'; ctx.beginPath(); ctx.ellipse(130, 781, 9, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#F28C38'; ctx.beginPath(); ctx.moveTo(170, 806); ctx.lineTo(270, 812); ctx.lineTo(170, 822); ctx.fill()
  ctx.fillStyle = '#2E8B57'; ctx.beginPath(); ctx.moveTo(170, 814); ctx.lineTo(150, 800); ctx.lineTo(156, 816); ctx.lineTo(148, 826); ctx.fill()
  // tencere + buhar
  rr(ctx, 560, 750, 180, 86, 14, '#B7C0CA')
  rr(ctx, 550, 742, 200, 14, 7, '#8F99A5')
  rr(ctx, 530, 768, 30, 12, 6, '#5B6470'); rr(ctx, 740, 768, 30, 12, 6, '#5B6470')
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6; ctx.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    for (let y = 0; y < 70; y += 6) { const x = 610 + i * 40 + Math.sin(s.t * 3 + y * 0.12 + i * 2) * (6 + s.excite * 8); if (y === 0) ctx.moveTo(x, 734 - y); else ctx.lineTo(x, 734 - y) }
    ctx.stroke()
  }
  // sipariş fişi (tabela)
  ctx.save(); ctx.translate(400, 812); ctx.rotate(-0.03)
  rr(ctx, -86, -24, 172, 48, 4, '#FFFFFF')
  label(ctx, sign, 0, 1, 18, '#C62828', 160)
  ctx.restore()
}

// ── Sınıf ──────────────────────────────────────────────────────────────────────
function schoolBack(ctx: CanvasRenderingContext2D, s: SceneState) {
  ctx.fillStyle = '#F2E6CC'; ctx.fillRect(L, TOP, W, 2200)
  ctx.fillStyle = '#8DB596'; ctx.fillRect(L, 600, W, 500)
  ctx.fillStyle = '#6E9A79'; ctx.fillRect(L, 596, W, 10)
  // kara tahta
  rr(ctx, 40, 100, 720, 384, 10, '#8B5A2B')
  rr(ctx, 56, 116, 688, 352, 4, '#2E4B3C')
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(90, 140, 300, 40); ctx.fillRect(420, 380, 260, 50)   // silinmiş tebeşir izi
  const chalk = 'rgba(240,240,232,0.9)'
  ctx.textAlign = 'left'
  ctx.font = `400 40px ${DISPLAY}`; ctx.fillStyle = chalk; ctx.fillText('2 + 2 = 5', 84, 172)
  ctx.font = `800 30px ${BODY}`; ctx.fillText('Bugün: Şaplak dersi', 430, 168)
  ctx.font = `800 26px ${BODY}`; ctx.fillText('ÖDEV: sayfa 1–999', 84, 222)
  // tebeşir gülen surat
  ctx.strokeStyle = chalk; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(680, 410, 30, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(680, 414, 16, 0.2, Math.PI - 0.2); ctx.stroke()
  ctx.fillStyle = chalk; ctx.beginPath(); ctx.arc(670, 400, 4, 0, Math.PI * 2); ctx.arc(690, 400, 4, 0, Math.PI * 2); ctx.fill()
  rr(ctx, 40, 478, 720, 14, 3, '#A9743F')
  rr(ctx, 120, 470, 34, 10, 4, '#FFFFFF'); rr(ctx, 170, 472, 24, 8, 4, '#F2C14E')
  // duvar saati
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(700, 52, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  const a = s.t * (0.4 + s.excite * 10)
  ctx.lineCap = 'round'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(700, 52); ctx.lineTo(700 + Math.sin(a) * 24, 52 - Math.cos(a) * 24); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(700, 52); ctx.lineTo(700 + Math.sin(a / 12) * 15, 52 - Math.cos(a / 12) * 15); ctx.stroke()
  // kâğıt uçak süzülür
  const px = ((s.t * 150) % 1900) - 550, py = 60 + Math.sin(s.t * 1.3) * 26
  ctx.save(); ctx.translate(px, py); ctx.rotate(Math.cos(s.t * 1.3) * 0.15)
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#9AA4AF'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(-30, -16); ctx.lineTo(-18, 0); ctx.lineTo(-30, 14); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.restore()
}

function schoolFront(ctx: CanvasRenderingContext2D, _s: SceneState, sign: string) {
  ctx.fillStyle = '#5D6B7A'; ctx.fillRect(L, 858, W, 220)
  ctx.fillStyle = '#C29558'; ctx.fillRect(L, 858, W, 70)
  ctx.fillStyle = '#D2A86E'; ctx.fillRect(L, 830, W, 28)
  ctx.fillStyle = '#E2BD86'; ctx.fillRect(L, 830, W, 5)
  // kitaplar
  const books = [['#D7263D', 120], ['#2E6FD8', 106], ['#F2C14E', 116]] as const
  for (const [i, [c, w]] of books.entries()) { ctx.save(); ctx.translate(160, 818 - i * 20); ctx.rotate((i - 1) * 0.04); rr(ctx, -w / 2, -10, w, 20, 3, c); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-w / 2 + 6, -3, w - 12, 3); ctx.restore() }
  // elma
  ctx.fillStyle = '#E5323B'; ctx.beginPath(); ctx.arc(650, 806, 24, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(642, 798, 7, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#6B4A2B'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(650, 784); ctx.lineTo(654, 770); ctx.stroke()
  ctx.fillStyle = '#2E8B57'; ctx.beginPath(); ctx.ellipse(664, 772, 11, 5, -0.4, 0, Math.PI * 2); ctx.fill()
  // kurşun kalem
  ctx.save(); ctx.translate(470, 822); ctx.rotate(-0.08)
  rr(ctx, -60, -6, 100, 12, 2, '#F2C14E'); ctx.fillStyle = '#E8C9A0'; ctx.beginPath(); ctx.moveTo(40, -6); ctx.lineTo(58, 0); ctx.lineTo(40, 6); ctx.fill()
  rr(ctx, -72, -6, 14, 12, 3, '#FF8FB1'); ctx.restore()
  // isim bandı (tabela)
  ctx.save(); ctx.translate(400, 892); ctx.rotate(0.02)
  rr(ctx, -84, -20, 168, 40, 3, 'rgba(255,255,255,0.92)')
  label(ctx, sign, 0, 1, 18, INK, 156)
  ctx.restore()
}

// ── Plaj ───────────────────────────────────────────────────────────────────────
function beachBack(ctx: CanvasRenderingContext2D, s: SceneState) {
  const sky = ctx.createLinearGradient(0, -200, 0, 520); sky.addColorStop(0, '#4FAEE8'); sky.addColorStop(1, '#C6ECFC')
  ctx.fillStyle = sky; ctx.fillRect(L, TOP, W, 1640)
  // güneş
  ctx.save(); ctx.translate(650, 130); ctx.rotate(s.t * 0.3)
  ctx.strokeStyle = '#FFE58A'; ctx.lineWidth = 8; ctx.lineCap = 'round'
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 74, Math.sin(a) * 74); ctx.lineTo(Math.cos(a) * 96, Math.sin(a) * 96); ctx.stroke() }
  ctx.restore()
  ctx.fillStyle = '#FFD84D'; ctx.beginPath(); ctx.arc(650, 130, 60, 0, Math.PI * 2); ctx.fill()
  // bulutlar
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  for (let i = 0; i < 3; i++) {
    const x = ((s.t * (10 + i * 4) + i * 640) % 2000) - 600, y = 70 + i * 70
    ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.arc(x + 34, y - 12, 38, 0, Math.PI * 2); ctx.arc(x + 74, y, 28, 0, Math.PI * 2); ctx.fill()
  }
  // martı
  const gx = ((s.t * 70) % 1700) - 400, gy = 250 + Math.sin(s.t * 2) * 18, flap = Math.sin(s.t * 8) * 8
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(gx - 22, gy - flap); ctx.quadraticCurveTo(gx - 10, gy - 12, gx, gy); ctx.quadraticCurveTo(gx + 10, gy - 12, gx + 22, gy - flap); ctx.stroke()
  // deniz + dalgalar
  ctx.fillStyle = '#2F9FD6'; ctx.fillRect(L, 520, W, 190)
  ctx.fillStyle = '#2A8CC0'; ctx.fillRect(L, 520, W, 16)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4
  for (const [i, y] of [565, 612, 660].entries()) {
    ctx.beginPath()
    for (let x = L; x <= R; x += 20) { const yy = y + Math.sin(x * 0.02 + s.t * (1.5 + i * 0.4)) * 6; if (x === L) ctx.moveTo(x, yy); else ctx.lineTo(x, yy) }
    ctx.stroke()
  }
  // kum
  ctx.fillStyle = '#F3D7A0'; ctx.fillRect(L, 700, W, 400)
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 6; ctx.beginPath()
  for (let x = L; x <= R; x += 20) { const yy = 702 + Math.sin(x * 0.03 + s.t * 2) * 4; if (x === L) ctx.moveTo(x, yy); else ctx.lineTo(x, yy) }
  ctx.stroke()
  // palmiye (solda)
  ctx.strokeStyle = '#9C6B3C'; ctx.lineWidth = 34; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(40, 920); ctx.quadraticCurveTo(70, 620, 130, 380); ctx.stroke()
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 4
  for (let i = 0; i < 9; i++) { const u = i / 9, x = 40 + (130 - 40) * u + Math.sin(u * 3) * 14, y = 920 - (920 - 380) * u; ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x + 15, y - 6); ctx.stroke() }
  ctx.fillStyle = '#2E9E5B'
  for (let i = 0; i < 6; i++) {
    ctx.save(); ctx.translate(130, 380); ctx.rotate(-2.6 + i * 0.75 + Math.sin(s.t * 1.4 + i) * 0.05)
    ctx.beginPath(); ctx.ellipse(80, 0, 90, 22, 0.25, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }
}

function beachFront(ctx: CanvasRenderingContext2D, s: SceneState, sign: string) {
  ctx.fillStyle = '#EAC886'
  ctx.beginPath(); ctx.moveTo(L, 880); ctx.lineTo(80, 870); ctx.quadraticCurveTo(400, 820, 720, 870); ctx.lineTo(R, 880); ctx.lineTo(R, 1100); ctx.lineTo(L, 1100); ctx.fill()
  const r = seeded(5); ctx.fillStyle = '#D4AE68'
  for (let i = 0; i < 90; i++) { const x = L + r() * W, y = 880 + r() * 120; ctx.fillRect(x, y, 4, 4) }
  // kumdan kale + bayrak (kıyafet renginde)
  ctx.fillStyle = '#E2B96F'
  ctx.fillRect(596, 812, 140, 62); ctx.fillRect(588, 770, 44, 104); ctx.fillRect(700, 770, 44, 104); ctx.fillRect(640, 744, 52, 70)
  for (const [x, y] of [[588, 760], [700, 760], [640, 734]] as const) for (let k = 0; k < 3; k++) ctx.fillRect(x + k * 18, y, 10, 12)
  ctx.fillStyle = '#9C6B3C'; ctx.fillRect(664, 694, 4, 44)
  ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(668, 696); ctx.lineTo(668 + 34 + Math.sin(s.t * 5) * 4, 706); ctx.lineTo(668, 716); ctx.fill()
  // plaj topu: coşkuyla zıplar
  const by = 880 - Math.abs(Math.sin(s.t * 6)) * s.excite * 40
  ctx.save(); ctx.translate(130, by); ctx.rotate(s.t * 0.5)
  const seg = ['#E5323B', '#FFFFFF', '#2E6FD8', '#FFFFFF', '#F2C14E', '#FFFFFF']
  for (let i = 0; i < 6; i++) { ctx.fillStyle = seg[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 48, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2); ctx.fill() }
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
  // tahta tabela
  rr(ctx, 394, 900, 12, 120, 3, '#8B5A2B')
  ctx.save(); ctx.translate(400, 904); ctx.rotate(-0.04)
  rr(ctx, -84, -24, 168, 48, 6, '#B98A57')
  label(ctx, sign, 0, 1, 18, '#4A3510', 156)
  ctx.restore()
}

// ── Ev ─────────────────────────────────────────────────────────────────────────
function homeBack(ctx: CanvasRenderingContext2D, s: SceneState) {
  ctx.fillStyle = '#EBDCC6'; ctx.fillRect(L, TOP, W, 2200)
  ctx.fillStyle = '#E2CFB4'; for (let x = L; x < R; x += 70) ctx.fillRect(x, TOP, 34, 2200)
  ctx.fillStyle = '#9A6B47'; ctx.fillRect(L, 930, W, 200)
  // eğri tablo: vuruşlarla daha da eğrilir
  ctx.save(); ctx.translate(200, 230); ctx.rotate(0.07 + Math.sin(s.t * 9) * s.excite * 0.12)
  rr(ctx, -104, -80, 208, 160, 6, '#7A5232')
  ctx.save(); ctx.beginPath(); ctx.rect(-88, -64, 176, 128); ctx.clip()
  ctx.fillStyle = '#BFE3F2'; ctx.fillRect(-88, -64, 176, 128)
  ctx.fillStyle = '#FFD84D'; ctx.beginPath(); ctx.arc(46, -30, 18, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#7BBE6A'; ctx.beginPath(); ctx.ellipse(-30, 70, 110, 70, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#5FA352'; ctx.beginPath(); ctx.ellipse(70, 80, 90, 60, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore(); ctx.restore()
  // oval aile portresi
  ctx.save(); ctx.translate(590, 190); ctx.rotate(Math.sin(s.t * 8 + 1) * s.excite * 0.1)
  ctx.fillStyle = '#C9A24A'; ctx.beginPath(); ctx.ellipse(0, 0, 62, 78, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#F4E9D8'; ctx.beginPath(); ctx.ellipse(0, 0, 50, 66, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#8A7560'; ctx.beginPath(); ctx.arc(0, -12, 20, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(0, 40, 32, 24, 0, Math.PI, 0); ctx.fill()
  ctx.restore()
  // ayaklı lamba + sıcak ışık
  const glow = ctx.createRadialGradient(700, 290, 10, 700, 290, 260)
  glow.addColorStop(0, 'rgba(255,214,130,0.45)'); glow.addColorStop(1, 'rgba(255,214,130,0)')
  ctx.fillStyle = glow; ctx.fillRect(440, 30, 520, 520)
  ctx.strokeStyle = '#3B3B3B'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(700, 300); ctx.lineTo(700, 940); ctx.stroke()
  ctx.fillStyle = '#F2C14E'; ctx.beginPath(); ctx.moveTo(650, 300); ctx.lineTo(750, 300); ctx.lineTo(726, 220); ctx.lineTo(674, 220); ctx.fill()
}

function homeFront(ctx: CanvasRenderingContext2D, s: SceneState, sign: string) {
  // kanepe sırtı + kolçaklar
  const sofa = '#8E3B46', dark = shade(sofa, -0.25)
  rr(ctx, 20, 836, 760, 220, 40, sofa)
  for (let x = 120; x < 720; x += 140) { ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, 880, 6, 0, Math.PI * 2); ctx.fill() }
  rr(ctx, -40, 800, 130, 260, 44, dark); rr(ctx, 710, 800, 130, 260, 44, dark)
  // yastık (tabela)
  ctx.save(); ctx.translate(400, 870); ctx.rotate(-0.04 + Math.sin(s.t * 10) * s.excite * 0.04)
  rr(ctx, -100, -38, 200, 76, 22, '#FFF4E0')
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(-92, -30, 184, 60, 18); ctx.stroke()
  label(ctx, sign, 0, 2, 18, '#C62828', 170)
  ctx.restore()
  // kolçakta ince belli çay + simit
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(40, 800, 40, 9, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#D7263D'; ctx.lineWidth = 3; ctx.stroke()
  ctx.fillStyle = 'rgba(181,67,42,0.88)'
  ctx.beginPath(); ctx.moveTo(22, 742); ctx.quadraticCurveTo(26, 770, 34, 772); ctx.quadraticCurveTo(22, 786, 26, 796); ctx.lineTo(54, 796); ctx.quadraticCurveTo(58, 786, 46, 772); ctx.quadraticCurveTo(54, 770, 58, 742); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3
  ctx.beginPath(); for (let y = 0; y < 34; y += 4) { const x = 40 + Math.sin(s.t * 3 + y * 0.2) * 5; if (y === 0) ctx.moveTo(x, 736 - y); else ctx.lineTo(x, 736 - y) } ctx.stroke()
  ctx.strokeStyle = '#B9772F'; ctx.lineWidth = 16; ctx.beginPath(); ctx.ellipse(770, 790, 36, 12, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#F4E9D8'; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ctx.fillRect(770 + Math.cos(a) * 36 - 2, 790 + Math.sin(a) * 12 - 1, 4, 3) }
}
