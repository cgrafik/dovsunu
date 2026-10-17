#!/bin/bash
# Test görselleri (yalnız yerel test; git'e girmez): tek yüz, iki yüz, yüzsüz
set -e
cd "$(dirname "$0")/.."
FF=${FFMPEG:-$HOME/menuhoop/tools/menu-visuals/ffbin/ffmpeg}
mkdir -p tests/fixtures
cd tests/fixtures
# MediaPipe dokümantasyonundaki örnek portre (Google'ın örnek görsel deposu)
[ -s portrait.jpg ] || curl -fsSL -o portrait.jpg https://storage.googleapis.com/mediapipe-assets/portrait.jpg
"$FF" -y -loglevel error -i portrait.jpg -i portrait.jpg -filter_complex "[1]hflip[b];[0][b]hstack" two-faces.jpg
"$FF" -y -loglevel error -f lavfi -i "gradients=s=900x700:c0=0x2e6fd8:c1=0xffc93c:duration=1" -frames:v 1 no-face.png
ls -la
