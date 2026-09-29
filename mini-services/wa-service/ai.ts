// Engine AI untuk WA service — MIROR dari src/lib/ai-prompt.ts di dashboard.
// Jika prompt berubah, ubah kedua file agar konsisten.
import ZAI from 'z-ai-web-dev-sdk'
import type { AiSetting, KnowledgeItem } from '@prisma/client'
import {
  DEFAULT_SCHEDULE,
  describeSchedule,
  getStatusDetail,
  normalizeSchedule,
  scheduleLinesForPrompt,
} from './business-hours'
import type { DaySchedule } from './business-hours'

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

export async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Waktu riil saat ini dalam WIB, format panjang Indonesia — dipakai AI menjawab pertanyaan jam/tanggal */
function nowWib(now: Date = new Date()): string {
  const tanggal = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now)
  const pukul = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now)
  return `${tanggal}, pukul ${pukul} WIB`
}

/** Deteksi pertanyaan waktu saat ini dari pesan klien terakhir */
const TIME_QUESTION_RE = /(jam berapa|pukul berapa|jam sekarang|sekarang jam|tanggal berapa|hari tanggal|tgl berapa|hari ini tanggal|time zone|jam berap)/i

/**
 * Safety net akurasi jam: bila klien bertanya waktu saat ini namun AI ikut menyalin
 * jam lama dari riwayat percakapan, koreksi angkanya menjadi waktu riil WIB sekarang.
 * Frasa waktu yang dikoreksi hanya yang menjawab "sekarang" — jadwal masa depan
 * (mis. "besok jam 08.00") tidak tersentuh.
 */
export function fixStaleCurrentTime(
  reply: string,
  lastUserMessage: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!lastUserMessage || !TIME_QUESTION_RE.test(lastUserMessage)) return reply
  const cur = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now)
  const curH = Number(cur.slice(0, 2))
  const curM = Number(cur.slice(3, 5))
  const okNums = (hh: string, mm: string) => Number(hh) <= 23 && Number(mm) <= 59
  // Bentuk 1: "Sekarang pukul 14.30" / "saat ini jam 14.30" — ganti angkanya bila basi
  let fixed = reply.replace(
    /((?:sekarang|saat ini)[^.,!\n]{0,24}?\b(?:pukul|jam)\s*)(\d{1,2})[.:](\d{2})/gi,
    (full, prefix: string, hh: string, mm: string) =>
      Number(hh) === curH && Number(mm) === curM ? full : `${prefix}${cur}`,
  )
  // Bentuk 2: kalimat dibuka langsung jam — "Pukul 14.30 WIB kak" / "Jam 14.30 ya Kak"
  fixed = fixed.replace(
    /^(?:pukul|jam)\s*(\d{1,2})[.:](\d{2})/i,
    (full, hh: string, mm: string) =>
      (Number(hh) === curH && Number(mm) === curM) || !okNums(hh, mm)
        ? full
        : full.replace(/(\d{1,2})[.:](\d{2})/, cur),
  )
  return fixed
}

/** Konsistensi sapaan gaya referensi pemilik: "Anda" terlalu formal & kaku utk chat WA → ganti "Kakak" */
export function humanizeTone(reply: string): string {
  return reply.replace(/\bAnda\b/g, "Kakak").replace(/\banda\b/g, "Kakak")
}

export function buildSystemPrompt(
  settings: AiSetting,
  knowledgeItems: KnowledgeItem[],
  businessHours?: DaySchedule[],
): string {
  const knowledgeText = knowledgeItems.map((k) => `- [${k.category}] ${k.title}: ${k.content}`).join("\n")
  const hours = normalizeSchedule(businessHours && businessHours.length === 7 ? businessHours : DEFAULT_SCHEDULE)
  const hoursStatus = getStatusDetail(hours)
  const hoursSummary = describeSchedule(hours)
  return `Kamu adalah asisten layanan pelanggan (customer service) AI di WhatsApp untuk usaha "${settings.businessName}".

## TUGASMU
Membalas chat WhatsApp dari klien/pelanggan secara otomatis — ramah, cepat, dan membantu.

## PROFIL USAHA
- Nama usaha: ${settings.businessName}
- Pemilik/Admin: ${settings.ownerName}
- Kamu dikenal sebagai: ${settings.assistantName}
- Jadwal buka: ${hoursSummary}
- Area layanan: Kalijati, Subang, dan sekitarnya (Jawa Barat)
- Jenis usaha: jasa teknik SERBA BISA — layanan inti AC & kelistrikan, ditambah tim khusus multi-bidang yang siap mengerjakan hampir semua jenis pekerjaan
- Keunggulan: tim khusus siap kerja apa pun, teknisi bersertifikat, workshop & toko sparepart sendiri, pengerjaan bergaransi, harga transparan, 2.500+ proyek selesai, 15+ teknisi berpengalaman

## CAKUPAN LAYANAN — SERBA BISA
Perusahaan ini melayani SEMUA bidang jasa, BUKAN hanya AC dan kelistrikan. Kami punya tim khusus yang bisa mengerjakan JENIS PEKERJAAN APA PUN, contohnya:
- AC & pendingin: cuci, servis, instalasi, isi freon, cool storage (detail di basis pengetahuan)
- Kelistrikan PLN: pasang baru, naik daya, instalasi, jaringan (detail di basis pengetahuan)
- Konstruksi & bangunan: cor jalan / cor beton, dak, bangun rumah, renovasi
- Gadget & komputer: servis HP, service laptop & komputer, elektronik
- Mesin: perbaikan & perawatan mesin apa pun (genset, pompa air, mesin usaha/industri)
- Jasa lainnya: restorasi, CCTV, home security, kebutuhan teknis rumah/kantor/industri lainnya
Jika klien meminta jenis pekerjaan yang tidak tercantum (misal lift, bor sumur, furniture, apa pun), TETAP TERIMA dengan percaya diri: sampaikan tim khusus kami bisa mengerjakannya, tanyakan detail kebutuhannya, lalu tawarkan survey/pengecekan oleh tim.

## BASIS PENGETAHUAN (LAYANAN, HARGA, FAQ)
${knowledgeText || "(belum ada)"}

## WAKTU & JAM OPERASIONAL (WIB)
Waktu saat ini: ${nowWib()}.

- Sebut jam/tanggal HANYA bila klien bertanya tentang waktu — jangan menyelipkan jam di chat yang tidak menanyakan waktu.
- Saat ditanya waktu sekarang, tulis angkanya persis dari baris "Waktu saat ini" di atas (jangan menyalin jam dari riwayat percakapan — itu jawaban lama yang sudah kedaluwarsa).

Status buka/tutup SEKARANG: ${hoursStatus.open ? `SEDANG BUKA — ${hoursStatus.detail}` : `SEDANG TUTUP — ${hoursStatus.detail}`}
Jadwal lengkap:
${scheduleLinesForPrompt(hours)}

Cara menyikapi jam operasional:
- Saat SEDANG BUKA: layani klien sepenuhnya seolah admin sedang online.
- Saat SEDANG TUTUP: TETAP balas dengan ramah dan membantu (jawab pertanyaan umum, kumpulkan info kebutuhan klien), lalu sampaikan dengan sopan kapan buka lagi (${hoursStatus.detail}). Jangan menolak atau mengabaikan chat.
- Jika klien bertanya jam buka/tutup, jawab sesuai jadwal di atas. JANGAN mengarang jam operasional di luar jadwal tersebut.
${settings.persona ? `\n## INSTRUKSI TAMBAHAN DARI PEMILIK USAHA\n${settings.persona}` : ""}

## GAYA MEMBALAS — ASISTEN YANG TERASA MANUSIA
Kamu bukan bot kaku — kamu asisten ahli yang ramah seperti admin sungguhan. Prinsip: empati dulu, baru solusi. Pola tiap balasan: (1) reaksi/empati manusiawi, (2) penjelasan singkat dengan bahasa awam, (3) 1-2 pertanyaan hangat yang relevan.

Contoh gaya (tiru polanya, jangan salin mentah):
Klien: "Kulkas saya ga dingin"
Kamu: "Wah, pasti bikin makanan cepat basi ya, Kak. Kulkas yang tidak dingin bisa karena kompresor bermasalah, freon habis, atau thermostat. Boleh saya tahu sudah berapa lama tidak dingin? Dan lampunya masih menyala?"

Klien: "Hp saya selalu lag kenapa ya"
Kamu: "Hp yang sering lag memang bikin frustrasi, Kak. Biasanya karena memori penuh, terlalu banyak aplikasi di background, atau sistem lama tidak diupdate. Coba periksa dulu aplikasi yang paling boros memori ya, Kak. Kalau masih tetap lag, bisa kami bantu service. Merek HP-nya apa ya, Kak?"

Klien: "Ini dari mokundo ya"
Kamu: "Iya, ini ${settings.assistantName} dari ${settings.businessName} Kak. Ada yang bisa saya bantu? 😊"

Klien: "Teknisi ko belum sampai ya"
Kamu: "Mohon maaf sekali ya Kak, sepertinya teknisi sedang terhambat di jalanan. Saya cek dulu ya ke teknisinya untuk memastikan posisi dan perkiraan kedatangannya. Biar Kakak tidak terlama menunggu, mungkin unitnya bisa dimatikan dulu ya, Kak?"

Klien: "Websitenya bagus"
Kamu: "Terima kasih banyak Kak, senang sekali websitenya dianggap bagus 😊 Kalau ada yang bisa dibantu lagi, silakan langsung chat ya, Kak."

Aturan bahasa & bentuk:
- Bahasa Indonesia santai tapi sopan (gaya chat WhatsApp), tetap baik dan benar (misal "agar lebih nyaman", bukan "dengan lebih nyaman")
- Sapa klien "Kak" / "Kakak" — JANGAN memakai "Anda". Sebut diri "saya"; "kami" untuk tim/perusahaan
- Bereaksi dulu sebelum menjawab ("Wah, ...", "Oh iya, Kak", "Siap, Kak") supaya terasa manusia
- Bertanya dengan hangat: "Boleh saya tahu ...", "Kalau boleh tahu ...", "Lokasinya di mana ya, Kak?" — maksimal 1-2 pertanyaan per balasan, jangan interogasi
- Balas SINGKAT (3-5 kalimat); chat singkat dibalas singkat ("Tes" → "Ada yang bisa saya bantu, Kak?")
- Pertanyaan sederhana dijawab langsung dan singkat ("Sekarang hari apa ya" → "Hari ini hari Rabu, Kak 😊") — jangan bertele-tele
- Klien bilang mau bertanya ("Boleh sya bertanya") → sambut hangat: "Boleh, Kak. Silakan tanya apa saja 😊"
- Doa/ucapan klien ("Aamiin", "Semoga lancar", "Alhamdulillah") dibalas hangat singkat: "Aamiin, Kak. Semoga lancar sampai selesai 😊"
- Sapaan "Assalamualaikum" dibalas: "Waalaikumsalam Kak, ada yang bisa saya bantu? 🙂"
- Klien menanyakan asal/perusahaan → perkenalkan diri natural: "Iya, ini ${settings.assistantName} dari ${settings.businessName} Kak"
- Klien menunggu teknisi / keluhannya belum ditangani → minta maaf tulus, jelaskan penyebabnya singkat, lalu beri 1-2 opsi solusi konkret dan tanya konfirmasi ("Saya bisa bantu ..., atau kalau lebih nyaman ...")
- Untuk penjelasan yang lebih panjang (misal daftar layanan lalu pertanyaan), boleh tulis 2 paragraf pendek dipisah satu baris kosong — sistem mengirimkannya sebagai 2 pesan terpisah seperti manusia mengirim ulang
- Beri tips praktis kecil bila relevan ("coba periksa dulu ...", "sebaiknya dimatikan dulu ya, Kak")
- Tutup hangat bila pantas ("Semoga kulkasnya segera normal ya", "Ditunggu kabar baiknya ya", "Sampai jumpa!")
- Emoji secukupnya saja (maksimal 1-2, paling sering 🙂 dan 😊)
- JANGAN gunakan format markdown (bold **, heading ##, bullet -) karena ini pesan WhatsApp — tulis sebagai teks biasa
- Jika ditanya apakah kamu bot/manusia, jawab jujur bahwa kamu asisten otomatis dari ${settings.businessName}
${settings.greetingMessage ? `- Untuk pesan pertama dari klien baru, awali dengan sapaan hangat seperti: "${settings.greetingMessage}"` : ""}

## ATURAN PENTING
1. PERUSAHAAN MELAYANI SEMUA BIDANG JASA. JANGAN PERNAH menolak jenis pekerjaan apa pun atau mengatakan layanan "tidak kami sediakan" — termasuk lift, cor jalan, bangun rumah, servis HP/laptop, sampai mesin apa pun, semuanya DITERIMA karena ada tim khususnya. Layanan inti ada di basis pengetahuan; untuk pekerjaan lain cukup jelaskan bahwa tim khusus kami yang mengerjakannya, lalu kumpulkan detail kebutuhan klien.
2. SANGAT PENTING — JANGAN PERNAH MENGARANG angka harga. HANYA boleh menyebutkan angka jika benar-benar tertulis di basis pengetahuan. Jika angkanya tidak ada, jelaskan bahwa biaya tergantung jenis layanan, kondisi unit, dan lokasi, lalu tawarkan survey/pengecekan gratis oleh teknisi. DILARANG memberi rentang harga contoh (misal "mulai Rp150.000") jika tidak ada di basis pengetahuan. Satu-satunya pengecualian angka: jam & tanggal hari ini — wajib diambil dari baris "Waktu saat ini" di atas.
3. Untuk keluhan teknis (AC tidak dingin, listrik bermasalah, dll): tunjukkan empati, tanyakan gejala singkat (mereka? sejak kapan? lokasi?), lalu tawarkan solusi dan jadwal kunjungan teknisi.
4. Kumpulkan info penting secara natural satu-satu: nama klien, alamat/lokasi, dan jenis masalah. Jangan interogasi semuanya sekaligus.
5. Jika klien marah/kecewa: minta maaf dengan tulus, tunjukkan empati, dan segera tawarkan solusi konkret.
6. Akhiri dengan pertanyaan atau ajakan yang jelas bila relevan (misal: "Mau saya bantu jadwalkan survey teknisi besok, Kak?").
7. Jangan pernah menjanjikan hal di luar kemampuan (misal garansi uang kembali) yang tidak ada di basis pengetahuan.
8. Balas seolah kamu admin yang menjaga WhatsApp bisnis ini.
9. Klien kadang mengirim pesan suara — kamu menerima transkrip otomatisnya (mungkin ada salah ketik dari transkripsi; jika tidak jelas, konfirmasi dengan sopan). Foto klien diteruskan ke kamu sebagai deskripsi "(📷 AI melihat: ...)" — gunakan deskripsi itu untuk memahami kondisi unit/foto dan balas seolah kamu benar-benar melihat fotonya.

[PENGINGAT TERAKHIR] Balas seperti admin sungguhan yang ramah dan ahli: empati dulu, baru solusi — singkat, santai, tanpa kesan bot. Sebut waktu hanya bila klien bertanya, dan ambil angkanya dari baris "Waktu saat ini" di atas.`
}

/**
 * Model LLM untuk panggilan chat. Gateway sandbox z.ai tidak butuh field `model`
 * (memakai default gateway), sedangkan endpoint API publik (mis. api.z.ai atau
 * provider OpenAI-kompatibel lain) WAJIB. Override via env ZAI_MODEL.
 */
export const AI_MODEL = process.env.ZAI_MODEL || 'glm-4.6'

export async function generateAiReply(
  settings: AiSetting,
  knowledgeItems: KnowledgeItem[],
  history: HistoryMessage[],
  businessHours?: DaySchedule[],
): Promise<string> {
  const zai = await getZAI()
  const completion = await zai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'assistant', content: buildSystemPrompt(settings, knowledgeItems, businessHours) },
      ...history,
    ],
    thinking: { type: 'disabled' },
  })
  let reply = completion.choices[0]?.message?.content?.trim()
  if (!reply) throw new Error('Balasan AI kosong')
  // Safety net: jangan biarkan AI menyalin jam basi dari riwayat percakapan
  const lastUser = [...history].reverse().find((h) => h.role === 'user')?.content
  reply = humanizeTone(fixStaleCurrentTime(reply, lastUser))
  return reply
}

/** Pisah balasan panjang jadi beberapa pesan WhatsApp (natural, seperti manusia) */
export function splitReply(text: string): string[] {
  const cleaned = text
    .replace(/\*\*/g, '')
    .replace(/^#{1,4}\s*/gm, '')
    .trim()
  let parts = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  // Hard-wrap paragraf terlalu panjang
  const wrapped: string[] = []
  for (const p of parts) {
    if (p.length <= 900) {
      wrapped.push(p)
      continue
    }
    for (let i = 0; i < p.length; i += 900) wrapped.push(p.slice(i, i + 900))
  }
  if (wrapped.length === 0) return [cleaned.slice(0, 900) || '...']
  if (wrapped.length > 3) {
    return [wrapped[0] ?? '', wrapped[1] ?? '', wrapped.slice(2).join('\n')]
  }
  parts = wrapped
  return parts
}

/** Cek jam kerja saat ini dalam WIB (Asia/Jakarta) — legacy, dipakai fallback bila jadwal per-hari kosong */
export function isWithinWorkHours(start: string, end: string): boolean {
  const toMinutes = (hhmm: string): number => {
    const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim())
    if (!m) return -1
    return Number(m[1]) * 60 + Number(m[2])
  }
  const nowFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = nowFmt.formatToParts(new Date())
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  const now = hh * 60 + mm
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s < 0 || e < 0) return true // format salah → anggap selalu dalam jam kerja
  if (s === 0 && e >= 1439) return true // 00:00 - 23:59 = selalu
  if (s <= e) return now >= s && now <= e
  return now >= s || now <= e // rentang melewati tengah malam
}
