import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

// PATCH: aksi kirim-sekarang / batalkan
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>
    const action = typeof body.action === "string" ? body.action : ""

    const current = await db.broadcast.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Broadcast tidak ditemukan" }, { status: 404 })

    if (action === "send-now") {
      if (current.status !== "draft" && current.status !== "terjadwal") {
        return NextResponse.json({ error: "Hanya broadcast draf/terjadwal yang bisa dikirim" }, { status: 400 })
      }
      const item = await db.broadcast.update({
        where: { id },
        data: { status: "terjadwal", scheduledAt: new Date() },
      })
      await db.activityLog.create({
        data: { type: "broadcast", level: "info", message: `Broadcast "${current.name}" dikirim sekarang` },
      })
      return NextResponse.json(item)
    }

    if (action === "cancel") {
      if (current.status !== "terjadwal" && current.status !== "mengirim") {
        return NextResponse.json({ error: "Hanya broadcast terjadwal/sedang mengirim yang bisa dibatalkan" }, { status: 400 })
      }
      const item = await db.broadcast.update({
        where: { id },
        data: { status: "dibatalkan" },
      })
      await db.activityLog.create({
        data: { type: "broadcast", level: "warn", message: `Broadcast "${current.name}" dibatalkan (terkirim ${current.sentCount}/${current.totalCount})` },
      })
      return NextResponse.json(item)
    }

    if (action === "pause") {
      if (current.status !== "mengirim") {
        return NextResponse.json({ error: "Hanya broadcast yang sedang mengirim yang bisa dijeda" }, { status: 400 })
      }
      const item = await db.broadcast.update({
        where: { id },
        data: { status: "terjadwal", scheduledAt: new Date() },
      })
      await db.activityLog.create({
        data: { type: "broadcast", level: "warn", message: `Broadcast "${current.name}" dijeda (akan lanjut otomatis)` },
      })
      return NextResponse.json(item)
    }

    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 })
  } catch (error) {
    console.error("PATCH /api/broadcasts/[id] error:", error)
    return NextResponse.json({ error: "Gagal memproses aksi broadcast" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(_req)
    if (locked) return locked
    const { id } = await params
    const current = await db.broadcast.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Broadcast tidak ditemukan" }, { status: 404 })
    if (current.status === "mengirim") {
      return NextResponse.json({ error: "Broadcast sedang mengirim — batalkan dulu" }, { status: 400 })
    }

    await db.broadcast.delete({ where: { id } })
    await db.activityLog.create({
      data: { type: "broadcast", level: "warn", message: `Broadcast dihapus: ${current.name}` },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("DELETE /api/broadcasts/[id] error:", error)
    return NextResponse.json({ error: "Gagal menghapus broadcast" }, { status: 500 })
  }
}
