import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

const STRING_KEYS = [
  "businessName",
  "ownerName",
  "assistantName",
  "persona",
  "workHoursStart",
  "workHoursEnd",
  "awayMessage",
  "greetingMessage",
] as const

const BOOL_KEYS = [
  "autoReplyEnabled",
  "outsideHoursReply",
  "typingIndicator",
  "transcribeVoice",
  "visionImages",
  "visionDocuments",
  "leadDetection",
  "handoverEnabled",
] as const

const NUMBER_KEYS = ["replyDelayMin", "replyDelayMax", "contextMessages", "handoverMinutes"] as const

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    let settings = await db.aiSetting.findUnique({ where: { id: "main" } })
    if (!settings) {
      settings = await db.aiSetting.create({ data: { id: "main" } })
    }
    return NextResponse.json(settings)
  } catch (error) {
    console.error("GET /api/settings error:", error)
    return NextResponse.json({ error: "Gagal memuat pengaturan" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const body = (await req.json()) as Record<string, unknown>

    let existing = await db.aiSetting.findUnique({ where: { id: "main" } })
    if (!existing) {
      existing = await db.aiSetting.create({ data: { id: "main" } })
    }

    const data: Record<string, string | number | boolean> = {}

    for (const key of STRING_KEYS) {
      if (typeof body[key] === "string") data[key] = (body[key] as string).slice(0, 4000)
    }
    for (const key of BOOL_KEYS) {
      if (typeof body[key] === "boolean") data[key] = body[key] as boolean
    }
    for (const key of NUMBER_KEYS) {
      if (body[key] !== undefined) {
        const num = Number(body[key])
        if (!Number.isFinite(num)) {
          return NextResponse.json({ error: `Nilai ${key} tidak valid` }, { status: 400 })
        }
        data[key] = Math.trunc(num)
      }
    }

    // Validasi rentang
    if (typeof data.replyDelayMin === "number" && (data.replyDelayMin < 0 || data.replyDelayMin > 60)) {
      return NextResponse.json({ error: "Jeda balas minimal harus 0-60 detik" }, { status: 400 })
    }
    if (typeof data.replyDelayMax === "number" && (data.replyDelayMax < 0 || data.replyDelayMax > 60)) {
      return NextResponse.json({ error: "Jeda balas maksimal harus 0-60 detik" }, { status: 400 })
    }
    if (
      typeof data.replyDelayMin === "number" &&
      typeof data.replyDelayMax === "number" &&
      data.replyDelayMin > data.replyDelayMax
    ) {
      return NextResponse.json({ error: "Jeda minimal tidak boleh lebih besar dari jeda maksimal" }, { status: 400 })
    }
    if (typeof data.contextMessages === "number" && (data.contextMessages < 5 || data.contextMessages > 50)) {
      return NextResponse.json({ error: "Konteks pesan harus 5-50" }, { status: 400 })
    }
    if (typeof data.handoverMinutes === "number" && (data.handoverMinutes < 5 || data.handoverMinutes > 240)) {
      return NextResponse.json({ error: "Durasi jeda ambil alih harus 5-240 menit" }, { status: 400 })
    }
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/
    if (typeof data.workHoursStart === "string" && !timeRe.test(data.workHoursStart)) {
      return NextResponse.json({ error: "Format jam mulai tidak valid (HH:MM)" }, { status: 400 })
    }
    if (typeof data.workHoursEnd === "string" && !timeRe.test(data.workHoursEnd)) {
      return NextResponse.json({ error: "Format jam selesai tidak valid (HH:MM)" }, { status: 400 })
    }

    const settings = await db.aiSetting.update({ where: { id: "main" }, data })

    await db.activityLog.create({
      data: { type: "settings", level: "success", message: "Pengaturan AI diperbarui" },
    })

    return NextResponse.json(settings)
  } catch (error) {
    console.error("PUT /api/settings error:", error)
    return NextResponse.json({ error: "Gagal menyimpan pengaturan" }, { status: 500 })
  }
}
