#!/bin/bash
# start-all.sh — nyalakan seluruh layanan Mukundo AI sekaligus.
# Semua proses detached dengan log ke file (aman dari hang pipe Windows).
#   Dashboard  : http://localhost:3000  (mode production, .next/standalone)
#   WA service : port 3003
#   AI proxy   : port 3010 (gemini-web-proxy — butuh mini-services/gemini-web-proxy/cookies.json)
# Catatan: setelah mengubah kode sumber, jalankan ulang "bun run build" dulu.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/.zscripts"

probe() { curl -s --max-time 2 "$1" >/dev/null 2>&1; }

# 1) AI proxy (harus hidup lebih dulu — dipakai dashboard & WA service)
if probe http://localhost:3010/health; then
  echo "[ai-proxy]    sudah berjalan"
else
  if [ ! -f "$ROOT/mini-services/gemini-web-proxy/cookies.json" ]; then
    echo "[ai-proxy]    PERINGATAN: cookies.json tidak ada — lihat mini-services/gemini-web-proxy/README.md"
  fi
  ( cd "$ROOT/mini-services/gemini-web-proxy" && exec bun run index.ts ) >>"$LOG/ai-proxy.log" 2>&1 &
  disown
  echo "[ai-proxy]    dijalankan (port 3010)"
fi

# 2) Dashboard production
if probe http://localhost:3000/; then
  echo "[dashboard]   sudah berjalan"
else
  NODE_ENV=production DATABASE_URL="file:../db/custom.db" bun .next/standalone/server.js >>"$LOG/dashboard.log" 2>&1 &
  disown
  echo "[dashboard]   dijalankan (port 3000)"
fi

# 3) WA service (koneksi WhatsApp)
if probe http://localhost:3003/; then
  echo "[wa-service]  sudah berjalan"
else
  ( cd "$ROOT/mini-services/wa-service" && exec bun run dev ) >>"$LOG/wa-service.log" 2>&1 &
  disown
  echo "[wa-service]  dijalankan (port 3003)"
fi

echo ""
echo "Selesai. Dashboard: http://localhost:3000  |  Log: .zscripts/*.log"
