import { NextRequest, NextResponse } from "next/server"
import { UNLOCK_COOKIE } from "@/lib/pin-auth"
import { db } from "@/lib/db"

export const runtime = "nodejs"

// Kunci manual (tombol gembok) — selalu boleh: mengunci tidak butuh PIN
export async function POST(_req: NextRequest) {
  try {
    const res = NextResponse.json({ ok: true })
    res.cookies.set(UNLOCK_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 })
    await db.activityLog.create({
      data: { type: "settings", level: "info", message: "Dashboard dikunci manual dari tombol gembok" },
    })
    return res
  } catch (error) {
    console.error("POST /api/auth/lock error:", error)
    return NextResponse.json({ error: "Gagal mengunci dashboard" }, { status: 500 })
  }
}
