import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""

    const where: Prisma.ContactWhereInput = {
      lastMessageAt: { not: null },
    }
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { number: { contains: q } },
        { lastMessageText: { contains: q } },
      ]
    }

    const contacts = await db.contact.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      include: { _count: { select: { messages: true } } },
    })

    const result = contacts.map((c) => ({
      id: c.id,
      jid: c.jid,
      name: c.name,
      number: c.number,
      isGroup: c.isGroup,
      aiEnabled: c.aiEnabled,
      aiPausedUntil: c.aiPausedUntil ? c.aiPausedUntil.toISOString() : null,
      aiSummaryAt: c.aiSummaryAt ? c.aiSummaryAt.toISOString() : null,
      leadStatus: c.leadStatus,
      leadManual: c.leadManual,
      notes: c.notes,
      unread: c.unread,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastMessageText: c.lastMessageText,
      lastMessageFromMe: c.lastMessageFromMe,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messageCount: c._count.messages,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error("GET /api/chats error:", error)
    return NextResponse.json({ error: "Gagal memuat daftar percakapan" }, { status: 500 })
  }
}
