// Gerçekçi gövde kontrolü: 6 ortam × erkek/kadın önizlemesi → tests/out/govde-<tip>-<ortam>.png
// Önizleme sunucusu açık olmalı (npx vite preview --host 127.0.0.1 --port 4173)
const { chromium } = require(process.env.HOME + '/.cache/mh-shot/node_modules/playwright')
const path = require('path')
const URL = process.env.URL || 'http://127.0.0.1:4173/'
const OUT = path.join(__dirname, 'out'), FIX = path.join(__dirname, 'fixtures')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
  await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(1200)
  await p.getByRole('button', { name: 'Oyuna Başla' }).click(); await sleep(300)
  await p.locator('input[type=file]').first().setInputFiles(path.join(FIX, process.env.FACE || 'portrait.jpg'))
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).waitFor({ timeout: 60000 })
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).click()
  await p.getByRole('button', { name: /^Başla!/ }).waitFor({ timeout: 30000 })
  const stage = p.locator('.preview-stage')
  for (const [tip, label] of [['m', 'Erkek'], ['f', 'Kadın']]) {
    await p.getByRole('button', { name: label, exact: true }).click(); await sleep(2500)
    for (const [id, name] of [['ofis', 'Ofis'], ['ring', 'Boks Ringi'], ['mutfak', 'Mutfak'], ['sinif', 'Sınıf'], ['plaj', 'Plaj'], ['ev', 'Ev']]) {
      await p.getByRole('button', { name: new RegExp('^\S*\s*' + name) }).first().click(); await sleep(1300)
      await stage.screenshot({ path: path.join(OUT, `govde-${tip}-${id}.png`) })
    }
  }
  await b.close()
})()
