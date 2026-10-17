// Ortak oyun tipleri

/** Oyun dünyası koordinatları: 800 × 1000 birimlik dikey sahne (canvas'a ölçeklenir) */
export const WORLD_W = 800
export const WORLD_H = 1000

export interface Vec { x: number; y: number }

/** Yüz görselindeki önemli noktalar — yüz görseli koordinatlarında (0..1, sol üst köşe) */
export interface FaceFeatures {
  leftEye: Vec
  rightEye: Vec
  mouth: Vec
  /** Ağız genişliği (görsel genişliğine oranla) */
  mouthWidth: number
  nose: Vec
  /** Yüz ağı: 468 nokta, yüz görseli koordinatlarında (yoksa yüz bükülmez, eski çizim kullanılır) */
  mesh?: Vec[]
  /** Yüz noktaları gerçekten algılandı mı (false → varsayılan oranlar) */
  detected: boolean
}

/** Karaktere giydirilecek yüz: kırpılmış, kenarı yumuşatılmış görsel + özellik noktaları */
export interface FaceAsset {
  /** Doğal görünüm (kenarları yumuşatılmış, şeffaf arka plan) */
  natural: HTMLCanvasElement
  /** Çizgi film filtresi uygulanmış görünüm */
  cartoon: HTMLCanvasElement
  features: FaceFeatures
  /** Yüzden örneklenen ten rengi (boyun, kulak, eller için) */
  skin: string
  /** Görsel, normal yüz kırpmasının kaç katı (tüm kafa kesiminde > 1; özellik noktaları normal kırpmaya göre) */
  expand: number
  /** Saçıyla tüm kafa kesildi mi (true → çizilmiş kulak ve oval taban gerekmez) */
  cutout: boolean
}

export type ToolId = 'slap' | 'punch' | 'slipper' | 'sponge' | 'pie' | 'water' | 'dizzy' | 'tickle' | 'shock' | 'loan'

export type SceneId = 'office' | 'ring' | 'kitchen' | 'school' | 'beach' | 'home'

export interface CharacterLook {
  cartoon: boolean
  /** Oyuncunun seçtiği ortam: arka plan, ön eşya, kıyafet ve şapka buna göre çizilir */
  scene: SceneId
  /** Kıyafetin ana rengi */
  color: string
  /** Ortamdaki tabelada görünen ad (isteğe bağlı) */
  name: string
}

/** Karakterin o anki ifadesi (yüzün üstüne çizilen çizgi film katmanları) */
export type Expression = 'none' | 'shut' | 'dizzy' | 'laugh' | 'googly' | 'tongue' | 'shock' | 'happy'
