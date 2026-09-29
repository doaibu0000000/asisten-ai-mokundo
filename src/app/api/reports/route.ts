import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

/**
 * GET /api/reports?days=7|30&format=json|csv
 *
 * Laporan & analitik agregat: KPI + tren vs periode sebelumnya, seri harian,
 * aktivitas per jam (Asia/Jakarta), distribusi lead, kontak teraktif,
 * performa broadcast (termasuk reply-rate), dan mix tipe pesan.
 * format=csv → unduhan ringkasan Excel-friendly (BOM + separator ;).
 */

const TZ = "Asia/Jakarta" // WIB — zona pemilik bisnis (Kalijati, Subang)

// Format tanggal "YYYY-MM-DD" zona Jakarta (en-CA → ISO-like)
const fmtDateKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
// Nama hari singkat Bahasa Indonesia
const fmtDayName = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "short" })
// Jam 2 digit 24 jam zona Jakarta
const fmtHour = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false })

function dateKey(d: Date): string {
  return fmtDateKey.format(d) // "2026-09-25"
}

function hourKey(d: Date): number {
  return Number(fmtHour.format(d)) // 0..23
}

/** Tepat tengah malam Jakarta (UTC+7, tanpa DST) utk key "YYYY-MM-DD" */
function jakartaMidnight(key: string): Date {
  return new Date(`${key}T00:00:00+07:00`)
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null // baseline nol → naik 100% bila ada aktivitas
  return Math.round(((current - previous) / previous) * 100)
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value)
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const BROADCAST_STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  terjadwal: "Terjadwal",
  mengirim: "Mengirim",
  terkirim: "Terkirim",
  dibatalkan: "Dibatalkan",
}

const REPLY_WINDOW_MS = 72 * 3_600_000 // balasan klien dihitung ≤ 72 jam setelah broadcast terkirim

interface BroadcastItem {
  id: string
  name: string
  status: string
  totalCount: number
  sentCount: number
  failedCount: number
  sentAt: string | null
  replies: number
}

/** Parse aman snapshot penerima broadcast → daftar jid */
function parseRecipientJids(recipientsJson: string): string[] {
  try {
    const list = JSON.parse(recipientsJson || "[]") as Array<{ jid?: string }>
    return list.map((r) => r?.jid).filter((j): j is string => typeof j === "string" && !!j)
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked

    const { searchParams } = new URL(req.url)
    const format = searchParams.get("format") === "csv" ? "csv" : "json"
    let days = Number(searchParams.get("days") ?? "7")
    if (!Number.isFinite(days)) days = 7
    days = Math.min(Math.max(Math.round(days), 1), 90)

    const now = new Date()

    // --- Batas periode (tepat tengah malam WIB hari pertama) ---
    const earliestKey = dateKey(new Date(now.getTime() - (days - 1) * 86_400_000))
    const periodStart = jakartaMidnight(earliestKey)
    const prevStart = new Date(periodStart.getTime() - days * 86_400_000) // periode pembanding sama panjang

    // --- Ambil data mentah ---
    const [messages, prevMessages, contactsTotal, newContactRows, leadGroups, broadcastRows, handoverCount, prevHandoverCount] =
      await Promise.all([
        db.message.findMany({
          where: { createdAt: { gte: periodStart } },
          select: { contactId: true, source: true, msgType: true, fromMe: true, createdAt: true },
        }),
        db.message.findMany({
          where: { createdAt: { gte: prevStart, lt: periodStart } },
          select: { contactId: true, source: true, fromMe: true },
        }),
        db.contact.count(),
        db.contact.findMany({
          where: { createdAt: { gte: periodStart } },
          select: { createdAt: true },
        }),
        db.contact.groupBy({ by: ["leadStatus"], _count: { _all: true } }),
        db.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
        db.activityLog.count({
          where: { createdAt: { gte: periodStart }, type: "ai_reply", message: { contains: "AI dijeda" } },
        }),
        db.activityLog.count({
          where: { createdAt: { gte: prevStart, lt: periodStart }, type: "ai_reply", message: { contains: "AI dijeda" } },
        }),
      ])
    const prevNewContacts = await db.contact.count({ where: { createdAt: { gte: prevStart, lt: periodStart } } })

    // --- KPI periode ---
    const clientMessages = messages.filter((m) => !m.fromMe && m.source === "client").length
    const aiReplies = messages.filter((m) => m.source === "ai").length
    const manualMessages = messages.filter((m) => m.source === "manual" || m.source === "owner").length
    const activeContactIds = new Set(messages.map((m) => m.contactId))
    const newContacts = newContactRows.length
    const handovers = handoverCount
    const aiRatio = clientMessages > 0 ? Math.round((aiReplies / clientMessages) * 100) : null

    // --- KPI periode sebelumnya (pembanding tren) ---
    const prevTotal = prevMessages.length
    const prevClient = prevMessages.filter((m) => !m.fromMe && m.source === "client").length
    const prevAi = prevMessages.filter((m) => m.source === "ai").length
    const prevActive = new Set(prevMessages.map((m) => m.contactId)).size

    // --- Seri harian (isi hari kosong) ---
    const dailyBuckets = new Map<
      string,
      { date: string; day: string; client: number; ai: number; manual: number; total: number; newContacts: number }
    >()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86_400_000)
      const key = dateKey(d)
      const [, m, day] = key.split("-")
      dailyBuckets.set(key, {
        date: `${day}/${m}`,
        day: fmtDayName.format(d),
        client: 0,
        ai: 0,
        manual: 0,
        total: 0,
        newContacts: 0,
      })
    }
    for (const m of messages) {
      const bucket = dailyBuckets.get(dateKey(m.createdAt))
      if (!bucket) continue
      bucket.total += 1
      if (!m.fromMe && m.source === "client") bucket.client += 1
      else if (m.source === "ai") bucket.ai += 1
      else if (m.source === "manual" || m.source === "owner") bucket.manual += 1
    }
    for (const c of newContactRows) {
      const bucket = dailyBuckets.get(dateKey(c.createdAt))
      if (bucket) bucket.newContacts += 1
    }
    const daily = Array.from(dailyBuckets.values())

    // --- Aktivitas klien per jam (kapan pelanggan menghubungi) ---
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, client: 0 }))
    for (const m of messages) {
      if (!m.fromMe && m.source === "client") hourly[hourKey(m.createdAt)].client += 1
    }
    const peakHourEntry = hourly.reduce((best, cur) => (cur.client > best.client ? cur : best), { hour: -1, client: 0 })
    const peakHour = peakHourEntry.client > 0 ? peakHourEntry.hour : null

    // --- Distribusi lead (semua waktu) ---
    const leads: Record<string, number> = { none: 0, baru: 0, potensial: 0, hot: 0, selesai: 0 }
    for (const g of leadGroups) {
      if (g.leadStatus in leads) leads[g.leadStatus] = g._count._all
    }

    // --- Kontak teraktif (pesan periode ini) ---
    const countByContact = new Map<string, { total: number; client: number }>()
    for (const m of messages) {
      const entry = countByContact.get(m.contactId) ?? { total: 0, client: 0 }
      entry.total += 1
      if (!m.fromMe && m.source === "client") entry.client += 1
      countByContact.set(m.contactId, entry)
    }
    const topIds = Array.from(countByContact.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)
      .map(([id]) => id)
    const topContactRows = topIds.length
      ? await db.contact.findMany({
          where: { id: { in: topIds } },
          select: { id: true, name: true, number: true, isGroup: true, leadStatus: true, lastMessageAt: true },
        })
      : []
    const topContacts = topIds
      .map((id) => {
        const row = topContactRows.find((r) => r.id === id)
        if (!row) return null
        const counts = countByContact.get(id)!
        return {
          id: row.id,
          name: row.name,
          number: row.number,
          isGroup: row.isGroup,
          leadStatus: row.leadStatus,
          messageCount: counts.total,
          clientMessages: counts.client,
          lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    // --- Mix tipe pesan (periode ini) ---
    const media: Record<string, number> = { text: 0, image: 0, audio: 0, video: 0, document: 0, other: 0 }
    for (const m of messages) {
      const key = m.msgType in media ? m.msgType : "other"
      media[key] += 1
    }

    // --- Performa broadcast + reply-rate (balasan klien ≤ 72 jam setelah kirim) ---
    const sentBroadcasts = broadcastRows.filter(
      (b) => (b.status === "terkirim" || b.status === "mengirim") && b.sentAt,
    )
    let broadcastReplies = 0
    let recipientsTotal = 0
    let replyMessages: Array<{ contactId: string; createdAt: Date }> = []
    let jidToId = new Map<string, string>()

    if (sentBroadcasts.length > 0) {
      const jidSet = new Set<string>()
      const recipientJidsPerBroadcast = sentBroadcasts.map((b) => {
        const jids = parseRecipientJids(b.recipients)
        for (const j of jids) jidSet.add(j)
        return jids
      })
      const earliestSent = Math.min(...sentBroadcasts.map((b) => b.sentAt!.getTime()))
      const [replies, recipientContacts] = await Promise.all([
        db.message.findMany({
          where: {
            source: "client",
            fromMe: false,
            createdAt: { gte: new Date(earliestSent) },
            contact: { jid: { in: Array.from(jidSet) } },
          },
          select: { contactId: true, createdAt: true },
        }),
        db.contact.findMany({
          where: { jid: { in: Array.from(jidSet) } },
          select: { id: true, jid: true },
        }),
      ])
      replyMessages = replies
      jidToId = new Map(recipientContacts.map((c) => [c.jid, c.id]))
      recipientsTotal = sentBroadcasts.reduce((sum, b) => sum + b.totalCount, 0)
      void recipientJidsPerBroadcast
    }

    const broadcastItems: BroadcastItem[] = broadcastRows.map((b) => {
      let replies = 0
      if ((b.status === "terkirim" || b.status === "mengirim") && b.sentAt) {
        const jids = parseRecipientJids(b.recipients)
        const recipientIds = new Set(jids.map((j) => jidToId.get(j)).filter(Boolean) as string[])
        const sentTime = b.sentAt.getTime()
        for (const rm of replyMessages) {
          if (
            rm.createdAt.getTime() >= sentTime &&
            rm.createdAt.getTime() <= sentTime + REPLY_WINDOW_MS &&
            recipientIds.has(rm.contactId)
          ) {
            replies += 1
          }
        }
        broadcastReplies += replies
      }
      return {
        id: b.id,
        name: b.name,
        status: b.status,
        totalCount: b.totalCount,
        sentCount: b.sentCount,
        failedCount: b.failedCount,
        sentAt: b.sentAt ? b.sentAt.toISOString() : null,
        replies,
      }
    })
    const visibleItems = broadcastItems
      .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? "") || b.id.localeCompare(a.id))
      .slice(0, 6)
    const sentDone = broadcastRows.filter((b) => b.status === "terkirim").length
    const replyRate = recipientsTotal > 0 ? Math.round((broadcastReplies / recipientsTotal) * 100) : null

    const payload = {
      days,
      start: periodStart.toISOString(),
      end: now.toISOString(),
      generatedAt: now.toISOString(),
      kpis: {
        messagesTotal: messages.length,
        clientMessages,
        outgoingMessages: aiReplies + manualMessages,
        aiReplies,
        manualMessages,
        newContacts,
        activeContacts: activeContactIds.size,
        handovers,
        aiRatio,
        contactsTotal,
      },
      deltas: {
        messages: pctChange(messages.length, prevTotal),
        client: pctChange(clientMessages, prevClient),
        ai: pctChange(aiReplies, prevAi),
        newContacts: pctChange(newContacts, prevNewContacts),
        activeContacts: pctChange(activeContactIds.size, prevActive),
        handovers: pctChange(handovers, prevHandoverCount),
      },
      daily,
      hourly,
      peakHour,
      leads,
      topContacts,
      broadcasts: {
        total: broadcastRows.length,
        sentCount: sentDone,
        recipients: recipientsTotal,
        replies: broadcastReplies,
        replyRate,
        items: visibleItems,
      },
      media,
    }

    if (format === "csv") {
      const rows: string[] = []
      const periodLabel = `${daily[0]?.date ?? ""} – ${daily[daily.length - 1]?.date ?? ""}`
      rows.push(["Laporan Mukundo AI", periodLabel].map(csvCell).join(";"))
      rows.push("")
      rows.push("RINGKASAN (KPI)")
      rows.push(["Metrik", "Nilai", "vs periode sebelumnya"].map(csvCell).join(";"))
      const deltaText = (d: number | null) => (d === null ? "—" : `${d >= 0 ? "+" : ""}${d}%`)
      rows.push(["Total pesan", payload.kpis.messagesTotal, deltaText(payload.deltas.messages)].map(csvCell).join(";"))
      rows.push(["Pesan klien masuk", payload.kpis.clientMessages, deltaText(payload.deltas.client)].map(csvCell).join(";"))
      rows.push(["Balasan AI", payload.kpis.aiReplies, deltaText(payload.deltas.ai)].map(csvCell).join(";"))
      rows.push(["Balasan manual/pemilik", payload.kpis.manualMessages, ""].map(csvCell).join(";"))
      rows.push(["Kontak baru", payload.kpis.newContacts, deltaText(payload.deltas.newContacts)].map(csvCell).join(";"))
      rows.push(["Kontak aktif", payload.kpis.activeContacts, deltaText(payload.deltas.activeContacts)].map(csvCell).join(";"))
      rows.push(["Ambil alih manual (jeda AI)", payload.kpis.handovers, deltaText(payload.deltas.handovers)].map(csvCell).join(";"))
      rows.push(
        ["Rasio balasan AI", payload.kpis.aiRatio === null ? "—" : `${payload.kpis.aiRatio}%`, ""]
          .map(csvCell)
          .join(";"),
      )
      rows.push("")
      rows.push("AKTIVITAS HARIAN")
      rows.push(["Tanggal", "Hari", "Pesan klien", "Balasan AI", "Manual", "Total", "Kontak baru"].map(csvCell).join(";"))
      for (const d of daily) {
        rows.push([d.date, d.day, d.client, d.ai, d.manual, d.total, d.newContacts].map(csvCell).join(";"))
      }
      rows.push("")
      if (topContacts.length > 0) {
        rows.push("KONTAK TERAKTIF")
        rows.push(
          ["Nama", "Nomor", "Status lead", "Total pesan", "Pesan klien", "Aktivitas terakhir"].map(csvCell).join(";"),
        )
        for (const c of topContacts) {
          rows.push(
            [c.name || "(tanpa nama)", `+${c.number}`, c.leadStatus, c.messageCount, c.clientMessages, c.lastMessageAt ?? ""]
              .map(csvCell)
              .join(";"),
          )
        }
        rows.push("")
      }
      if (visibleItems.length > 0) {
        rows.push("BROADCAST")
        rows.push(["Nama", "Status", "Penerima", "Terkirim", "Gagal", "Balasan", "Waktu kirim"].map(csvCell).join(";"))
        for (const b of visibleItems) {
          rows.push(
            [
              b.name,
              BROADCAST_STATUS_LABEL[b.status] ?? b.status,
              b.totalCount,
              b.sentCount,
              b.failedCount,
              b.replies,
              b.sentAt ?? "",
            ]
              .map(csvCell)
              .join(";"),
          )
        }
      }

      const csv = "\uFEFF" + rows.join("\r\n") + "\r\n"
      const stamp = new Date().toISOString().slice(0, 10)
      await db.activityLog.create({
        data: {
          type: "settings",
          level: "success",
          message: `Laporan analitik ${days} hari diekspor ke CSV (${payload.kpis.messagesTotal} pesan).`,
        },
      })
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="laporan-analitik-mukundo-${days}h-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      })
    }

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("GET /api/reports error:", error)
    return NextResponse.json({ error: "Gagal memuat laporan" }, { status: 500 })
  }
}
