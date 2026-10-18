// Kalıcı hasar, kredi senaryoları ve "kadına şiddete hayır" kontrolü: node tests/new-shots.cjs
// Önizleme sunucusu açık olmalı. Çıktı: tests/out/yeni-*.png
const { chromium } = require(process.env.HOME + '/.cache/mh-shot/node_modules/playwright')
const path = require('path')
const URL = process.env.URL || 'http://127.0.0.1:4173/'
const OUT = path.join(__dirname, 'out'), FIX = path.join(__dirname, 'fixtures')
const sleep = ms => new Promise(r => setTimeout(r, ms))
let fails = 0
const ok = (c, m) => { console.log(c ? 'OK  ' : 'HATA', m); if (!c) fails++ }

async function start(b, body) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
  const errors = []
  p.on('pageerror', e => errors.push(String(e)))
  await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(1000)
  await p.getByRole('button', { name: 'Oyuna Başla' }).click(); await sleep(300)
  await p.locator('input[type=file]').first().setInputFiles(path.join(FIX, 'portrait.jpg'))
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).waitFor({ timeout: 60000 })
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).click()
  await p.getByRole('button', { name: /^Başla!/ }).waitFor({ timeout: 30000 })
  await p.getByRole('button', { name: body, exact: true }).click(); await sleep(2000)
  await p.getByRole('button', { name: /Boks Ringi/ }).click(); await sleep(300)
  await p.getByRole('button', { name: /^Başla!/ }).click(); await sleep(1500)
  return { p, errors }
}
const score = async p => Number((await p.locator('.chip.score .v').textContent()).replace(/\D/g, '') || 0)
const tool = (p, name) => p.getByRole('button', { name: new RegExp(name) }).first().click()

;(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  // 1) erkek: hasar birikir, kredi senaryoları
  {
    const { p, errors } = await start(b, 'Erkek')
    const canvas = p.locator('canvas').first(), box = await canvas.boundingBox()
    const sc = Math.min(box.width / 800, box.height / 1000), offY = box.height - 1000 * sc
    const head = { x: box.x + 400 * sc, y: box.y + offY + 430 * sc }
    const clip = { x: Math.max(0, head.x - 130), y: head.y - 140, width: 260, height: 290 }
    await p.screenshot({ path: path.join(OUT, 'yeni-0-temiz.png'), clip })
    for (const [name, n, wait] of [['Tokat', 6, 450], ['Boks Eldiveni', 5, 620], ['Sünger Sopa', 4, 480], ['Elektrik', 1, 1500], ['Tokat', 4, 450]]) {
      for (let i = 0; i < n; i++) { await tool(p, name); await sleep(wait) }
    }
    await sleep(5200)   // geçici izler (el izi çıkartması, pasta) kaybolsun; kalıcılar kalmalı
    await p.screenshot({ path: path.join(OUT, 'yeni-1-hasar.png'), clip })
    for (let i = 0; i < 5; i++) {
      await tool(p, 'Kredi Çek'); await sleep(1300)
      await p.screenshot({ path: path.join(OUT, `yeni-2-kredi-${i + 1}.png`) })
      await sleep(1000)
    }
    ok(!errors.length, 'erkek: sayfa hatası yok' + (errors.length ? ' — ' + errors.join(' | ') : ''))
    await p.context().close()
  }
  // 2) kadın: sert araç engellenir, hafif araç çalışır
  {
    const { p, errors } = await start(b, 'Kadın')
    const s0 = await score(p)
    await tool(p, 'Tokat'); await sleep(400)
    await p.screenshot({ path: path.join(OUT, 'yeni-3-kadina-siddete-hayir.png') })
    await sleep(600)
    const s1 = await score(p)
    ok(s1 === s0, `kadın: tokat puan vermedi (${s0} → ${s1})`)
    await tool(p, 'Boks Eldiveni'); await sleep(900)
    ok(await score(p) === s1, 'kadın: yumruk puan vermedi')
    await tool(p, 'Kremalı Pasta'); await sleep(900)
    const s2 = await score(p)
    ok(s2 > s1, `kadın: pasta çalışıyor (${s1} → ${s2})`)
    await tool(p, 'Gıdıklama'); await sleep(700)
    await p.screenshot({ path: path.join(OUT, 'yeni-4-kadin-gidik.png') })
    ok(await score(p) > s2, 'kadın: gıdıklama çalışıyor')
    ok(!errors.length, 'kadın: sayfa hatası yok' + (errors.length ? ' — ' + errors.join(' | ') : ''))
  }
  await b.close()
  console.log(fails ? `\n${fails} kontrol başarısız` : '\nTüm kontroller geçti')
  process.exit(fails ? 1 : 0)
})()
