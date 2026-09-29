import { NextRequest, NextResponse } from "next/server"
import { readPinGuard } from "@/lib/pin-auth"

export const runtime = "nodejs"

// Status kunci — TERBUKA (tanpa guard) karena justru dipakai sebelum unlock
export async function GET(req: NextRequest) {
  try {
    const g = await readPinGuard(req)
    return NextResponse.json({
      pinEnabled: g.enabled,
      pinSet: g.pinSet,
      unlocked: g.enabled ? g.unlocked : true,
    })
  } catch (error) {
    console.error("GET /api/auth/state error:", error)
    return NextResponse.json({ error: "Gagal memuat status kunci" }, { status: 500 })
  }
}
