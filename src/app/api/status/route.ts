import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"

export async function GET() {
  try {
    let session = await db.waSession.findUnique({ where: { id: "main" } })
    if (!session) {
      session = await db.waSession.create({ data: { id: "main" } })
    }

    return NextResponse.json({
      status: session.status as string,
      owner: session.ownerName || session.ownerNumber
        ? { name: session.ownerName ?? undefined, number: session.ownerNumber ?? undefined, jid: session.ownerJid ?? undefined }
        : null,
      connectedAt: session.connectedAt?.toISOString() ?? null,
    })
  } catch (error) {
    console.error("GET /api/status error:", error)
    return NextResponse.json({ error: "Gagal memuat status koneksi" }, { status: 500 })
  }
}
