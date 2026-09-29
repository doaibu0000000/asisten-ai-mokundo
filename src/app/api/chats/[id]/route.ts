import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(_req)
    if (locked) return locked
    const { id } = await params
    const contact = await db.contact.findUnique({ where: { id } })
    if (!contact) return NextResponse.json({ error: "Kontak tidak ditemukan" }, { status: 404 })

    return NextResponse.json({
      ...contact,
      aiPausedUntil: contact.aiPausedUntil ? contact.aiPausedUntil.toISOString() : null,
      aiSummary: contact.aiSummary,
      aiSummaryAt: contact.aiSummaryAt ? contact.aiSummaryAt.toISOString() : null,
      lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("GET /api/chats/[id] error:", error)
    return NextResponse.json({ error: "Gagal memuat kontak" }, { status: 500 })
  }
}

const LEAD_STATUSES = ["none", "baru", "potensial", "hot", "selesai"] as const

const LEAD_LABEL: Record<(typeof LEAD_STATUSES)[number], string> = {
  none: "Belum ada",
  baru: "Baru",
  potensial: "Potensial",
  hot: "HOT 🔥",
  selesai: "Selesai",
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>

    const existing = await db.contact.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Kontak tidak ditemukan" }, { status: 404 })

    const data: Record<string, string | number | boolean | null> = {}
    let aiToggled = false
    if (typeof body.aiEnabled === "boolean") {
      data.aiEnabled = body.aiEnabled
      // Mengaktifkan AI sekaligus membatalkan jeda ambil alih manual (konsisten dengan saklar titik)
      if (body.aiEnabled) data.aiPausedUntil = null
      aiToggled = true
    }
    if (typeof body.notes === "string") data.notes = body.notes.slice(0, 2000)
    if (body.markRead === true) data.unread = 0

    // Status lead — diatur manual pemilik (deteksi otomatis akan dilewati)
    let leadChanged = false
    if (typeof body.leadStatus === "string") {
      if (!LEAD_STATUSES.includes(body.leadStatus as (typeof LEAD_STATUSES)[number])) {
        return NextResponse.json({ error: "Status lead tidak valid" }, { status: 400 })
      }
      data.leadStatus = body.leadStatus
      data.leadManual = body.leadStatus !== "none"
      leadChanged = true
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Tidak ada perubahan yang dikirim" }, { status: 400 })
    }

    const contact = await db.contact.update({ where: { id }, data })

    if (aiToggled) {
      await db.activityLog.create({
        data: {
          type: "settings",
          level: "info",
          message: `${contact.aiEnabled ? "🤖 AI diaktifkan" : "⏸️ AI dimatikan"} untuk ${
            contact.name || "+" + contact.number
          } dari dashboard — AI ${contact.aiEnabled ? "hanya membalas pesan baru yang masuk" : "tidak akan membalas chat ini"}.`,
          meta: JSON.stringify({ jid: contact.jid, aiEnabled: contact.aiEnabled }),
        },
      })
    }

    if (leadChanged) {
      await db.activityLog.create({
        data: {
          type: "message",
          level: "info",
          message: `Status lead ${contact.name || "+" + contact.number} diatur manual: ${
            LEAD_LABEL[contact.leadStatus as (typeof LEAD_STATUSES)[number]] ?? contact.leadStatus
          }`,
          meta: JSON.stringify({ jid: contact.jid, leadStatus: contact.leadStatus }),
        },
      })
    }

    return NextResponse.json({
      ...contact,
      aiPausedUntil: contact.aiPausedUntil ? contact.aiPausedUntil.toISOString() : null,
      aiSummary: contact.aiSummary,
      aiSummaryAt: contact.aiSummaryAt ? contact.aiSummaryAt.toISOString() : null,
      lastMessageAt: contact.lastMessageAt?.toISOString() ?? null,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("PATCH /api/chats/[id] error:", error)
    return NextResponse.json({ error: "Gagal memperbarui kontak" }, { status: 500 })
  }
}
