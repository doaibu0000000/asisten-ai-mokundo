# Mukundo AI — Asisten WhatsApp Otomatis

Dashboard untuk asisten AI yang membalas WhatsApp bisnis secara otomatis — dibuat untuk **Mukundo Teknologi Indonesia** (jasa teknik serba bisa, Kalijati–Subang).

## Apa yang Bisa dan Tidak Bisa di-hosting?

| Tujuan | Bisa? | Penjelasan |
|---|---|---|
| **GitHub (backup kode)** | ✅ Bisa | Gunakan `github-export.sh` untuk salinan bersih tanpa data privat. |
| **GitHub Pages** | ❌ Tidak bisa | GitHub Pages hanya untuk website statis. Aplikasi ini butuh server (Node.js + proses WhatsApp). |
| **Vercel / Netlify** | ⚠️ Terbatas | Dashboard-nya bisa jalan, tetapi **service WhatsApp (otak AI yang membalas chat) tidak bisa** — butuh proses yang hidup terus-menerus + penyimpanan tetap. Tanpa wa-service, dashboard hanya menampilkan "WA offline". |
| **VPS / server (rekomendasi)** | ✅ Bisa | Satu-satunya cara agar semuanya bekerja: dashboard + wa-service + SQLite di satu server yang selalu hidup. |

## Setup di Server Baru

```bash
# 1) Install dependensi
bun install
cd mini-services/wa-service && bun install && cd ../..

# 2) Siapkan database + basis pengetahuan (22 item bawaan)
#    Salin .env.example menjadi .env (proyek utama & mini-services/wa-service),
#    sesuaikan path DATABASE_URL dengan lokasi server Anda.
bun run db:setup        # = prisma db push + seed pengetahuan Mukundo

# 3) Jalankan dashboard (port 3000)
bun run dev

# 4) Jalankan service WhatsApp (di terminal lain, port 3003)
cd mini-services/wa-service && bun run dev

# 5) Buka dashboard, scan QR WhatsApp di halaman "Koneksi WhatsApp"
```

## Pengetahuan Tidak Akan Hilang

Pengetahuan AI disimpan di 3 tempat — semua ikut saat proyek diunduh dari GitHub:

1. **`prisma/seed.ts`** — 22 item pengetahuan bawaan (layanan, harga, FAQ, profil). `bun run db:setup` otomatis membuatnya di database baru.
2. **Tombol "Unduh Cadangan"** (dashboard → Basis Pengetahuan) — file JSON berisi seluruh pengetahuan + pengaturan AI + jam operasional. Simpan di HP/drive.
3. **Tombol "Pulihkan"** — kembalikan semua pengetahuan dari file cadangan kapan saja, di server mana pun.

> Catatan keamanan: file `db/custom.db` berisi data privat (kontak klien, isi chat, kredensial sesi WhatsApp) — **jangan pernah** di-push ke GitHub. Skrip `github-export.sh` otomatis mengecualikannya.

## Push ke GitHub

```bash
bash github-export.sh          # buat dist/github-ready/ (bersih dari data privat)
cd dist/github-ready
git init && git add -A && git commit -m "Mukundo AI"
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

## Arsitedktur Singkat

- `src/` — dashboard Next.js (port 3000): monitoring, pengaturan AI, basis pengetahuan, broadcast, laporan, simulator
- `mini-services/wa-service/` — Baileys WhatsApp Web + engine AI auto-reply (port 3003)
- `prisma/schema.prisma` + SQLite bersama (`db/custom.db`, mode WAL)
- `src/lib/ai-prompt.ts` ≡ `mini-services/wa-service/ai.ts` — **dua file ini WAJIB identik** (mirror prompt AI)
