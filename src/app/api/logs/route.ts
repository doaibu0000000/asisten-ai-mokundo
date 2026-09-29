import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"
import { LOG_LEVELS, LOG_TYPES } from "@/lib/wa-types"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const sp = req.nextUrl.searchParams
    const limitParam = Number(sp.get("limit") ?? "100")
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 500) : 100
    const type = sp.get("type")?.trim() ?? ""
    const level = sp.get("level")?.trim() ?? ""

    const where: Prisma.ActivityLogWhereInput = {}
    if (type && LOG_TYPES.includes(type as never)) where.type = type
    if (level && LOG_LEVELS.includes(level as never)) where.level = level

    const logs = await db.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return NextResponse.json(
      logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))
    )
  } catch (error) {
    console.error("GET /api/logs error:", error)
    return NextResponse.json({ error: "Gagal memuat log aktivitas" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    await db.activityLog.deleteMany({})
    await db.activityLog.create({
      data: { type: "settings", level: "info", message: "Riwayat log dibersihkan" },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("DELETE /api/logs error:", error)
    return NextResponse.json({ error: "Gagal membersihkan log" }, { status: 500 })
  }
}
