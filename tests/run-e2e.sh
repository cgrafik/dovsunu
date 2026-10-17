#!/bin/bash
# Önizleme sunucusu hazır olunca uçtan uca testi çalıştırır: bash tests/run-e2e.sh [masaustu|telefon]
cd "$(dirname "$0")/.."
export LD_LIBRARY_PATH=$HOME/.cache/mh-shot/libs/root/usr/lib/x86_64-linux-gnu:$HOME/.cache/mh-shot/libs/root/usr/lib/x86_64-linux-gnu/nss
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/)
  [ "$code" = 200 ] && break
  sleep 1
done
node tests/e2e.cjs "${1:-masaustu}"
