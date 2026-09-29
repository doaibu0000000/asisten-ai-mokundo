import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"
import { KNOWLEDGE_CATEGORIES } from "@/lib/wa-types"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>

    const existing = await db.knowledgeItem.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Pengetahuan tidak ditemukan" }, { status: 404 })

    const data: Record<string, string | number | boolean> = {}
    if (typeof body.category === "string" && KNOWLEDGE_CATEGORIES.includes(body.category as never)) {
      data.category = body.category
    }
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim()
    if (typeof body.content === "string" && body.content.trim()) data.content = body.content.trim()
    if (typeof body.keywords === "string") data.keywords = body.keywords.trim()
    if (typeof body.active === "boolean") data.active = body.active
    if (Number.isFinite(Number(body.sortOrder))) data.sortOrder = Math.trunc(Number(body.sortOrder))

    if (typeof data.title === "string" && data.title.length > 200) {
      return NextResponse.json({ error: "Judul maksimal 200 karakter" }, { status: 400 })
    }
    if (typeof data.content === "string" && data.content.length > 5000) {
      return NextResponse.json({ error: "Isi maksimal 5000 karakter" }, { status: 400 })
    }

    const item = await db.knowledgeItem.update({ where: { id }, data })

    await db.activityLog.create({
      data: { type: "knowledge", level: "info", message: `Pengetahuan diperbarui: ${item.title}` },
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error("PUT /api/knowledge/[id] error:", error)
    return NextResponse.json({ error: "Gagal memperbarui pengetahuan" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(_req)
    if (locked) return locked
    const { id } = await params
    const existing = await db.knowledgeItem.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Pengetahuan tidak ditemukan" }, { status: 404 })

    await db.knowledgeItem.delete({ where: { id } })

    await db.activityLog.create({
      data: { type: "knowledge", level: "warn", message: `Pengetahuan dihapus: ${existing.title}` },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("DELETE /api/knowledge/[id] error:", error)
    return NextResponse.json({ error: "Gagal menghapus pengetahuan" }, { status: 500 })
  }
}
