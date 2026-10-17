import { useEffect, useRef } from 'react'
import { TOOLS } from '../game/tools'
import { ROUND_SECONDS } from '../game/ScoreManager'

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeBtn.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="how-title" onClick={e => e.stopPropagation()}>
        <h2 id="how-title">Nasıl Oynanır?</h2>
        <ol>
          <li>Kendi fotoğrafını (ya da kullanma izni olduğun bir fotoğrafı) yükle; yüz otomatik bulunur, istersen elle ayarla.</li>
          <li>Formanı seç, adını ve numaranı yaz. Taraftarın tribüne çıksın!</li>
          <li>Aşağıdan bir araç seç ve karaktere dokun. Ya da aracın düğmesine bas: doğrudan hedefe gider.</li>
          <li>Hızlı ve art arda vur: <b>kombo</b> yükselir, puan katlanır. Farklı araç kullanmak ek puan getirir.</li>
          <li>Boşluğa dokunursan <b>ıska</b> sayılır, kombo biter. Tur {ROUND_SECONDS} saniye; süre ilk vuruşla başlar.</li>
        </ol>
        <div className="tool-legend">
          {TOOLS.map(t => <div key={t.id}>{t.emoji} {t.label} <kbd>{t.key}</kbd></div>)}
        </div>
        <p className="small-print" style={{ color: '#3a3f66' }}>
          Klavye: <kbd>1</kbd>–<kbd>7</kbd> aracı kullanır, <kbd>Boşluk</kbd> seçili aracı kullanır.
          Fotoğrafın yalnızca tarayıcında işlenir; hiçbir sunucuya gönderilmez ve oyundan çıkınca silinir.
        </p>
        <button ref={closeBtn} className="btn red" onClick={onClose}>Anladım, oynayalım!</button>
      </div>
    </div>
  )
}
