// Media intelligence — transkrip pesan suara (ASR) + deskripsi foto (VLM) + baca dokumen PDF (VLM) + klasifikasi lead
// Dipakai index.ts untuk memperkaya pesan masuk sebelum dibalas AI.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import { getZAI, AI_MODEL, type HistoryMessage } from './ai'

/** Model vision (analisis foto/PDF). Endpoint /chat/completions/vision hanya ada di
 * gateway sandbox — API publik menganalisis gambar via chat/completions biasa. */
const VISION_MODEL = process.env.ZAI_VISION_MODEL || 'glm-4.5v'

const MAX_MEDIA_BYTES = 16 * 1024 * 1024 // 16 MB
const FFMPEG_TIMEOUT_MS = 30_000
const VLM_TIMEOUT_MS = 45_000
const VLM_DOC_TIMEOUT_MS = 75_000 // dokumen multi-halaman butuh waktu lebih lama

// ---------------------------------------------------------------------------
// Download media dari server WhatsApp
// ---------------------------------------------------------------------------
export interface DownloadedMedia {
  buffer: Buffer
  mime: string
}

/** Ambil konten media mentah dari WAMessage (mendukung ephemeral & viewOnce, termasuk varian V2) */
export function getMediaContent(waMsg: WAMessage): Record<string, any> | null {
  let msg = (waMsg.message ?? {}) as Record<string, any>
  // Buka bungkus protokol (disappearing message / view once) sampai isi asli
  for (const wrapper of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
    const inner = msg[wrapper]?.message
    if (inner && typeof inner === 'object') msg = inner
  }
  if (msg.imageMessage) return msg.imageMessage
  if (msg.audioMessage) return msg.audioMessage
  if (msg.videoMessage) return msg.videoMessage
  if (msg.documentMessage) return msg.documentMessage
  return null
}

export async function downloadWaMedia(
  waMsg: WAMessage,
  sock: WASocket | null,
): Promise<DownloadedMedia | null> {
  try {
    const content = getMediaContent(waMsg)
    if (!content) return null
    const buffer = (await downloadMediaMessage(waMsg, 'buffer', {}, {
      reuploadRequest: async (m: WAMessage) => {
        if (!sock) throw new Error('socket tidak tersedia untuk reupload')
        return sock.updateMediaMessage(m)
      },
      logger: undefined as unknown as never,
    })) as Buffer
    if (!buffer || buffer.length === 0 || buffer.length > MAX_MEDIA_BYTES) return null
    const mime = String(content.mimetype ?? 'application/octet-stream')
    return { buffer, mime }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Transkrip pesan suara (ASR) — konversi opus/ogg → wav 16k via ffmpeg
// ---------------------------------------------------------------------------
function runFfmpegToWav(input: string, output: string, extraArgs: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', '-i', input, ...extraArgs, '-ar', '16000', '-ac', '1', output], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error('ffmpeg timeout'))
    }, FFMPEG_TIMEOUT_MS)
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exit ${code}`))
    })
  })
}

/**
 * Transkrip pesan suara WhatsApp (ogg/opus) → teks.
 * Pipeline: download → simpan temp → ffmpeg ke wav 16k mono → ASR (z-ai-web-dev-sdk).
 * Mengembalikan null bila gagal (pesan tetap tersimpan sebagai [audio] tanpa transkrip).
 */
export async function transcribeVoiceNote(waMsg: WAMessage, sock: WASocket | null): Promise<string | null> {
  const media = await downloadWaMedia(waMsg, sock)
  if (!media || !media.mime.startsWith('audio/')) return null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-asr-'))
  const inFile = path.join(dir, `in.${media.mime.includes('webm') ? 'webm' : 'ogg'}`)
  const outFile = path.join(dir, 'out.wav')
  try {
    fs.writeFileSync(inFile, media.buffer)
    await runFfmpegToWav(inFile, outFile)
    const wav = fs.readFileSync(outFile)
    if (wav.length === 0 || wav.length > 50 * 1024 * 1024) return null
    const zai = await getZAI()
    const res = await zai.audio.asr.create({ file_base64: wav.toString('base64') })
    const text = res.text?.trim()
    return text && text.length > 0 ? text : null
  } catch {
    return null
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* abaikan */
    }
  }
}

// ---------------------------------------------------------------------------
// Transkrip video / video note (ASR) — ekstrak jalur audio via ffmpeg
// ---------------------------------------------------------------------------
/**
 * Transkrip pesan video (termasuk video note bulat) dari klien → teks.
 * Pipeline: download → ffmpeg buang video (-vn), ambil audio maks 2 menit → wav 16k → ASR.
 * Mengembalikan null bila gagal / tanpa jalur audio.
 */
export async function transcribeVideoNote(waMsg: WAMessage, sock: WASocket | null): Promise<string | null> {
  const media = await downloadWaMedia(waMsg, sock)
  if (!media || !media.mime.startsWith('video/')) return null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-asr-video-'))
  const ext = media.mime.includes('quicktime') ? 'mov' : media.mime.includes('webm') ? 'webm' : 'mp4'
  const inFile = path.join(dir, `in.${ext}`)
  const outFile = path.join(dir, 'out.wav')
  try {
    fs.writeFileSync(inFile, media.buffer)
    // -vn: buang jalur video; -t 120: batasi audio 2 menit pertama
    await runFfmpegToWav(inFile, outFile, ['-vn', '-t', '120'])
    const wav = fs.readFileSync(outFile)
    if (wav.length === 0 || wav.length > 50 * 1024 * 1024) return null
    const zai = await getZAI()
    const res = await zai.audio.asr.create({ file_base64: wav.toString('base64') })
    const text = res.text?.trim()
    return text && text.length > 0 ? text : null
  } catch {
    return null
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* abaikan */
    }
  }
}

// ---------------------------------------------------------------------------
// Deskripsi foto klien (VLM) — konteks layanan AC & kelistrikan
// ---------------------------------------------------------------------------
const VLM_PROMPT = `Anda asisten teknis untuk usaha jasa teknik serba bisa "Mukundo Teknologi" (Kalijati, Subang — AC, listrik, konstruksi, HP/laptop, mesin, dan jasa lainnya). Seorang klien mengirim foto ini via WhatsApp. Deskripsikan dalam Bahasa Indonesia, maksimal 2-3 kalimat, fokus pada: (1) unit/perangkat/objek apa yang terlihat (merk bila terbaca), (2) kondisi atau masalah yang tampak (kotor, bocor, rusak, instalasi baru, perlu dibangun/dikerjakan, dll). Jangan menebak harga.`

/**
 * Deskripsikan foto dari klien agar AI bisa memahami dan membalas.
 * Mengembalikan deskripsi teks, atau null bila gagal.
 */
export async function describeImage(
  waMsg: WAMessage,
  sock: WASocket | null,
  caption?: string,
): Promise<string | null> {
  const media = await downloadWaMedia(waMsg, sock)
  if (!media || !media.mime.startsWith('image/')) return null
  try {
    const zai = await getZAI()
    const dataUrl = `data:${media.mime};base64,${media.buffer.toString('base64')}`
    const prompt = caption?.trim()
      ? `${VLM_PROMPT}\n\nKlien juga menulis: "${caption.trim()}"`
      : VLM_PROMPT
    const res = await Promise.race([
      zai.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      } as unknown as Parameters<typeof zai.chat.completions.create>[0]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('VLM timeout')), VLM_TIMEOUT_MS)),
    ])
    const desc = res.choices[0]?.message?.content?.trim()
    return desc && desc.length > 0 ? desc : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Baca dokumen PDF klien (VLM) — raster halaman via pdftoppm → analisis multi-gambar
// ---------------------------------------------------------------------------
const PDFTOPPM_TIMEOUT_MS = 45_000
const PDF_MAX_PAGES = 3 // halaman pertama umumnya memuat info kunci (penawaran/kwitansi)
const PDF_RASTER_DPI = 110 // cukup terbaca utk teks dokumen, ukuran JPEG moderat
const PDF_PAGE_MAX_BYTES = 4 * 1024 * 1024

export interface DocumentMeta {
  fileName: string | null
  pageCount: number | null
  caption: string | null
  mimetype: string | null
}

/** Ambil metadata dokumen (nama file, jumlah halaman, caption, mimetype) dari WAMessage */
export function getDocumentMeta(waMsg: WAMessage): DocumentMeta | null {
  const msg = (waMsg.message ?? {}) as Record<string, any>
  const doc = msg.documentMessage as Record<string, any> | undefined
  if (!doc) return null
  const pc = Number(doc.pageCount)
  return {
    fileName:
      typeof doc.fileName === 'string' && doc.fileName.trim().length > 0 ? doc.fileName.trim().slice(0, 180) : null,
    pageCount: Number.isFinite(pc) && pc > 0 ? Math.min(Math.floor(pc), 999) : null,
    caption: typeof doc.caption === 'string' ? doc.caption.trim() : null,
    mimetype: typeof doc.mimetype === 'string' ? doc.mimetype : null,
  }
}

/** Konversi buffer PDF → daftar JPEG halaman (maks PDF_MAX_PAGES halaman pertama, terurut) */
export function pdfPagesToJpegs(buffer: Buffer): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-pdf-'))
    let settled = false
    const finish = (err: Error | null, pages?: Buffer[]) => {
      if (settled) return
      settled = true
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        /* abaikan */
      }
      if (err) reject(err)
      else resolve(pages ?? [])
    }
    const inFile = path.join(dir, 'doc.pdf')
    const outPrefix = path.join(dir, 'page')
    try {
      fs.writeFileSync(inFile, buffer)
    } catch (err) {
      finish(err as Error)
      return
    }
    const proc = spawn(
      'pdftoppm',
      ['-jpeg', '-r', String(PDF_RASTER_DPI), '-l', String(PDF_MAX_PAGES), inFile, outPrefix],
      { stdio: ['ignore', 'ignore', 'ignore'] },
    )
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      finish(new Error('pdftoppm timeout'))
    }, PDFTOPPM_TIMEOUT_MS)
    proc.on('error', (err) => {
      clearTimeout(timer)
      finish(err)
    })
    proc.on('close', () => {
      clearTimeout(timer)
      try {
        // pdftoppm mem-pad angka halaman scr konsisten per dokumen → urutan alfabet = urutan halaman
        const pages = fs
          .readdirSync(dir)
          .filter((f) => f.startsWith('page') && f.endsWith('.jpg'))
          .sort()
          .map((f) => fs.readFileSync(path.join(dir, f)))
          .filter((b) => b.length > 0 && b.length <= PDF_PAGE_MAX_BYTES)
        finish(null, pages)
      } catch (err) {
        finish(err as Error)
      }
    })
  })
}

const PDF_VLM_PROMPT = `Anda asisten administrasi untuk usaha jasa teknik serba bisa "Mukundo Teknologi" (Kalijati, Subang). Seorang klien mengirim dokumen PDF via WhatsApp — gambar berikut adalah halaman dokumen itu (urut dari halaman pertama). Ringkas dalam Bahasa Indonesia, maksimal 4-5 kalimat: (1) jenis dokumen (penawaran harga, kwitansi/invoice, nota servis, brosur, daftar harga, atau lainnya), (2) pihak penerbit & penerima bila terbaca, (3) angka penting — total nilai, nomor dokumen, tanggal, rincian item/layanan, (4) maksud klien yang dapat ditarik. Jangan mengarang angka yang tidak terbaca — sebut "tidak terbaca" bila perlu.`

export interface DocumentUnderstanding {
  fileName: string | null
  pageCount: number | null
  caption: string | null
  description: string
}

/**
 * Baca dokumen PDF dari klien (penawaran/kwitansi/nota) agar AI dapat memahami & membalas.
 * Pipeline: download → pdftoppm ke JPEG per halaman → VLM multi-gambar.
 * Mengembalikan null bila bukan PDF / gagal (pesan tetap tersimpan tanpa deskripsi).
 */
export async function describeDocument(
  waMsg: WAMessage,
  sock: WASocket | null,
): Promise<DocumentUnderstanding | null> {
  const meta = getDocumentMeta(waMsg)
  if (!meta) return null
  const media = await downloadWaMedia(waMsg, sock)
  if (!media || media.mime !== 'application/pdf') return null
  try {
    const pages = await pdfPagesToJpegs(media.buffer)
    if (pages.length === 0) return null
    const zai = await getZAI()
    const parts: Array<Record<string, unknown>> = [{ type: 'text', text: PDF_VLM_PROMPT }]
    for (const p of pages) {
      parts.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${p.toString('base64')}` } })
    }
    const res = await Promise.race([
      zai.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: parts,
          },
        ],
        thinking: { type: 'disabled' },
      } as unknown as Parameters<typeof zai.chat.completions.create>[0]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('VLM dokumen timeout')), VLM_DOC_TIMEOUT_MS)),
    ])
    const desc = res.choices[0]?.message?.content?.trim()
    if (!desc || desc.length === 0) return null
    return { fileName: meta.fileName, pageCount: meta.pageCount, caption: meta.caption, description: desc }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Klasifikasi lead (deteksi potensi order dari isi percakapan)
// ---------------------------------------------------------------------------
export type LeadStatus = 'none' | 'baru' | 'potensial' | 'hot' | 'selesai'

export const LEAD_LEVELS: LeadStatus[] = ['none', 'baru', 'potensial', 'hot', 'selesai']

const LEAD_PROMPT = `Anda analis penjualan untuk usaha jasa teknik serba bisa "Mukundo Teknologi" (melayani semua bidang: AC, listrik, konstruksi, HP/laptop, mesin, dll). Analisis riwayat chat WhatsApp berikut antara klien dan asisten.

Klasifikasikan tingkat minat klien menjadi layanan:
- "none": chat basa-basi / pertanyaan umum, belum ada indikasi butuh layanan
- "baru": kontak baru yang baru menyapa / bertanya sekilas
- "potensial": klien bertanya detail layanan, harga, atau menceritakan masalah unit
- "hot": klien ingin memesan, minta jadwal teknisi, menyebut alamat/kesepakatan waktu
- "selesai": layanan sudah selesai / transaksi sudah berjalan

Balas HANYA JSON valid dengan bentuk: {"lead": "<none|baru|potensial|hot|selesai>"}`

/**
 * Klasifikasi level lead dari riwayat percakapan (LLM, output JSON).
 * Mengembalikan null bila gagal diparse.
 */
export async function classifyLead(history: HistoryMessage[]): Promise<LeadStatus | null> {
  if (history.length === 0) return null
  try {
    const zai = await getZAI()
    const transcript = history
      .slice(-24)
      .map((m) => `${m.role === 'assistant' ? 'Asisten' : 'Klien'}: ${m.content.slice(0, 500)}`)
      .join('\n')
    const res = await zai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'assistant',
          content: LEAD_PROMPT,
        },
        { role: 'user', content: `Riwayat chat:\n\n${transcript}\n\nBalas JSON lead status sekarang.` },
      ],
      thinking: { type: 'disabled' },
    })
    const raw = res.choices[0]?.message?.content?.trim() ?? ''
    const match = /\{\s*"lead"\s*:\s*"(none|baru|potensial|hot|selesai)"\s*\}/.exec(raw)
    if (match) return match[1] as LeadStatus
    // fallback: cari kata kunci status di teks
    for (const lvl of LEAD_LEVELS) {
      if (raw.toLowerCase().includes(`"${lvl}"`)) return lvl
    }
    return null
  } catch {
    return null
  }
}
