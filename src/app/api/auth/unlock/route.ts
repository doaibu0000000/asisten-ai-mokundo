import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  UNLOCK_COOKIE,
  UNLOCK_MAX_AGE,
  clearRateLimit,
  clientIp,
  hashPin,
  rateLimitOk,
  unlockValue,
} from "@/lib/pin-auth"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { pin?: string }
    const pin = typeof body.pin === "string" ? body.pin.trim() : ""

    const s = await db.aiSetting.findUnique({ where: { id: "main" }, select: { pinHash: true, pinEnabled: true } })
    if (!s?.pinEnabled || !s.pinHash) {
      return NextResponse.json({ ok: true, pinEnabled: false }) // tidak ada kunci aktif
    }
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: "PIN terdiri dari 4-8 angka" }, { status: 400 })
    }

    const ip = clientIp(req)
    const rl = rateLimitOk(ip)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Terlalu banyak percobaan salah. Coba lagi dalam ${Math.ceil(rl.retryInSec / 60)} menit.` },
        { status: 429 },
      )
    }

    if (hashPin(pin) !== s.pinHash) {
      return NextResponse.json(
        { error: `PIN salah${rl.remaining <= 3 ? ` — sisa ${rl.remaining} percobaan` : ""}` },
        { status: 401 },
      )
    }

    clearRateLimit(ip)

    const res = NextResponse.json({ ok: true })
    res.cookies.set(UNLOCK_COOKIE, unlockValue(s.pinHash), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: UNLOCK_MAX_AGE,
    })
    await db.activityLog.create({
      data: { type: "settings", level: "info", message: "Dashboard dibuka dengan PIN" },
    })
    return res
  } catch (error) {
    console.error("POST /api/auth/unlock error:", error)
    return NextResponse.json({ error: "Gagal membuka kunci" }, { status: 500 })
  }
}
