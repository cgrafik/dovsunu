// Fotoğraftan kafa kesimi kontrolü: tek yüz + iki yüzlü fotoğrafın iki yüzü, "Saçıyla kes" açık/kapalı
// Önizleme sunucusu açık olmalı. Çıktı: tests/out/kesim-*.png
const { chromium } = require(process.env.HOME + '/.cache/mh-shot/node_modules/playwright')
const path = require('path')
const URL = process.env.URL || 'http://127.0.0.1:4173/'
const OUT = path.join(__dirname, 'out'), FIX = path.join(__dirname, 'fixtures')
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const errors = []
  for (const [file, pick] of [['portrait.jpg', -1], ['two-faces.jpg', 0], ['two-faces.jpg', 1]]) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
    p.on('pageerror', e => errors.push(String(e)))
    await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(800)
    await p.getByRole('button', { name: 'Oyuna Başla' }).click(); await sleep(300)
    await p.locator('input[type=file]').first().setInputFiles(path.join(FIX, file))
    if (pick >= 0) { await p.getByText('Birden fazla yüz').waitFor({ timeout: 60000 }); await p.locator('.face-pick button').nth(pick).click() }
    await p.getByRole('button', { name: 'Karakteri Oluştur' }).waitFor({ timeout: 60000 })
    await p.getByRole('button', { name: 'Karakteri Oluştur' }).click()
    await p.getByRole('button', { name: /^Başla!/ }).waitFor({ timeout: 30000 }); await sleep(1800)
    const stage = p.locator('.preview-stage'), tag = `${file.replace('.jpg', '')}-${pick < 0 ? 0 : pick}`
    await stage.screenshot({ path: path.join(OUT, `kesim-${tag}-sacli.png`) })
    const toggle = p.getByLabel('Saçıyla kes', { exact: false })
    if (await toggle.count()) { await toggle.uncheck(); await sleep(1200); await stage.screenshot({ path: path.join(OUT, `kesim-${tag}-oval.png`) }) }
    await p.context().close()
  }
  console.log(errors.length ? 'HATALAR:\n' + errors.join('\n') : 'sayfa hatası yok')
  await b.close()
})()
