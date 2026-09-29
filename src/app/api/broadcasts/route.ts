import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"
import { BROADCAST_AUDIENCES } from "@/lib/wa-types"

export const runtime = "nodejs"

// Peta audience → filter Prisma Contact (hanya kontak chat nyata, bukan grup)
function audienceFilter(audience: string) {
  const base = { isGroup: false, lastMessageAt: { not: null } }
  if (audience === "ai") return { ...base, aiEnabled: true }
  if (audience === "baru" || audience === "potensial" || audience === "hot" || audience === "selesai") {
    return { ...base, leadStatus: audience }
  }
  return base // all
}

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    // ?preview=<audience> → hitung penerima utk pratinjau form (konsisten dgn POST)
    const preview = req.nextUrl.searchParams.get("preview")
    if (preview) {
      const audience = BROADCAST_AUDIENCES.includes(preview as never) ? preview : "all"
      const contacts = await db.contact.findMany({
        where: audienceFilter(audience),
        select: { name: true, number: true },
        orderBy: { lastMessageAt: "desc" },
        take: 500,
      })
      const sample = contacts.slice(0, 5).map((c) => c.name || c.number)
      return NextResponse.json({ audience, count: contacts.length, sample })
    }

    const items = await db.broadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error("GET /api/broadcasts error:", error)
    return NextResponse.json({ error: "Gagal memuat daftar broadcast" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const body = (await req.json()) as Record<string, unknown>

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const message = typeof body.message === "string" ? body.message.trim() : ""
    const audience = typeof body.audience === "string" && BROADCAST_AUDIENCES.includes(body.audience as never)
      ? body.audience
      : "all"
    const sendNow = body.sendNow === true
    const scheduledAtRaw = typeof body.scheduledAt === "string" && body.scheduledAt ? new Date(body.scheduledAt) : null
    const scheduledAt = scheduledAtRaw && !Number.isNaN(scheduledAtRaw.getTime()) ? scheduledAtRaw : null

    if (!name) return NextResponse.json({ error: "Nama broadcast wajib diisi" }, { status: 400 })
    if (name.length > 100) return NextResponse.json({ error: "Nama maksimal 100 karakter" }, { status: 400 })
    if (!message) return NextResponse.json({ error: "Isi pesan wajib diisi" }, { status: 400 })
    if (message.length > 1000) return NextResponse.json({ error: "Isi pesan maksimal 1000 karakter" }, { status: 400 })
    if (!sendNow && !scheduledAt) {
      return NextResponse.json({ error: "Pilih kirim sekarang atau isi jadwal" }, { status: 400 })
    }
    if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) {
      return NextResponse.json({ error: "Jadwal tidak boleh di masa lalu" }, { status: 400 })
    }

    // Snapshot penerima saat dibuat — stabil, tidak berubah walau kontak berubah
    const contacts = await db.contact.findMany({
      where: audienceFilter(audience),
      select: { jid: true, name: true, number: true },
      orderBy: { lastMessageAt: "desc" },
      take: 500,
    })
    if (contacts.length === 0) {
      return NextResponse.json({ error: "Tidak ada penerima untuk audiens ini" }, { status: 400 })
    }

    const recipients = contacts.map((c) => ({ jid: c.jid, name: c.name || c.number }))

    const item = await db.broadcast.create({
      data: {
        name,
        message,
        audience,
        recipients: JSON.stringify(recipients),
        totalCount: recipients.length,
        status: "terjadwal",
        scheduledAt: sendNow ? new Date() : (scheduledAt as Date),
      },
    })

    const when = sendNow ? "segera" : `pada ${scheduledAt?.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`
    await db.activityLog.create({
      data: {
        type: "broadcast",
        level: "info",
        message: `Broadcast dijadwalkan: ${name} (${recipients.length} penerima, ${when})`,
        meta: JSON.stringify({ broadcastId: item.id, audience, count: recipients.length }),
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error("POST /api/broadcasts error:", error)
    return NextResponse.json({ error: "Gagal membuat broadcast" }, { status: 500 })
  }
}
