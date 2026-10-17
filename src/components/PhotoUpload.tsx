import { useEffect, useRef, useState } from 'react'
import { detectFaces, featuresFromPoints, preloadDetector, segmentPerson, FACE_ASPECT, type CropRect, type DetectedFace } from '../face/FaceDetection'
import { buildFaceAsset, DEFAULT_FEATURES, FACE_PX_W, HEAD_EXPAND, renderCrop } from '../face/faceAsset'
import type { FaceAsset, FaceFeatures } from '../game/types'
import { CropEditor } from './CropEditor'

const MAX_SIDE = 1600
const MAX_BYTES = 25 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

type Phase =
  | { k: 'pick' }
  | { k: 'busy'; text: string }
  | { k: 'choose'; faces: DetectedFace[] }
  | { k: 'crop'; face: DetectedFace | null; note: string }

/** Dosyayı çözüp en uzun kenarı 1600 px olan çalışma kopyasına çiz (orijinal dosya değişmez, bellekte kalmaz) */
async function loadImage(file: File): Promise<HTMLCanvasElement> {
  if (!TYPES.includes(file.type)) throw new Error('Bu dosya türü desteklenmiyor. JPG, PNG ya da WebP yükleyin.')
  if (file.size > MAX_BYTES) throw new Error('Fotoğraf çok büyük (en fazla 25 MB).')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c
  } catch (e) {
    throw e instanceof Error && e.message.includes('desteklenmiyor') ? e : new Error('Fotoğraf açılamadı. Başka bir fotoğraf deneyin.')
  } finally {
    URL.revokeObjectURL(url)   // dosya adresi hemen bırakılır
  }
}

/** Yüz bulunamazsa başlangıç kırpması: fotoğrafın üst-orta bölgesi */
function defaultCrop(src: HTMLCanvasElement): CropRect {
  const w = Math.min(src.width, src.height / FACE_ASPECT) * 0.6
  return { cx: src.width / 2, cy: Math.min(src.height * 0.42, src.height - (w * FACE_ASPECT) / 2), w, angle: 0 }
}

function FaceThumb({ source, face }: { source: HTMLCanvasElement; face: DetectedFace }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!, img = renderCrop(source, face.crop)
    c.width = 160; c.height = 200
    c.getContext('2d')!.drawImage(img, 0, 0, 160, 200)
    img.width = 0
  }, [source, face])
  return <canvas ref={ref} />
}

export function PhotoUpload({ onDone, onBack }: { onDone: (a: FaceAsset) => void; onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>({ k: 'pick' })
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const [source, setSource] = useState<HTMLCanvasElement | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [base, setBase] = useState<CropRect | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)

  useEffect(() => { preloadDetector() }, [])
  // ekrandan çıkınca çalışma kopyası bellekten silinir
  useEffect(() => () => { if (source) { source.width = 0; source.height = 0 } }, [source])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    setPhase({ k: 'busy', text: 'Fotoğraf hazırlanıyor…' })
    try {
      const src = await loadImage(file)
      setSource(src)
      setPhase({ k: 'busy', text: 'Yüz aranıyor… (ilk seferde birkaç saniye sürebilir)' })
      let faces: DetectedFace[] = []
      try { faces = await detectFaces(src) } catch { faces = [] }
      if (faces.length === 1) startCrop(src, faces[0], 'Yüzün bulundu! İstersen kırpmayı ayarla.')
      else if (faces.length > 1) setPhase({ k: 'choose', faces })
      else startCrop(src, null, 'Fotoğrafta yüz bulamadık. Yüzü elle ovale yerleştir.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fotoğraf açılamadı.')
      setPhase({ k: 'pick' })
    }
  }

  function startCrop(src: HTMLCanvasElement, face: DetectedFace | null, note: string) {
    const c = face ? face.crop : defaultCrop(src)
    setCrop(c); setBase(c)
    setPhase({ k: 'crop', face, note })
  }

  async function create() {
    if (!source || !crop || phase.k !== 'crop') return
    setPhase({ k: 'busy', text: 'Karakter oluşturuluyor…' })
    await new Promise(r => setTimeout(r, 30))   // ekrana "oluşturuluyor" yazısı çizilsin
    const faceCanvas = renderCrop(source, crop)
    let features: FaceFeatures = DEFAULT_FEATURES
    if (phase.face) {
      features = featuresFromPoints(phase.face.points, crop)
    } else {
      // elle kırpılan yüzde bir kez daha dene: göz/ağız konumu bulunursa animasyonlar yüze tam oturur
      try {
        const [f] = await detectFaces(faceCanvas)
        if (f) features = featuresFromPoints(f.points, { cx: FACE_PX_W / 2, cy: faceCanvas.height / 2, w: FACE_PX_W, angle: 0 })
      } catch { /* varsayılan oranlar */ }
    }
    // yüz noktaları varsa saçıyla tüm kafayı kes: daha geniş kırp, kişiyi arka plandan ayır
    if (features.mesh) {
      setPhase({ k: 'busy', text: 'Saç ve kafa ayrılıyor…' })
      const head = renderCrop(source, { ...crop, w: crop.w * HEAD_EXPAND }, Math.round(FACE_PX_W * HEAD_EXPAND))
      const person = await segmentPerson(head)
      if (person) { faceCanvas.width = 0; onDone(buildFaceAsset(head, features, person, HEAD_EXPAND)); return }
      head.width = 0
    }
    onDone(buildFaceAsset(faceCanvas, features))
  }

  function reset() { setPhase({ k: 'pick' }); setSource(null); setCrop(null); setError('') }

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setOver(false); void handleFile(e.dataTransfer.files[0]) }

  return (
    <main className="screen">
      <div className="topbar">
        <button className="btn small ghost" onClick={phase.k === 'pick' ? onBack : reset}>← {phase.k === 'pick' ? 'Geri' : 'Başka fotoğraf'}</button>
        <h2>Fotoğrafını Yükle</h2>
        <span style={{ width: 92 }} />
      </div>

      <div className="upload-layout">
        <section aria-live="polite">
          {phase.k === 'pick' && (
            <div className={`dropzone${over ? ' over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
              <div className="big-emoji" aria-hidden>📸</div>
              <p style={{ fontWeight: 900, fontSize: 20 }}>Fotoğrafı buraya sürükle</p>
              <p className="muted">ya da</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="btn" onClick={() => fileRef.current?.click()}>Dosya Seç</button>
                <button className="btn cream" onClick={() => camRef.current?.click()}>Kamera / Galeri</button>
              </div>
              <p className="small-print">JPG, PNG ya da WebP · yüzü net görünen, önden çekilmiş bir fotoğraf en iyisi</p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { void handleFile(e.target.files?.[0]); e.target.value = '' }} />
              <input ref={camRef} type="file" accept="image/*" capture="user" hidden onChange={e => { void handleFile(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          )}

          {phase.k === 'busy' && <div className="status"><span className="spinner" aria-hidden />{phase.text}</div>}

          {phase.k === 'choose' && source && (
            <div className="panel">
              <h3>Birden fazla yüz var — hangisi?</h3>
              <div className="face-pick" role="group" aria-label="Yüz seçimi">
                {phase.faces.map((f, i) => (
                  <button key={i} aria-pressed={false} aria-label={`${i + 1}. yüzü kullan`} onClick={() => startCrop(source, f, 'Seçtiğin yüz hazır. İstersen kırpmayı ayarla.')}>
                    <FaceThumb source={source} face={f} />
                  </button>
                ))}
              </div>
              <p className="small-print" style={{ marginBottom: 0 }}>Soldan sağa, fotoğraftaki sırayla.</p>
            </div>
          )}

          {phase.k === 'crop' && source && crop && base && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className={`status${phase.face ? '' : ' warn'}`}>{phase.face ? '✅' : '✋'} {phase.note}</div>
              <CropEditor source={source} crop={crop} base={base} onChange={setCrop} />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button className="btn big red" onClick={() => void create()}>Karakteri Oluştur</button>
              </div>
            </div>
          )}

          {error && <div className="status err" role="alert" style={{ marginTop: 12 }}>⚠️ {error}</div>}
        </section>

        <aside className="panel">
          <h3>🔒 Fotoğrafın sende kalır</h3>
          <ul className="small-print" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
            <li>Fotoğraf yalnızca bu tarayıcıda işlenir; hiçbir sunucuya yüklenmez.</li>
            <li>Yüz bulma da cihazında çalışır (internete gönderilmez).</li>
            <li>Kalıcı olarak saklanmaz; yeni fotoğraf seçtiğinde ya da ana menüye döndüğünde silinir.</li>
            <li>Reklam ya da başka bir amaçla kullanılmaz.</li>
            <li>Yalnızca kullanma hakkın olan fotoğrafları yükle (kendi fotoğrafın ya da izin aldığın kişiler).</li>
          </ul>
        </aside>
      </div>
    </main>
  )
}
