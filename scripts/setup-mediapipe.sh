#!/bin/bash
# Yüz algılama dosyalarını projeye alır (oyun çalışırken dış sunucuya istek gitmesin):
#   • MediaPipe wasm dosyaları  → public/mediapipe/
#   • Face Landmarker modeli    → public/models/face_landmarker.task (Google'ın resmi model deposundan bir kez indirilir)
set -e
cd "$(dirname "$0")/.."
mkdir -p public/mediapipe public/models
# Yalnız kullanılanlar: SIMD'li sürüm ve eski tarayıcılar için SIMD'siz yedek ("module" varyantı kullanılmıyor)
cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.* node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.* public/mediapipe/
if [ ! -s public/models/face_landmarker.task ]; then
  curl -fsSL -o public/models/face_landmarker.task \
    https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
fi
ls -la public/mediapipe public/models | grep -v "^total"
