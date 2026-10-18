// Karakterin oyuncuyu kışkırttığı laflar (konuşma balonunda görünür)

/** Kışkırtma lafları (oyuncuyu gaza getirir; küfür yok) */
export const TAUNTS = {
  start: ['Hadi bakalım, vurabiliyorsan vur!', 'Korkma, ısırmam!', 'Bana dokunamazsın bile!', 'Hazırım, sen hazır mısın?'],
  idle: ['Ne oldu, elin mi titriyor?', 'Uyudun mu?', 'Hadi ama, sıkıldım!', 'Bu kadar mı cesaretin?', 'Annem daha sert vurur!', 'Esneyeceğim şimdi!', 'Bekliyorum…', 'Korktun mu yoksa?'],
  miss: ['Iska! Gözlük lazım sana!', 'Hah! Kaçırdın!', 'Buradayım, buradayım!', 'Nişan almayı bilmiyor musun?', 'Rüzgârını hissettim sadece!'],
  weak: ['Bu muydu?', 'Hiçbir şey hissetmedim!', 'Daha sert!', 'Gıdıklandım sadece!', 'Sinek mi kondu?'],
  comboLost: ['Hahaha, kombon gitti!', 'Yoruldun mu?', 'Nefes nefese kaldın!'],
  lowTime: ['Süre bitiyor, beni yenemedin!', 'Saat tik tak!', 'Son saniyeler, hadi göreyim!'],
} as const
