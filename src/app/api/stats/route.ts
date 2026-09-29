import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const start7Days = new Date(now)
    start7Days.setDate(start7Days.getDate() - 6)
    start7Days.setHours(0, 0, 0, 0)

    const [contactsTotal, messagesTotal, aiRepliesTotal, aiRepliesToday, messagesToday, recent] =
      await Promise.all([
        db.contact.count(),
        db.message.count(),
        db.message.count({ where: { source: "ai" } }),
        db.message.count({ where: { source: "ai", createdAt: { gte: startOfToday } } }),
        db.message.count({ where: { createdAt: { gte: startOfToday } } }),
        db.message.findMany({
          where: { createdAt: { gte: start7Days } },
          select: { createdAt: true, source: true },
        }),
      ])

    // Bangun 7 hari terakhir (termasuk hari ini)
    const buckets = new Map<string, { day: string; date: string; messages: number; ai: number }>()
    for (let i = 0; i < 7; i++) {
      const d = new Date(start7Days)
      d.setDate(start7Days.getDate() + i)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      buckets.set(key, {
        day: DAY_NAMES[d.getDay()],
        date: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
        messages: 0,
        ai: 0,
      })
    }

    for (const m of recent) {
      const key = `${m.createdAt.getFullYear()}-${m.createdAt.getMonth()}-${m.createdAt.getDate()}`
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.messages += 1
        if (m.source === "ai") bucket.ai += 1
      }
    }

    return NextResponse.json({
      contactsTotal,
      messagesTotal,
      aiRepliesTotal,
      aiRepliesToday,
      messagesToday,
      last7days: Array.from(buckets.values()),
    })
  } catch (error) {
    console.error("GET /api/stats error:", error)
    return NextResponse.json({ error: "Gagal memuat statistik" }, { status: 500 })
  }
}
