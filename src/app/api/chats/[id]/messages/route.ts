import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const { id } = await params
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "100")
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 200) : 100

    const contact = await db.contact.findUnique({ where: { id }, select: { id: true } })
    if (!contact) return NextResponse.json({ error: "Kontak tidak ditemukan" }, { status: 404 })

    const messages = await db.message.findMany({
      where: { contactId: id },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        contactId: true,
        jid: true,
        fromMe: true,
        body: true,
        msgType: true,
        source: true,
        status: true,
        createdAt: true,
      },
    })

    // Efek samping: buka percakapan → tandai sudah dibaca
    await db.contact.update({ where: { id }, data: { unread: 0 } }).catch(() => null)

    return NextResponse.json(
      messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))
    )
  } catch (error) {
    console.error("GET /api/chats/[id]/messages error:", error)
    return NextResponse.json({ error: "Gagal memuat pesan" }, { status: 500 })
  }
}
