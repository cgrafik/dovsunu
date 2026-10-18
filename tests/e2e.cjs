// Uçtan uca test (Playwright, yerel önizleme sunucusu): node tests/e2e.cjs [masaustu|telefon]
// Akış: açılış → fotoğraf (tek yüz) → 6 ortam → 10 araç + nakavt + ıska + ses aç/kapa → bitir → sonuç → tekrar →
//       yeni fotoğraf (iki yüz → seçim) → yeni fotoğraf (yüzsüz → elle kırpma). Konsol hataları toplanır.
const { chromium } = require(process.env.HOME + '/.cache/mh-shot/node_modules/playwright')
const path = require('path'), fs = require('fs')
const URL = process.env.URL || 'http://127.0.0.1:4173/'
const FIX = path.join(__dirname, 'fixtures'), OUT = path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let fails = 0
const ok = (c, m) => { console.log(c ? 'OK  ' : 'HATA', m); if (!c) fails++ }

;(async () => {
  const which = process.argv[2] || 'masaustu'
  const vp = which === 'telefon' ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: which === 'telefon' ? 2 : 1, isMobile: which === 'telefon', hasTouch: which === 'telefon', locale: 'tr-TR' })
  await ctx.addInitScript(() => {
    // ses ölçümü: oluşturulan osilatör / gürültü kaynağı sayısı
    window.__voices = 0
    const AC = window.AudioContext
    const o1 = AC.prototype.createOscillator, o2 = AC.prototype.createBufferSource
    AC.prototype.createOscillator = function () { window.__voices++; return o1.call(this) }
    AC.prototype.createBufferSource = function () { window.__voices++; return o2.call(this) }
  })
  const p = await ctx.newPage()
  const errors = []
  // MediaPipe kendi bilgi satırlarını ("INFO: Created TensorFlow Lite…", "W0000 …") hata kanalına yazar → sayılmaz
  const LIB_INFO = /^(INFO:|W\d{4}|I\d{4})|TensorFlow Lite|gl_context|landmark_projection/
  p.on('console', m => { if (m.type() === 'error' && !LIB_INFO.test(m.text())) errors.push(m.text()) })
  p.on('pageerror', e => errors.push(String(e)))
  const shot = n => p.screenshot({ path: path.join(OUT, `${which}-${n}.png`) })
  const voices = () => p.evaluate(() => window.__voices)
  const scoreText = async () => Number((await p.locator('.chip.score .v').textContent()).replace(/\D/g, '') || 0)
  const noOverflow = async (name) => {
    const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    ok(sw <= iw + 1, `${name}: yatay taşma yok (${sw} / ${iw})`)
  }

  // 1) açılış
  await p.goto(URL, { waitUntil: 'networkidle' }); await sleep(2500)
  ok(await p.getByRole('button', { name: 'Oyuna Başla' }).isVisible(), 'açılış: "Oyuna Başla" görünüyor')
  await shot('1-acilis'); await noOverflow('açılış')
  await p.getByRole('button', { name: 'Nasıl Oynanır?' }).click(); await sleep(400)
  ok(await p.getByRole('dialog').isVisible(), 'nasıl oynanır penceresi açıldı'); await shot('2-nasil')
  await p.keyboard.press('Escape'); await sleep(300)
  ok(await p.getByRole('dialog').count() === 0, 'Esc ile kapandı')

  // 2) fotoğraf: tek yüz
  await p.getByRole('button', { name: 'Oyuna Başla' }).click(); await sleep(500)
  await p.locator('input[type=file]').first().setInputFiles(path.join(FIX, 'portrait.jpg'))
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).waitFor({ timeout: 60000 })
  ok(await p.getByText('Yüzün bulundu').count() > 0, 'tek yüz: yüz otomatik bulundu')
  await shot('3-kirpma'); await noOverflow('kırpma')
  // kırpma etkileşimi: yakınlaştırma kaydırıcısı
  await p.locator('.crop-controls input[type=range]').first().fill('1.2')
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).click()
  await p.getByRole('button', { name: /^Başla!/ }).waitFor({ timeout: 30000 }); await sleep(1500)
  await shot('4-karakter'); await noOverflow('karakter')
  // her ortam: önizleme çizilir, ortam düğmesi seçili görünür
  await p.getByLabel('Tabeladaki ad', { exact: false }).fill('Mehmet')
  for (const [id, name] of [['ofis', 'Ofis'], ['ring', 'Boks Ringi'], ['mutfak', 'Mutfak'], ['sinif', 'Sınıf'], ['plaj', 'Plaj'], ['ev', 'Ev']]) {
    await p.getByRole('button', { name: new RegExp('^\\S*\\s*' + name) }).first().click(); await sleep(900)
    ok(await p.locator('.scene-card[aria-pressed=true] .name').textContent() === name, `ortam seçildi: ${name}`)
    await p.locator('.preview-stage canvas').click({ position: { x: 200, y: 200 } }); await sleep(450)
    await shot(`5-ortam-${id}`)
  }
  await p.getByRole('button', { name: 'Kadın' }).click(); await sleep(900); await shot('5-govde-kadin')
  await p.getByRole('button', { name: 'Erkek' }).click()
  await p.getByLabel('Çizgi film filtresi', { exact: false }).check(); await sleep(600)
  await shot('5-karakter-ozel')
  await p.getByLabel('Çizgi film filtresi', { exact: false }).uncheck()
  await p.getByRole('button', { name: /Boks Ringi/ }).click(); await sleep(400)

  // 3) oyun
  await p.getByRole('button', { name: /^Başla!/ }).click(); await sleep(1500)
  ok(await p.locator('.hint-start').isVisible(), 'oyun: başlangıç ipucu görünüyor')
  await noOverflow('oyun')
  const v0 = await voices()
  let last = 0
  const tools = ['Tokat', 'Boks Eldiveni', 'Terlik', 'Sünger Sopa', 'Kremalı Pasta', 'Su Tabancası', 'Lastik Tavuk', 'Gıdıklama Tüyü', 'Elektrik', 'Kredi Çek', 'Örümcek Şakası', 'Konfeti Topu', 'Un Torbası']
  for (const [i, t] of tools.entries()) {
    await p.getByRole('button', { name: new RegExp('^' + t) }).click()
    await sleep(300); await shot(`6-arac-${i + 1}`)
    await sleep(700)
    const s = await scoreText()
    ok(s > last, `${t}: puan arttı (${last} → ${s})`)
    last = s
  }
  ok((await voices()) > v0, `ses üretildi (${(await voices()) - v0} ses kaynağı)`)
  const combo = Number(await p.locator('.chip.combo .v').textContent())
  ok(combo >= 2, `kombo çalışıyor (kombo ${combo})`)
  // canvas'a dokunuş: karakterin kafası (merkez üstü) ve boş alan (ıska)
  const box = await p.locator('.game-stage canvas').boundingBox()
  await p.keyboard.press('1'); await sleep(450)
  const sKey = await scoreText(); ok(sKey > last, `klavye 1: tokat (${last} → ${sKey})`); last = sKey
  // kafanın ekran konumu: dünya 800×1000, genişliğe/yüksekliğe sığdırılır ve alta yaslanır; kafa ≈ dünya (400, 440)
  const sc = Math.min(box.width / 800, box.height / 1000)
  const headX = box.x + (box.width - 800 * sc) / 2 + 400 * sc, headY = box.y + (box.height - 1000 * sc) + 440 * sc
  await p.mouse.click(headX, headY); await sleep(420)
  await shot('6-nakavt')
  const sTap = await scoreText(); ok(sTap > last, `karaktere dokunuş puan verdi (${last} → ${sTap})`); last = sTap
  ok(Number(await p.locator('.chip.combo .v').textContent()) >= 10, 'kombo 10: nakavt anı')
  await p.mouse.click(box.x + 8, box.y + box.height * 0.6); await sleep(400)
  ok(Number(await p.locator('.chip.combo .v').textContent()) === 0, 'boşluğa dokunuş: ıska, kombo sıfırlandı')
  // spam: 25 hızlı tıklama — sistem bozulmamalı
  for (let i = 0; i < 25; i++) { await p.keyboard.press(String((i % 8) + 1)); await sleep(30) }
  await sleep(1500); await shot('7-spam-sonrasi')
  // ses kapat: yeni ses üretilmemeli
  await p.getByRole('button', { name: 'Sesi kapat' }).first().click(); await sleep(300)
  const vMute = await voices()
  await p.keyboard.press('2'); await sleep(900)
  ok((await voices()) === vMute, 'ses kapalıyken ses üretilmedi')
  await p.getByRole('button', { name: 'Sesi aç' }).first().click()
  const time = Number(await p.locator('.chip.time .v').textContent())
  ok(time < 60 && time > 0, `süre işliyor (${time} sn kaldı)`)

  // 4) bitir → sonuç
  const finalScore = await scoreText()
  await p.getByRole('button', { name: /Bitir/ }).click()
  await p.getByText('TOPLAM SKOR').waitFor({ timeout: 10000 }); await sleep(800)
  const shown = Number((await p.locator('.big-score').textContent()).replace(/\D/g, ''))
  ok(shown === finalScore, `sonuç skoru oyundakiyle aynı (${shown})`)
  ok(await p.locator('.results-photo img').count() === 1, 'sonuç: karakter görüntüsü var')
  await shot('8-sonuc'); await noOverflow('sonuç')

  // 5) tekrar oyna → skor sıfır
  await p.getByRole('button', { name: 'Tekrar Oyna' }).click(); await sleep(1200)
  ok((await scoreText()) === 0, 'tekrar oyna: skor sıfırlandı')
  await p.getByRole('button', { name: 'Menü' }).click(); await sleep(600)

  // 6) yeni fotoğraf: iki yüz → seçim
  await p.getByRole('button', { name: /Fotoğrafı değiştir/ }).click(); await sleep(500)
  await p.locator('input[type=file]').first().setInputFiles(path.join(FIX, 'two-faces.jpg'))
  await p.getByText('Birden fazla yüz').waitFor({ timeout: 60000 })
  const thumbs = await p.locator('.face-pick button').count()
  ok(thumbs === 2, `iki yüz: ${thumbs} yüz seçeneği`)
  await shot('9-iki-yuz')
  await p.locator('.face-pick button').nth(1).click()
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).click()
  await p.getByRole('button', { name: /^Başla!/ }).waitFor({ timeout: 30000 })
  ok(true, 'iki yüz: seçilen yüzle karakter oluştu')

  // 7) yüzsüz → elle kırpma
  await p.getByRole('button', { name: /Fotoğrafı değiştir/ }).click(); await sleep(500)
  await p.locator('input[type=file]').first().setInputFiles(path.join(FIX, 'no-face.png'))
  await p.getByText('yüz bulamadık', { exact: false }).waitFor({ timeout: 60000 })
  ok(true, 'yüzsüz: elle kırpma önerildi')
  const view = await p.locator('.crop-view').boundingBox()
  await p.mouse.move(view.x + view.width / 2, view.y + view.height / 2); await p.mouse.down()
  await p.mouse.move(view.x + view.width / 2 + 40, view.y + view.height / 2 + 20, { steps: 5 }); await p.mouse.up()
  await shot('10-elle-kirpma')
  await p.getByRole('button', { name: 'Karakteri Oluştur' }).click()
  await p.getByRole('button', { name: /^Başla!/ }).waitFor({ timeout: 30000 })
  ok(true, 'yüzsüz: elle kırpılan görselle karakter oluştu')
  // geçersiz dosya türü
  await p.getByRole('button', { name: /Fotoğrafı değiştir/ }).click(); await sleep(400)
  await p.locator('input[type=file]').first().setInputFiles({ name: 'not.txt', mimeType: 'text/plain', buffer: Buffer.from('merhaba') })
  await sleep(600)
  ok(await p.getByRole('alert').count() > 0, 'geçersiz dosya: hata mesajı gösterildi')

  ok(errors.length === 0, `konsol hatası yok${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`)
  await b.close()
  console.log(fails ? `\n${fails} kontrol başarısız` : '\nTüm kontroller geçti')
  process.exit(fails ? 1 : 0)
})().catch(e => { console.log('TEST HATASI', e.message.split('\n')[0]); process.exit(1) })
