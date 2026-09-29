import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"
import { DAY_NAMES, describeSchedule, getStatusDetail, normalizeSchedule } from "@/lib/business-hours"
import type { DaySchedule } from "@/lib/business-hours"

export const runtime = "nodejs"

/** Pastikan 7 baris BusinessHour ada di DB (isi default bila belum) */
async function ensureRows(): Promise<DaySchedule[]> {
  const rows = await db.businessHour.findMany()
  if (rows.length < 7) {
    const existing = new Set(rows.map((r) => r.dayOfWeek))
    const missing: number[] = []
    for (let d = 0; d <= 6; d++) if (!existing.has(d)) missing.push(d)
    if (missing.length > 0) {
      await db.businessHour.createMany({
        data: missing.map((d) => ({ dayOfWeek: d, isOpen: true, openMinute: 0, closeMinute: 1439 })),
      })
    }
  }
  return normalizeSchedule(await db.businessHour.findMany())
}

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const days = await ensureRows()
    return NextResponse.json({
      days,
      summary: describeSchedule(days),
      status: getStatusDetail(days),
    })
  } catch (error) {
    console.error("GET /api/business-hours error:", error)
    return NextResponse.json({ error: "Gagal memuat jam operasional" }, { status: 500 })
  }
}

interface IncomingDay {
  dayOfWeek?: unknown
  isOpen?: unknown
  openMinute?: unknown
  closeMinute?: unknown
}

export async function PUT(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const body = (await req.json()) as { days?: IncomingDay[] }
    const incoming = Array.isArray(body.days) ? body.days : []

    // Validasi ketat: tepat 7 hari, dayOfWeek 0-6 unik, menit 0-1439, buka → open < close
    if (incoming.length !== 7) {
      return NextResponse.json({ error: "Jadwal harus terdiri dari 7 hari" }, { status: 400 })
    }
    const seen = new Set<number>()
    for (const d of incoming) {
      const dow = Number(d.dayOfWeek)
      if (!Number.isInteger(dow) || dow < 0 || dow > 6 || seen.has(dow)) {
        return NextResponse.json({ error: "Hari tidak valid (0-6, tanpa duplikat)" }, { status: 400 })
      }
      seen.add(dow)
      if (typeof d.isOpen !== "boolean") {
        return NextResponse.json({ error: `Status buka ${DAY_NAMES[dow]} tidak valid` }, { status: 400 })
      }
      const open = Number(d.openMinute)
      const close = Number(d.closeMinute)
      if (!Number.isInteger(open) || !Number.isInteger(close) || open < 0 || open > 1439 || close < 0 || close > 1439) {
        return NextResponse.json({ error: `Jam ${DAY_NAMES[dow]} harus 0-1439 menit` }, { status: 400 })
      }
      if (d.isOpen && open >= close) {
        return NextResponse.json(
          { error: `Jam buka ${DAY_NAMES[dow]} harus lebih awal dari jam tutup` },
          { status: 400 }
        )
      }
    }

    const days: DaySchedule[] = incoming.map((d) => ({
      dayOfWeek: Number(d.dayOfWeek),
      isOpen: d.isOpen as boolean,
      openMinute: Number(d.openMinute),
      closeMinute: Number(d.closeMinute),
    }))

    await db.$transaction(
      days.map((d) =>
        db.businessHour.upsert({
          where: { dayOfWeek: d.dayOfWeek },
          update: { isOpen: d.isOpen, openMinute: d.openMinute, closeMinute: d.closeMinute },
          create: { dayOfWeek: d.dayOfWeek, isOpen: d.isOpen, openMinute: d.openMinute, closeMinute: d.closeMinute },
        })
      )
    )

    const summary = describeSchedule(days)
    await db.activityLog.create({
      data: {
        type: "settings",
        level: "success",
        message: `Jam operasional diperbarui — ${summary}`,
      },
    })

    return NextResponse.json({ days, summary, status: getStatusDetail(days) })
  } catch (error) {
    console.error("PUT /api/business-hours error:", error)
    return NextResponse.json({ error: "Gagal menyimpan jam operasional" }, { status: 500 })
  }
}
