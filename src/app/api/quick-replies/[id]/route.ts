import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"
import { QUICK_REPLY_CATEGORIES } from "@/lib/wa-types"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>

    const current = await db.quickReply.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Balasan cepat tidak ditemukan" }, { status: 404 })

    const shortcutRaw = typeof body.shortcut === "string" ? body.shortcut.trim().toLowerCase() : ""
    const title = typeof body.title === "string" ? body.title.trim() : ""
    const content = typeof body.content === "string" ? body.content.trim() : ""
    const category = typeof body.category === "string" && QUICK_REPLY_CATEGORIES.includes(body.category as never)
      ? body.category
      : current.category

    if (!title) return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 })
    if (!content) return NextResponse.json({ error: "Isi balasan wajib diisi" }, { status: 400 })
    if (!/^[a-z0-9]{1,30}$/.test(shortcutRaw)) {
      return NextResponse.json({ error: "Pintasan hanya boleh huruf kecil & angka, 1-30 karakter (mis. harga)" }, { status: 400 })
    }
    if (title.length > 100) return NextResponse.json({ error: "Judul maksimal 100 karakter" }, { status: 400 })
    if (content.length > 1000) return NextResponse.json({ error: "Isi balasan maksimal 1000 karakter" }, { status: 400 })

    if (shortcutRaw !== current.shortcut) {
      const dupe = await db.quickReply.findUnique({ where: { shortcut: shortcutRaw } })
      if (dupe) return NextResponse.json({ error: `Pintasan "${shortcutRaw}" sudah dipakai` }, { status: 400 })
    }

    const item = await db.quickReply.update({
      where: { id },
      data: { shortcut: shortcutRaw, title, content, category },
    })

    await db.activityLog.create({
      data: { type: "quick_reply", level: "info", message: `Balasan cepat diubah: ${title} (/${shortcutRaw})` },
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error("PUT /api/quick-replies/[id] error:", error)
    return NextResponse.json({ error: "Gagal mengubah balasan cepat" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(_req)
    if (locked) return locked
    const { id } = await params
    const current = await db.quickReply.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Balasan cepat tidak ditemukan" }, { status: 404 })

    await db.quickReply.delete({ where: { id } })
    await db.activityLog.create({
      data: { type: "quick_reply", level: "warn", message: `Balasan cepat dihapus: ${current.title}` },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("DELETE /api/quick-replies/[id] error:", error)
    return NextResponse.json({ error: "Gagal menghapus balasan cepat" }, { status: 500 })
  }
}
