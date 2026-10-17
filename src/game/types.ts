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
}

export type ToolId = 'sponge' | 'pie' | 'water' | 'tickle' | 'face' | 'dizzy' | 'cheer'

export interface JerseyStyle {
  primary: string
  secondary: string
  name: string
  number: string
}

export interface CharacterLook {
  cartoon: boolean
  jersey: JerseyStyle
}

/** Karakterin o anki ifadesi (yüzün üstüne çizilen çizgi film katmanları) */
export type Expression = 'none' | 'shut' | 'dizzy' | 'laugh' | 'googly' | 'tongue' | 'shock' | 'happy'
