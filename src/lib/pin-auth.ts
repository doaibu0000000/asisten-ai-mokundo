// Kunci keamanan dashboard — PIN + cookie unlock bertanda tangan HMAC.
// Kontrak yang SAMA dipakai wa-service (pin-socket.ts) supaya socket.io
// juga hanya menerima klien yang sudah dibuka kuncinya.
import { createHash, createHmac, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const UNLOCK_COOKIE = "mt_unlock"
const APP_SECRET = process.env.APP_SECRET ?? "mukundo-ai-2026-secret"
export const UNLOCK_MAX_AGE = 12 * 60 * 60 // detik — sesi buka kunci 12 jam

export function hashPin(pin: string): string {
  return createHash("sha256").update(pin.trim()).digest("hex")
}

export function unlockValue(pinHash: string): string {
  return createHmac("sha256", APP_SECRET).update(pinHash).digest("hex")
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return a === b
  }
}

/** Ambil nilai cookie mt_unlock dari header cookie mentah (dipakai juga utk parsing manual) */
export function parseUnlockCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === UNLOCK_COOKIE) return rest.join("=") || null
  }
  return null
}

/** Status kunci utk request ini: enabled + apakah cookie unlock valid */
export async function readPinGuard(req: NextRequest): Promise<{ enabled: boolean; pinSet: boolean; unlocked: boolean }> {
  const s = await db.aiSetting.findUnique({ where: { id: "main" }, select: { pinHash: true, pinEnabled: true } })
  const pinSet = !!s?.pinHash
  const enabled = !!(s?.pinEnabled && s?.pinHash)
  if (!enabled) return { enabled: false, pinSet, unlocked: true }
  const cookieVal = req.cookies.get(UNLOCK_COOKIE)?.value
  const unlocked = !!cookieVal && !!s?.pinHash && safeEqual(cookieVal, unlockValue(s.pinHash))
  return { enabled, pinSet, unlocked }
}

/**
 * Guard route sensitif — panggil di awal handler:
 *   const locked = await assertUnlocked(req); if (locked) return locked
 */
export async function assertUnlocked(req: NextRequest): Promise<NextResponse | null> {
  const g = await readPinGuard(req)
  if (g.enabled && !g.unlocked) {
    return NextResponse.json(
      { error: "Dashboard terkunci — masukkan PIN untuk membuka", code: "LOCKED" },
      { status: 403 },
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Rate limit sederhana in-memory utk percobaan PIN (per IP)
// ---------------------------------------------------------------------------
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 10
const WINDOW_MS = 10 * 60_000

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  )
}

/** true = masih boleh mencoba; false = kena limit */
export function rateLimitOk(ip: string): { ok: boolean; remaining: number; retryInSec: number } {
  const now = Date.now()
  const a = attempts.get(ip)
  if (!a || now > a.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true, remaining: MAX_ATTEMPTS - 1, retryInSec: 0 }
  }
  a.count++
  if (a.count > MAX_ATTEMPTS) {
    return { ok: false, remaining: 0, retryInSec: Math.ceil((a.resetAt - now) / 1000) }
  }
  return { ok: true, remaining: MAX_ATTEMPTS - a.count, retryInSec: 0 }
}

export function clearRateLimit(ip: string): void {
  attempts.delete(ip)
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,8}$/.test(pin)
}
