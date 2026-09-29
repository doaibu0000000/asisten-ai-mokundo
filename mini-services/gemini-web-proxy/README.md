# gemini-web-proxy

Proxy kecil (Bun, port 3010) yang menerjemahkan panggilan AI aplikasi
(format OpenAI-compatible dari `z-ai-web-dev-sdk`) ke **web gemini.google.com**
memakai cookie sesi Google milik pengguna sendiri.

> ⚠️ **Penting**: ini pemakaian TIDAK RESMI (melanggar ToS Google) dan hanya
> untuk penggunaan pribadi. Cookie sesi pasti kedaluwarsa — bila asisten tiba-
> tiba berhenti menjawab, perbarui cookie (cara di bawah). Jangan pernah
> commit/membagikan `cookies.json`.

## Cara kerja

```
Dashboard /api/simulate ──► z-ai-web-dev-sdk ──► .z-ai-config (home dir)
        (localhost:3000)                        baseUrl: http://localhost:3010/v1
                                                        │
                                                        ▼
                                              gemini-web-proxy :3010
                                                        │  cookie sesi + token at
                                                        ▼
                                        gemini.google.com (StreamGenerate)
```

- Dashboard dan wa-service sama-sama membaca `~/.z-ai-config`, jadi keduanya
  otomatis memakai proxy ini tanpa perubahan kode.
- Proxy mengambil ulang token `at` (SNlM0e) dari halaman web bila memungkinkan,
  dan mencoba path `/u/0/` maupun tanpa prefix bila salah satu ditolak.

## Memperbarui cookie saat kedaluwarsa

Gejala: toast "Gagal menghasilkan balasan AI" dengan pesan `SESI_KEDALUWARSA`.

1. Buka https://gemini.google.com di browser (pastikan masih login), tekan F12 →
   tab **Network**.
2. Kirim satu pesan apa pun di chat Gemini.
3. Cari request bernama `StreamGenerate` → klik kanan → **Copy → Copy request
   headers** (atau "Copy as cURL"), tempel ke file teks. Pastikan di dalamnya
   ada baris `Cookie: ...` dan di body-nya parameter `at=...`.
4. Simpan sebagai `gemini 3.8 Flash.txt` di folder **Downloads**
   (menimpa yang lama), lalu jalankan:
   ```
   cd mini-services/gemini-web-proxy
   bun extract-cookies.ts
   ```
5. Tidak perlu restart — proxy membaca ulang saat dipanggil berikutnya
   (kalau proxy sedang tidak jalan: `bun run index.ts`).

## Menjalankan

Otomatis saat `bash .zscripts/dev.sh` (folder ini punya script `dev`).
Manual: `bun run index.ts` dari folder ini.
