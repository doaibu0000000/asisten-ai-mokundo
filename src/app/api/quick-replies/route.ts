import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"
import { QUICK_REPLY_CATEGORIES } from "@/lib/wa-types"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const items = await db.quickReply.findMany({
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error("GET /api/quick-replies error:", error)
    return NextResponse.json({ error: "Gagal memuat balasan cepat" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const body = (await req.json()) as Record<string, unknown>

    const shortcutRaw = typeof body.shortcut === "string" ? body.shortcut.trim().toLowerCase() : ""
    const title = typeof body.title === "string" ? body.title.trim() : ""
    const content = typeof body.content === "string" ? body.content.trim() : ""
    const category = typeof body.category === "string" && QUICK_REPLY_CATEGORIES.includes(body.category as never)
      ? body.category
      : "umum"

    if (!title) return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 })
    if (!content) return NextResponse.json({ error: "Isi balasan wajib diisi" }, { status: 400 })
    if (!/^[a-z0-9]{1,30}$/.test(shortcutRaw)) {
      return NextResponse.json({ error: "Pintasan hanya boleh huruf kecil & angka, 1-30 karakter (mis. harga)" }, { status: 400 })
    }
    if (title.length > 100) return NextResponse.json({ error: "Judul maksimal 100 karakter" }, { status: 400 })
    if (content.length > 1000) return NextResponse.json({ error: "Isi balasan maksimal 1000 karakter" }, { status: 400 })

    const existing = await db.quickReply.findUnique({ where: { shortcut: shortcutRaw } })
    if (existing) return NextResponse.json({ error: `Pintasan "${shortcutRaw}" sudah dipakai` }, { status: 400 })

    const item = await db.quickReply.create({
      data: { shortcut: shortcutRaw, title, content, category },
    })

    await db.activityLog.create({
      data: { type: "quick_reply", level: "success", message: `Balasan cepat ditambahkan: ${title} (/${shortcutRaw})` },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error("POST /api/quick-replies error:", error)
    return NextResponse.json({ error: "Gagal menambah balasan cepat" }, { status: 500 })
  }
}
