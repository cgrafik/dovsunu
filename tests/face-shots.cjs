// Yüz ifadelerinin yakın çekimi (gerçekçi yüz / ağ bükme kontrolü): node tests/face-shots.cjs
// Önizleme sunucusu açık olmalı (npx vite preview --host 127.0.0.1 --port 4173). Çıktı: tests/out/yuz-*.png
const { chromium } = require(process.env.HOME + '/.cache/mh-shot/node_modules/playwright')
const path = require('path'), fs = require('fs')
const URL = process.env.URL || 'http://127.0.0.1:4173/'
const FIX = path.join(__dirname, 'fixtures'), OUT = path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', e => errors.push(String(e)))
  p.on('console', m => { if (m.type() === 'error' && !/^(INFO:|W\d{4}|I\d{4})|TensorFlow Lite|gl_context|landmark_projection/.test(m.text())) errors.push(m.text()) })
  await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(1500)
  await p.getByRole('button', { name: 'Oyuna Başla' }).click(); await sleep(400)
  await p.locator('input[type=file]').first().setInputFiles(path.join(FIX, process.env.FACE || 'portrait.jpg'))
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).waitFor({ timeout: 60000 })
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).click()
  await p.getByRole('button', { name: /^Başla!/ }).waitFor({ timeout: 30000 }); await sleep(800)
  await p.getByRole('button', { name: /Boks Ringi/ }).click(); await sleep(300)
  await p.getByRole('button', { name: /^Başla!/ }).click(); await sleep(1800)
  const canvas = p.locator('canvas').first()
  const box = await canvas.boundingBox()
  // kafa: dünya (400, ~437) civarı; canvas alta yaslı 800×1000 dünya
  const sc = Math.min(box.width / 800, box.height / 1000), offY = box.height - 1000 * sc
  const head = { x: box.x + 400 * sc, y: box.y + offY + 430 * sc }
  const clip = { x: Math.max(0, head.x - 130), y: head.y - 140, width: 260, height: 290 }
  // 'tam-' ile başlayan adlar tüm ekranı çeker (uçuşan paralar, yıldırım)
  const shot = n => p.screenshot({ path: path.join(OUT, `yuz-${n}.png`), clip: n.startsWith('tam-') ? undefined : clip })
  await shot('0-normal')
  const tool = async (name, waits) => {
    await p.getByRole('button', { name: new RegExp(name) }).first().click()
    let t = 0
    for (const [ms, n] of waits) { await sleep(ms - t); t = ms; await shot(n) }
    await sleep(1600)
  }
  await tool('Tokat', [[80, '0b-irkilme'], [190, '1-tokat-an'], [420, '2-tokat-sonra'], [800, '3-saskin']])
  await tool('Tavuk', [[300, '4-tavuk'], [700, '5-tavuk2']])
  await tool('Gıdıkla', [[500, '6-gidik'], [900, '7-gidik2']])
  await tool('Boks Eldiveni', [[200, '8-yumruk'], [500, '9-yumruk2']])
  await tool('Kremalı Pasta', [[600, '10-pasta']])
  await tool('Elektrik', [[350, '11-elektrik'], [700, 'tam-12-elektrik2'], [1500, '13-is-duman']])
  await tool('Kredi Çek', [[420, '14-kredi-damga'], [900, 'tam-15-paralar'], [1500, 'tam-16-yanan-paralar']])
  console.log(errors.length ? 'HATALAR:\n' + errors.join('\n') : 'konsol hatası yok')
  await b.close()
})()
