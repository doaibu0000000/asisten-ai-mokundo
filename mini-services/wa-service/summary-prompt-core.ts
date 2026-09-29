/**
 * Prompt & parser Ringkasan Chat AI — MIRROR dari src/lib/summary-prompt.ts.
 * Ringkasan dibuat UNTUK PEMILIK usaha (internal), bukan untuk klien —
 * tujuannya memberi konteks cepat saat pemilik mengambil alih percakapan.
 * Jika prompt/parser berubah, ubah kedua file agar konsisten.
 */

export type SummaryUrgency = "rendah" | "sedang" | "tinggi"

export interface SummaryResult {
  ringkasan: string
  kebutuhan: string[]
  urgensi: SummaryUrgency
  namaKlien: string | null
  lokasi: string | null
  saran: string
}

export const SUMMARY_SYSTEM_PROMPT = `Kamu adalah asisten internal untuk pemilik usaha jasa teknik serba bisa "Mukundo Teknologi" (Kalijati, Subang, Jawa Barat — melayani SEMUA bidang: AC, kelistrikan PLN, konstruksi/cor jalan/bangun rumah, servis HP & laptop, mesin, dan jasa teknik lainnya; layanan 24 jam, teknisi bersertifikat, workshop & toko sparepart sendiri, 2.500+ proyek selesai).

TUGAS: Meringkas percakapan WhatsApp antara klien dan asisten AI (dan kadang pemilik usaha) agar PEMILIK USAHA bisa mengambil alih percakapan dengan cepat tanpa harus membaca seluruh chat.

ATURAN:
- Semua output dalam Bahasa Indonesia.
- Fokus hanya pada fakta yang benar-benar ada di percakapan — JANGAN mengarang informasi.
- "ringkasan": 2-4 kalimat inti percakapan (siapa klien, apa masalah/kebutuhannya, posisi terakhir percakapan).
- "kebutuhan": daftar singkat kebutuhan/permintaan utama klien, maksimal 4 item, masing-masing maksimal 5 kata.
- "urgensi": "tinggi" bila keadaan darurat/kepanikan/kerusakan parah (AC mati total di ruangan penting, listrik percikan api/tersengat, bau terbakar), "sedang" bila ada keluhan aktif yang menunggu tindakan/jadwal, "rendah" bila sekadar tanya-tanya/basa-basi/permintaan santai.
- "namaKlien" dan "lokasi": isi HANYA bila disebut eksplisit di percakapan, selain itu null.
- "saran": 1-2 kalimat saran tindak lanjut konkret untuk pemilik usaha (misal konfirmasi jadwal survey, siapkan penawaran harga, hubungi klien via telepon).

FORMAT OUTPUT — WAJIB JSON valid saja, tanpa penjelasan apa pun, tanpa markdown:
{"ringkasan":"...","kebutuhan":["..."],"urgensi":"rendah|sedang|tinggi","namaKlien":null,"lokasi":null,"saran":"..."}`

export type SummaryRole = "klien" | "ai" | "pemilik"

export interface SummaryTranscriptLine {
  role: SummaryRole
  text: string
}

const ROLE_LABEL: Record<SummaryRole, string> = {
  klien: "Klien",
  ai: "Asisten AI",
  pemilik: "Pemilik (manual)",
}

/** Susun baris transkrip menjadi teks untuk LLM */
export function buildSummaryTranscript(lines: SummaryTranscriptLine[]): string {
  return lines.map((l) => `[${ROLE_LABEL[l.role]}] ${l.text.replace(/\s+/g, " ").trim()}`).join("\n")
}

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s) return null
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

/** Parse & sanitasi hasil LLM — fallback ke ringkasan teks polos bila JSON rusak */
export function parseSummaryResult(raw: string): SummaryResult {
  const text = (raw ?? "").trim()
  // Ambil blok JSON pertama-terakhir (model kadang membungkus dengan ```json ... ```)
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  let parsed: Record<string, unknown> | null = null
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    } catch {
      parsed = null
    }
  }

  if (parsed) {
    const urgensiRaw = typeof parsed.urgensi === "string" ? (parsed.urgensi as string).toLowerCase() : ""
    const urgensi: SummaryUrgency =
      urgensiRaw === "tinggi" ? "tinggi" : urgensiRaw === "rendah" ? "rendah" : "sedang"
    const kebutuhanRaw = Array.isArray(parsed.kebutuhan) ? parsed.kebutuhan : []
    const kebutuhan = kebutuhanRaw
      .map((k) => clampStr(k, 60))
      .filter((k): k is string => !!k)
      .slice(0, 4)
    return {
      ringkasan: clampStr(parsed.ringkasan, 700) ?? "(ringkasan tidak tersedia)",
      kebutuhan,
      urgensi,
      namaKlien: clampStr(parsed.namaKlien, 80),
      lokasi: clampStr(parsed.lokasi, 120),
      saran: clampStr(parsed.saran, 350) ?? "Baca percakapan terbaru untuk menentukan tindak lanjut.",
    }
  }

  // Fallback: teks polos jadi ringkasan
  const plain = clampStr(text, 700)
  return {
    ringkasan: plain ?? "(ringkasan tidak tersedia)",
    kebutuhan: [],
    urgensi: "sedang",
    namaKlien: null,
    lokasi: null,
    saran: "Baca percakapan terbaru untuk menentukan tindak lanjut.",
  }
}
