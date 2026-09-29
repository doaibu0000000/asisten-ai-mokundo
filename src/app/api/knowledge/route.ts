import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"
import { KNOWLEDGE_CATEGORIES } from "@/lib/wa-types"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const items = await db.knowledgeItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error("GET /api/knowledge error:", error)
    return NextResponse.json({ error: "Gagal memuat basis pengetahuan" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const body = (await req.json()) as Record<string, unknown>

    const category = typeof body.category === "string" && KNOWLEDGE_CATEGORIES.includes(body.category as never)
      ? body.category
      : "lainnya"
    const title = typeof body.title === "string" ? body.title.trim() : ""
    const content = typeof body.content === "string" ? body.content.trim() : ""
    const keywords = typeof body.keywords === "string" ? body.keywords.trim() : null
    const active = typeof body.active === "boolean" ? body.active : true
    const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0

    if (!title) return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 })
    if (!content) return NextResponse.json({ error: "Isi pengetahuan wajib diisi" }, { status: 400 })
    if (title.length > 200) return NextResponse.json({ error: "Judul maksimal 200 karakter" }, { status: 400 })
    if (content.length > 5000) return NextResponse.json({ error: "Isi maksimal 5000 karakter" }, { status: 400 })

    const item = await db.knowledgeItem.create({
      data: { category, title, content, keywords, active, sortOrder },
    })

    await db.activityLog.create({
      data: { type: "knowledge", level: "success", message: `Pengetahuan ditambahkan: ${title}` },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error("POST /api/knowledge error:", error)
    return NextResponse.json({ error: "Gagal menambah pengetahuan" }, { status: 500 })
  }
}
