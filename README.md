# Tribün Şakası

Fotoğrafını yükle, yüzün tribündeki taraftar karakterine yerleşsin; sünger sopa, kremalı pasta, su tabancası,
gıdıklama tüyü, komik surat, lastik tavuk ve tezahüratla 60 saniyede en yüksek komboyu yap.

Her şey tarayıcıda çalışır: fotoğraf ve yüz algılama hiçbir sunucuya gitmez, kalıcı saklanmaz.

## Çalıştırma

```bash
npm install          # bağımlılıklar + yüz algılama dosyaları (scripts/setup-mediapipe.sh)
npm run dev          # geliştirme sunucusu (http://localhost:5173)
npm run build        # tip kontrolü + üretim derlemesi (dist/)
npm run preview      # derlenmiş sürümü dene (http://localhost:4173)
npm run lint         # oxlint
```

`npm install` sonrası `public/mediapipe/` (wasm) ve `public/models/face_landmarker.task` (≈4 MB, Google'ın resmi
model deposundan bir kez indirilir) oluşur. Oyun çalışırken bunlar kendi sunucusundan yüklenir; dışarıya istek gitmez.

## Testler

```bash
bash scripts/make-fixtures.sh      # yerel test görselleri (tek yüz / iki yüz / yüzsüz)
npm run build && npm run preview   # ayrı terminalde
bash tests/run-e2e.sh masaustu     # ya da: telefon
```

Uçtan uca test (Playwright) açılıştan sonuca kadar tüm akışı oynar: yüz bulma, çok yüz seçimi, elle kırpma,
7 aracın her biri, klavye, dokunma, ıska, hızlı tıklama, ses aç/kapa (üretilen ses kaynağı sayısıyla), skor/kombo,
sonuç, tekrar oyna, geçersiz dosya, yatay taşma ve konsol hataları. Ekran görüntüleri `tests/out/` klasörüne yazılır.

## Mimari

| Modül | Dosya | Görev |
|---|---|---|
| PhotoUpload | `src/components/PhotoUpload.tsx`, `CropEditor.tsx` | Dosya / kamera / sürükle-bırak, yüz seçimi, kırpma |
| FaceDetection | `src/face/FaceDetection.ts` | MediaPipe Face Landmarker (tarayıcıda), kırpma çerçevesi, yüz noktaları |
| — | `src/face/faceAsset.ts` | Kırp + hizala + kenarı yumuşat, çizgi film filtresi, maskot yüz |
| CharacterRenderer | `src/game/CharacterRenderer.ts` | Gövde, forma, atkı, kollar, kafa; yay tabanlı poz; ağız açma; ifadeler |
| GameCanvas | `src/components/GameCanvas.tsx` | React ↔ motor köprüsü (kurulum / temizlik) |
| — | `src/game/GameEngine.ts` | requestAnimationFrame döngüsü, stadyum, girdi, bekleme süreleri |
| AnimationManager | `src/game/AnimationManager.ts` | Araç efektleri, tepkiler, öncelikli ifadeler, parçacıklar, yazılar |
| SoundManager | `src/game/SoundManager.ts` | Web Audio ile programatik sesler, çeşitleme, ses seviyesi |
| ScoreManager | `src/game/ScoreManager.ts` | Skor, kombo, çarpan, eşik mesajları, 60 sn tur |
| GameControls | `src/components/GameControls.tsx`, `Hud.tsx` | Araç çubuğu (bekleme halkası), skor göstergesi |
| ResultsScreen | `src/components/ResultsScreen.tsx` | Toplam skor, en yüksek kombo, kullanılan etkileşimler, görüntü indirme |
