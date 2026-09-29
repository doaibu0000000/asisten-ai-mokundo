// Verifikasi kunci PIN pada koneksi socket.io — defense in depth.
// Socket yang handshake TANPA cookie unlock valid tidak digabungkan ke
// room 'verified', sehingga tidak menerima event privat (pesan, QR, pairing)
// dan aksi sensitifnya ditolak. Cookie httpOnly dikirim otomatis oleh
// transport polling socket.io (browser same-origin via gateway).
import { createHmac } from 'crypto'
import type { Socket } from 'socket.io'
import { db } from './db'

const APP_SECRET = process.env.APP_SECRET ?? 'mukundo-ai-2026-secret'
const UNLOCK_COOKIE = 'mt_unlock'

// Cache 10 detik supaya tidak kena DB di setiap koneksi socket
let cache: { at: number; pinHash: string | null; enabled: boolean } | null = null

async function getPinState() {
  if (cache && Date.now() - cache.at < 10_000) return cache
  const s = await db.aiSetting.findUnique({
    where: { id: 'main' },
    select: { pinHash: true, pinEnabled: true },
  })
  cache = { at: Date.now(), pinHash: s?.pinHash ?? null, enabled: !!(s?.pinEnabled && s?.pinHash) }
  return cache
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=') || null
  }
  return null
}

/** true bila koneksi socket ini boleh menerima event privat / aksi sensitif */
export async function socketUnlocked(socket: Pick<Socket, 'handshake'>): Promise<boolean> {
  try {
    const st = await getPinState()
    if (!st.enabled || !st.pinHash) return true
    const val = parseCookie(socket.handshake.headers.cookie, UNLOCK_COOKIE)
    if (!val) return false
    const expected = createHmac('sha256', APP_SECRET).update(st.pinHash).digest('hex')
    return val === expected
  } catch {
    // gagal membaca state → anggap terkunci (fail-closed)
    return false
  }
}
