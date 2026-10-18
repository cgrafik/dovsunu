# Gövde görselleri

`m-*.webp` (erkek) ve `f-*.webp` (kadın) gövdeleri 2026-10-18'de Canva'nın yapay zeka görsel üreticisiyle
(Canva AI, `generate-image`) bu oyun için üretildi. Arka planları Canva ile kaldırıldı. Ardından kırpılıp
480 px genişliğe indirildi ve WebP'ye çevrildi.

| Dosya | Ortam | Kıyafet |
|---|---|---|
| *-office | Ofis | Lacivert takım elbise |
| *-ring | Boks ringi | Atlet, şort, boks eldiveni |
| *-kitchen | Mutfak | Aşçı ceketi, önlük |
| *-school | Sınıf | Yeşil kazak |
| *-beach | Plaj | Hawaii gömleği, şort |
| *-home | Ev | Pijama |

Hepsinin ortak tarifi: "Fotoğraf gerçekliğinde stüdyo çekimi, önden; kadraj boynun altından başlar (kafa yok);
kollar yanlarda; düz açık gri fon." Ölçüler (`bodies.json`, boyun ortası) `src/game/bodies.ts` içine kopyalandı.
Oyunda gövdedeki ten rengi, oyuncunun yüklediği yüzün ten rengine uydurulur.
