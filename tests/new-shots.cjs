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
    const sc = (box.height > box.width * 1.05 ? Math.min(box.height / 1000, box.width / (800 * 0.74)) : Math.min(box.width / 800, box.height / 1000)), offY = box.height - 1000 * sc
    const head = { x: box.x + box.width / 2, y: box.y + offY + 430 * sc }
    const clip = { x: Math.max(0, head.x - 270 * sc), y: Math.max(0, head.y - 290 * sc), width: Math.min(box.width, 540 * sc), height: 600 * sc }
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
    // şiddetsiz şakalar
    for (const [name, file, wait] of [['Örümcek Şakası', 'sakalar-orumcek', 800], ['Konfeti Topu', 'sakalar-konfeti', 500], ['Un Torbası', 'sakalar-un', 700], ['Ağzını Bantla', 'bant', 1500]]) {
      await tool(p, name); await sleep(wait)
      await p.screenshot({ path: path.join(OUT, `yeni-5-${file}.png`) })
      await sleep(1500)
    }
    // kilitli araç: puan vermez, uyarı çıkar
    const sl = await score(p)
    await tool(p, 'Yastık'); await sleep(500)
    ok(await score(p) === sl, 'kilitli yastık puan vermedi')
    await p.screenshot({ path: path.join(OUT, 'yeni-6-kilitli.png') })
    // turu bitir: sonuç ekranı (rekor, ilerleme, meydan okuma)
    await p.getByRole('button', { name: /Bitir/ }).click()
    await p.getByRole('button', { name: /Meydan Oku/ }).waitFor({ timeout: 15000 })
    ok(await p.getByText('Yeni rekor!').count() > 0, 'sonuç: yeni rekor formu çıktı')
    await p.getByLabel('Rekor için adın').fill('Test')
    await p.getByRole('button', { name: 'Kaydet' }).click(); await sleep(300)
    ok(await p.locator('.record-list li').count() >= 1, 'sonuç: rekor tabloya yazıldı')
    await p.screenshot({ path: path.join(OUT, 'yeni-7-sonuc.png'), fullPage: true })
    ok(!errors.length, 'erkek: sayfa hatası yok' + (errors.length ? ' — ' + errors.join(' | ') : ''))
    await p.context().close()
  }
  // 1b) meydan okuma linki
  {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })).newPage()
    await p.goto(URL + '?hedef=1234', { waitUntil: 'networkidle' }); await sleep(800)
    ok(await p.getByText('Arkadaşın').count() > 0, 'meydan okuma: açılışta hedef görünüyor')
    await p.screenshot({ path: path.join(OUT, 'yeni-8-hedef.png') })
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
    ok(await p.getByRole('button', { name: /^Boks Eldiveni/ }).count() === 0, 'kadın: uyarıdan sonra sert araçlar kalktı')
    ok(await p.getByRole('button', { name: /^Kremalı Pasta/ }).count() === 1, 'kadın: hafif araçlar duruyor')
    { const c = p.locator('canvas').first(), bb = await c.boundingBox(), k = bb.height > bb.width * 1.05 ? Math.min(bb.height / 1000, bb.width / (800 * 0.74)) : Math.min(bb.width / 800, bb.height / 1000)
      await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height - 1000 * k + 440 * k) }
    await sleep(900)
    ok(await score(p) > s1, 'kadın: karaktere dokunuş hafif araçla puan verdi')
    await p.screenshot({ path: path.join(OUT, 'yeni-9-kadin-araclar.png') })
    await tool(p, 'Kremalı Pasta'); await sleep(900)
    const s2 = await score(p)
    ok(s2 > s1, `kadın: pasta çalışıyor`)
    await tool(p, 'Gıdıklama'); await sleep(700)
    await p.screenshot({ path: path.join(OUT, 'yeni-4-kadin-gidik.png') })
    await sleep(1200); await tool(p, 'Kuaför Şakası'); await sleep(1700)
    await p.screenshot({ path: path.join(OUT, 'yeni-10-kadin-kuafor.png') })
    ok(await score(p) > s2, 'kadın: gıdıklama çalışıyor')
    ok(!errors.length, 'kadın: sayfa hatası yok' + (errors.length ? ' — ' + errors.join(' | ') : ''))
  }
  await b.close()
  console.log(fails ? `\n${fails} kontrol başarısız` : '\nTüm kontroller geçti')
  process.exit(fails ? 1 : 0)
})()
