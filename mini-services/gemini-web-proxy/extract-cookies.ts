// Ekstrak cookie & token sesi dari file capture HTTP (hasil copy devtools/proxy
// dari gemini.google.com) menjadi cookies.json untuk gemini-web-proxy.
// Path file capture dibuat tetap agar tidak ada risiko path traversal.
// Output TIDAK menampilkan nilai rahasia — hanya ringkasan.
import { readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

// eslint-disable-next-line no-useless-escape
const CAPTURE_FILE = join(homedir(), "Downloads", "gemini 3.8 Flash.txt")

const text = readFileSync(CAPTURE_FILE, "utf8")

// 1) Header Cookie
const cookieLine = text.split(/\r?\n/).find((l) => /^Cookie: /.test(l))
if (!cookieLine) {
  console.error("Header 'Cookie:' tidak ditemukan di file capture")
  process.exit(1)
}
const cookie = cookieLine.replace(/^Cookie: /, "").trim()

// 2) User-Agent
const uaLine = text.split(/\r?\n/).find((l) => /^User-Agent: /.test(l))
const ua = uaLine ? uaLine.replace(/^User-Agent: /, "").trim() : undefined

// 3) Token XSRF `at` dari body form (URL-encoded)
const atMatch = text.match(/[?&]at=([^&\r\n\s]+)/)
if (!atMatch) {
  console.error("Parameter 'at' (token XSRF) tidak ditemukan")
  process.exit(1)
}
const at = decodeURIComponent(atMatch[1])

// 4) bl & f.sid dari request line / URL (pindai seluruh file)
const blMatch = text.match(/[?&]bl=([^&\r\n\s"']+)/)
const fsidMatch = text.match(/[?&]f\.sid=([^&\r\n\s"']+)/)

const out = {
  cookie,
  at,
  bl: blMatch ? decodeURIComponent(blMatch[1]) : undefined,
  fsid: fsidMatch ? decodeURIComponent(fsidMatch[1]) : undefined,
  ua,
  capturedAt: new Date().toISOString(),
}

writeFileSync(new URL("./cookies.json", import.meta.url), JSON.stringify(out, null, 2))

// Ringkasan tanpa nilai rahasia
const names = cookie.split(";").map((c) => c.trim().split("=")[0])
console.log(`cookies.json tersimpan. ${names.length} cookie: ${names.join(", ")}`)
console.log(`at: ${at.slice(0, 8)}… (len ${at.length}) | bl: ${out.bl ?? "-"} | ua: ${out.ua?.slice(0, 40) ?? "-"}`)
