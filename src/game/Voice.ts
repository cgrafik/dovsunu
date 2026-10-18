// Karakterin sesi: tarayıcının kendi konuşma sentezi (Web Speech API, Türkçe ses). Metin cihazda seslendirilir,
// hiçbir sunucuya gitmez. Türkçe ses yoksa ya da tarayıcı desteklemiyorsa yalnızca balon görünür.
import type { SoundManager } from './SoundManager'

let trVoice: SpeechSynthesisVoice | null | undefined

function pickVoice(): SpeechSynthesisVoice | null {
  if (trVoice !== undefined && trVoice !== null) return trVoice
  const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : []
  const tr = voices.filter(v => v.lang.toLowerCase().startsWith('tr'))
  trVoice = tr.find(v => v.localService) ?? tr[0] ?? null
  return trVoice
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', () => { trVoice = undefined })

export class Voice {
  private sound: SoundManager
  private speakingUntil = 0
  /** Konuşurken ağız oynasın diye: konuşma sürüyor mu */
  get speaking() { return performance.now() < this.speakingUntil }

  constructor(sound: SoundManager) { this.sound = sound }

  get available() { return typeof speechSynthesis !== 'undefined' && !!pickVoice() }

  /** Cümleyi seslendir. urgent: süren konuşmayı keser (kışkırtma), değilse konuşurken yenisi atlanır */
  say(text: string, opts: { urgent?: boolean; pitch?: number } = {}): boolean {
    const s = this.sound.getSettings()
    if (s.muted || s.volume <= 0 || typeof speechSynthesis === 'undefined') return false
    const voice = pickVoice()
    if (!voice) return false
    if (this.speaking && !opts.urgent) return false
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice; u.lang = voice.lang
    u.rate = 1.08; u.pitch = opts.pitch ?? 1.05; u.volume = Math.min(1, s.volume * 1.2)
    // süre tahmini (onend her tarayıcıda gelmeyebilir): hece başına ~0,2 sn
    const est = 400 + text.length * 70
    this.speakingUntil = performance.now() + est
    u.onend = () => { this.speakingUntil = 0 }
    u.onerror = () => { this.speakingUntil = 0 }
    speechSynthesis.speak(u)
    return true
  }

  stop() { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); this.speakingUntil = 0 }
}

/** Kışkırtma lafları (oyuncuyu gaza getirir; küfür yok) */
export const TAUNTS = {
  start: ['Hadi bakalım, vurabiliyorsan vur!', 'Korkma, ısırmam!', 'Bana dokunamazsın bile!', 'Hazırım, sen hazır mısın?'],
  idle: ['Ne oldu, elin mi titriyor?', 'Uyudun mu?', 'Hadi ama, sıkıldım!', 'Bu kadar mı cesaretin?', 'Annem daha sert vurur!', 'Esneyeceğim şimdi!', 'Bekliyorum…', 'Korktun mu yoksa?'],
  miss: ['Iska! Gözlük lazım sana!', 'Hah! Kaçırdın!', 'Buradayım, buradayım!', 'Nişan almayı bilmiyor musun?', 'Rüzgârını hissettim sadece!'],
  weak: ['Bu muydu?', 'Hiçbir şey hissetmedim!', 'Daha sert!', 'Gıdıklandım sadece!', 'Sinek mi kondu?'],
  comboLost: ['Hahaha, kombon gitti!', 'Yoruldun mu?', 'Nefes nefese kaldın!'],
  lowTime: ['Süre bitiyor, beni yenemedin!', 'Saat tik tak!', 'Son saniyeler, hadi göreyim!'],
} as const
