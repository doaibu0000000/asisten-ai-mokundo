#!/usr/bin/env bash
#
# github-export.sh — siapkan salinan proyek yang AMAN untuk di-push ke GitHub
#
# Menghasilkan folder dist/github-ready/ yang berisi:
#   - seluruh kode sumber (dashboard Next.js + wa-service)
#   - prisma/schema.prisma + seed.ts (basis pengetahuan 22 item ikut serta)
#   - .env.example (contoh konfigurasi)
#
# TIDAK ikut disertakan (privat & tidak boleh ke GitHub):
#   - db/custom.db* (kontak klien, isi chat, kredensial sesi WhatsApp)
#   - .env asli
#   - node_modules, .next, log, .git (riwayat)
#
# Cara pakai:  bash github-export.sh
# Lalu:        cd dist/github-ready && git init && git add -A && git commit -m "Mukundo AI"
#              buat repo kosong di GitHub, lalu push sesuai petunjuk GitHub.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$ROOT/dist/github-ready"

echo "→ Membersihkan ekspor lama…"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "→ Menyalin proyek (tanpa data privat)…"
mkdir -p "$OUT"
# Catatan: rsync tidak tersedia di Git Bash Windows — pakai tar.
# Pola exclude dicocokkan GNU tar ke akhir nama member (berlaku di kedalaman apa pun).
tar -cf - \
  --exclude='./.git' \
  --exclude='node_modules' \
  --exclude='./.next' \
  --exclude='./out' \
  --exclude='./build' \
  --exclude='./dist' \
  --exclude='./db' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.log' \
  --exclude='./tool-results' \
  --exclude='./.claude' \
  --exclude='.mimosa' \
  --exclude='.z-ai-config' \
  --exclude='./skills' \
  --exclude='*.tsbuildinfo' \
  --exclude='./test' \
  --exclude='./prompt' \
  --exclude='./local-*' \
  --exclude='./.turbo' \
  --exclude='cookies.json' \
  . | (cd "$OUT" && tar -xf -)

# tar exclude '.env.*' juga membuang .env.example — kembalikan manual
cp "$ROOT/.env.example" "$OUT/.env.example" || true
cp "$ROOT/mini-services/wa-service/.env.example" "$OUT/mini-services/wa-service/.env.example" || true

echo ""
echo "✅ Selesai: $OUT"
echo "   Isi: $(find "$OUT" -type f | wc -l) file, ukuran $(du -sh "$OUT" | cut -f1)"
echo ""
echo "Langkah berikutnya (di komputer Anda):"
echo "  1. cd dist/github-ready"
echo "  2. git init && git add -A && git commit -m \"Mukundo AI — Asisten WhatsApp\""
echo "  3. Buat repo kosong di github.com lalu push sesuai petunjuknya"
echo "  4. Untuk menjalankan di server baru, baca README.md bagian \"Setup di Server Baru\""
