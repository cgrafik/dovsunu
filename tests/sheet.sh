#!/bin/bash
# Ekran görüntülerini 2×2 paftalara dizer: bash tests/sheet.sh <çıktı> <g1> <g2> <g3> <g4>  (tests/out içinden)
cd "$(dirname "$0")/out" || exit 1
FF=${FFMPEG:-$HOME/menuhoop/tools/menu-visuals/ffbin/ffmpeg}
OUT=$1; shift
args=(); for f in "$@"; do args+=(-i "$f"); done
"$FF" -y -loglevel error "${args[@]}" -filter_complex "[0]scale=900:-2[a];[1]scale=900:-2[b];[2]scale=900:-2[c];[3]scale=900:-2[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" "$OUT" && echo "$OUT"
