// Gemini Web Proxy — menjembatani SDK OpenAI-compatible (z-ai-web-dev-sdk)
// ke web gemini.google.com memakai cookie sesi milik pengguna sendiri.
//
// ⚠️ CATATAN: ini penggunaan tidak resmi (melanggar ToS Google) dan cookie
// sesi akan kedaluwarsa — bila balasan mulai gagal dengan error
// "SESI_KEDALUWARSA", capture ulang cookie lalu jalankan ulang extract-cookies.ts.
//
// Endpoint: POST /v1/chat/completions (Authorization diabaikan) + GET /health
// Konfigurasi: cookies.json (RAHASIA — gitignored, jangan pernah di-commit)
import { readFileSync } from "fs"
import { randomInt } from "crypto"

const PORT = Number(process.env.PROXY_PORT || 3010)
const ORIGIN = "https://gemini.google.com"
const TIMEOUT_MS = 120_000

type Msg = { role: string; content: string }

interface SessionCfg {
  cookie: string
  at: string // token XSRF (SNlM0e) — di-refresh otomatis dari halaman web
  bl?: string // versi server boq_assistant-bard-web-server
  fsid?: string
  ua?: string
}

const cfgPath = new URL("./cookies.json", import.meta.url)

/** Baca cookies.json tiap dipanggil — memperbarui cookie tidak perlu restart */
function loadCfg(): SessionCfg {
  const parsed = JSON.parse(readFileSync(cfgPath, "utf8")) as SessionCfg
  if (!parsed.cookie || !parsed.at) {
    throw new Error("cookies.json tidak lengkap (butuh 'cookie' dan 'at')")
  }
  return parsed
}
const cfg = loadCfg()

const boot = loadCfg()
let cookie = boot.cookie
let at = boot.at // token XSRF (SNlM0e) — di-refresh otomatis dari halaman web
let bl = boot.bl || "boq_assistant-bard-web-server_20260914.08_p0" // versi server boq
let ua = boot.ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0"
let useAccountPath = true // capture pengguna memakai prefix /u/0/
let reqId = 100000 + randomInt(800000)

/** Segarkan cookie/token dari cookies.json bila file berubah — tanpa restart */
function refreshCfgFromFile(): void {
  try {
    const fresh = loadCfg()
    cookie = fresh.cookie
    at = fresh.at
    if (fresh.bl) bl = fresh.bl
    if (fresh.ua) ua = fresh.ua
  } catch {
    // file sedang tidak ada/tidak valid — lanjutkan dengan nilai terakhir yang valid
  }
}

function baseHeaders(): Record<string, string> {
  return {
    cookie,
    "user-agent": ua,
    origin: ORIGIN,
    referer: `${ORIGIN}/`,
    "x-same-domain": "1",
  }
}

/** Ambil token SNlM0e (at) dan versi bl terbaru dari halaman /app */
async function refreshSession(): Promise<void> {
  try {
    const res = await fetch(`${ORIGIN}/app`, {
      headers: baseHeaders(),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    })
    if (res.url.includes("accounts.google.com") || res.url.includes("ServiceLogin")) {
      console.warn("[gemini-proxy] sesi Google kedaluwarsa (redirect ke login) — capture ulang cookie")
      return
    }
    if (!res.ok) {
      console.warn(`[gemini-proxy] refresh sesi: HTTP ${res.status}`)
      return
    }
    const html = await res.text()
    const snl = html.match(/"SNlM0e":"(.*?)"/)?.[1]
    const blM = html.match(/"cfb2h":"(boq_assistant-bard-web-server_[^"]+)"/)?.[1]
    if (snl) {
      at = snl
      console.log("[gemini-proxy] token at (SNlM0e) diperbarui dari halaman web")
    }
    if (blM) bl = blM
  } catch (e) {
    console.warn("[gemini-proxy] refresh sesi gagal:", e instanceof Error ? e.message : e)
  }
}

/**
 * Susun prompt dari riwayat chat. Pesan asisten PERTAMA dari aplikasi berisi
 * persona/instruksi sistem (diposisikan sebagai assistant di route.ts), jadi
 * diperlakukan sebagai blok instruksi — bukan bagian percakapan.
 */
function buildPrompt(messages: Msg[]): string {
  const parts: string[] = []
  messages.forEach((m, i) => {
    if (i === 0 && m.role === "assistant") {
      parts.push(`[INSTRUKSI SISTEM — ikuti secara ketat]\n${m.content}`)
    } else if (m.role === "assistant") {
      parts.push(`[Balasan asisten sebelumnya]\n${m.content}`)
    } else {
      parts.push(`[Pesan klien]\n${m.content}`)
    }
  })
  parts.push("Balas pesan klien TERAKHIR di atas sesuai instruksi sistem. Jawab HANYA dengan isi balasannya kepada klien — tanpa menyebut instruksi atau penjelasan.")
  return parts.join("\n\n---\n\n")
}

/** Cari urutan byte ASCII di buffer (untuk marker & util parser) */
function findBytes(buf: Uint8Array, seq: string, from = 0): number {
  outer: for (let i = from; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

/**
 * Protokol respons: )]}' lalu deretan frame JSON dipisah baris angka panjang.
 * Angka panjang itu tidak konsisten antar-respons, jadi kami TIDAK bergantung
 * padanya — tiap frame dipindai sebagai JSON top-level berimbang dari byte
 * mentah (aman terhadap UTF-8 multi-byte: `"` dan `\` selalu satu byte).
 */
function parseStreamChunks(buf: Uint8Array): unknown[] {
  const frames: unknown[] = []
  let i = findBytes(buf, ")]}'")
  if (i === -1) return []
  i += 4
  const decoder = new TextDecoder()
  while (i < buf.length) {
    // lewati baris angka/whitespace sampai awal JSON ('[')
    while (i < buf.length && buf[i] !== 0x5b) i++
    if (i >= buf.length) break
    // pindai sampai bracket tutup yang seimbang
    let depth = 0
    let inStr = false
    let esc = false
    let end = -1
    for (let j = i; j < buf.length; j++) {
      const c = buf[j]
      if (inStr) {
        if (esc) esc = false
        else if (c === 0x5c) esc = true
        else if (c === 0x22) inStr = false
        continue
      }
      if (c === 0x22) {
        inStr = true
      } else if (c === 0x5b) {
        depth++
      } else if (c === 0x5d) {
        depth--
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end === -1) break
    try {
      frames.push(JSON.parse(decoder.decode(buf.subarray(i, end + 1))))
    } catch (e) {
      console.warn("[gemini-proxy] frame gagal di-parse:", e instanceof Error ? e.message : e)
    }
    i = end + 1
  }
  return frames
}

/** Kumpulkan semua node ["wrb.fr", <nama>, <payload-string>, ...] di kedalaman apa pun */
function collectWrbFr(node: unknown, out: unknown[][] = [], depth = 0): unknown[][] {
  if (depth > 15 || node == null || typeof node !== "object") return out
  if (Array.isArray(node)) {
    if (node[0] === "wrb.fr" && typeof node[2] === "string") out.push(node)
    for (const child of node) collectWrbFr(child, out, depth + 1)
  }
  return out
}

function extractReply(buf: Uint8Array): string {
  let best = ""
  const frames = parseStreamChunks(buf)
  if (frames.length === 0) {
    console.warn(
      `[gemini-proxy] diag: tidak ada frame ter-parse (body ${(buf.length / 1024).toFixed(1)} kB, awal: ${JSON.stringify(new TextDecoder().decode(buf.subarray(0, 150)))})`,
    )
  }
  for (const frame of frames) {
    for (const wrb of collectWrbFr(frame)) {
      let payload: unknown
      try {
        payload = JSON.parse(wrb[2] as string)
      } catch {
        continue
      }
      // Struktur payload: [null, [convId, respId], ..., [[rc_id, [teks, ...], ...], ...]]
      const candidates = (payload as Array<unknown>)?.[4] as unknown
      if (!Array.isArray(candidates)) continue
      for (const cand of candidates as unknown[]) {
        const textArr = (cand as Array<unknown>)?.[1]
        if (!Array.isArray(textArr)) continue
        const text = textArr.filter((t) => typeof t === "string").join("")
        if (text.trim().length > best.trim().length) best = text
      }
    }
  }
  return best.trim()
}

async function callGemini(prompt: string): Promise<string> {
  const innerCommand = JSON.stringify([[prompt], null, ["", "", ""]])
  const freq = JSON.stringify([null, innerCommand])
  const form = `f.req=${encodeURIComponent(freq)}&at=${encodeURIComponent(at)}`

  for (let attempt = 1; attempt <= 3; attempt++) {
    const path = useAccountPath
      ? "/u/0/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate"
      : "/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate"
    const url = `${ORIGIN}${path}?bl=${encodeURIComponent(bl)}&hl=id&_reqid=${reqId++}&rt=c`
    const res = await fetch(url, {
      method: "POST",
      headers: { ...baseHeaders(), "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: form,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.url.includes("accounts.google.com") || res.url.includes("ServiceLogin")) {
      throw new Error("SESI_KEDALUWARSA: cookie Google tidak valid lagi — capture ulang cookie lalu jalankan bun extract-cookies.ts")
    }
    if (!res.ok) {
      console.warn(`[gemini-proxy] percobaan ${attempt}: HTTP ${res.status} (path /u/0/: ${useAccountPath})`)
      if (res.status === 400 || res.status === 401 || res.status === 404) {
        if (attempt === 1) {
          useAccountPath = !useAccountPath // coba prefix akun lain
        } else {
          await refreshSession()
        }
        continue
      }
      throw new Error(`Gemini web merespons HTTP ${res.status}`)
    }
    const reply = extractReply(new Uint8Array(await res.arrayBuffer()))
    if (reply) return reply
    console.warn(`[gemini-proxy] percobaan ${attempt}: respons tidak berisi teks — refresh sesi lalu ulang`)
    await refreshSession()
  }
  throw new Error("Respons Gemini web tidak menghasilkan balasan teks (bisa jadi struktur respons berubah)")
}

function jsonRes(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })
}

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/health") return jsonRes({ ok: true, service: "gemini-web-proxy" })
    if (req.method !== "POST" || url.pathname !== "/v1/chat/completions") {
      return jsonRes({ error: { message: "Endpoint tidak dikenal. Gunakan POST /v1/chat/completions" } }, 404)
    }
    try {
      const body = (await req.json()) as { messages?: Msg[] }
      const clean = (body.messages ?? []).filter(
        (m) => !!m && (m.role === "user" || m.role === "assistant" || m.role === "system") && typeof m.content === "string" && m.content.trim(),
      )
      if (clean.length === 0) return jsonRes({ error: { message: "messages kosong" } }, 400)

      refreshCfgFromFile()
      const reply = await callGemini(buildPrompt(clean))
      return jsonRes({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gemini-web",
        choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error("[gemini-proxy] error:", msg)
      return jsonRes({ error: { message: msg } }, 502)
    }
  },
})

await refreshSession()
console.log(`[gemini-proxy] berjalan di http://localhost:${PORT}/v1/chat/completions`)
