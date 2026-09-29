import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

/** Escape nilai CSV (quote bila ada ; " atau newline) */
function csvCell(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value)
  if (/[";\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"` // escape quote ganda
  }
  return s
}

const SOURCE_LABEL: Record<string, string> = {
  client: "Klien",
  ai: "AI",
  manual: "Manual",
  owner: "Pemilik",
}

const TYPE_LABEL: Record<string, string> = {
  text: "Teks",
  image: "Foto",
  audio: "Pesan Suara",
  video: "Video",
  sticker: "Stiker",
  document: "Dokumen",
  location: "Lokasi",
  contact: "Kontak",
  poll: "Polling",
  unknown: "Lainnya",
}

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

const LEAD_LABEL: Record<string, string> = {
  none: "Belum ada",
  baru: "Baru",
  potensial: "Potensial",
  hot: "HOT",
  selesai: "Selesai",
}

/**
 * GET /api/export — laporan percakapan CSV (Excel-friendly: BOM + separator ;)
 * Query: contactId (opsional, export satu chat), lead (opsional filter lead status)
 */
export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const { searchParams } = new URL(req.url)
    const contactId = searchParams.get("contactId")?.trim() || null
    const lead = searchParams.get("lead")?.trim() || null

    const where =
      contactId || (lead && lead !== "all")
        ? {
            ...(contactId ? { contactId } : {}),
            ...(lead && lead !== "all" ? { contact: { leadStatus: lead } } : {}),
          }
        : undefined

    const messages = await db.message.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { contact: true },
    })

    const rows: string[] = []
    rows.push(["Tanggal", "Kontak", "Nomor", "Arah", "Sumber", "Tipe", "Status Lead", "Pesan"].map(csvCell).join(";"))

    for (const m of messages) {
      rows.push(
        [
          DATE_FMT.format(m.createdAt),
          m.contact.name || "(tanpa nama)",
          "+" + m.contact.number,
          m.fromMe ? "Keluar" : "Masuk",
          SOURCE_LABEL[m.source] ?? m.source,
          TYPE_LABEL[m.msgType] ?? m.msgType,
          LEAD_LABEL[m.contact.leadStatus] ?? m.contact.leadStatus,
          m.body?.trim() ? m.body.replace(/\s+/g, " ").slice(0, 2000) : `[${TYPE_LABEL[m.msgType] ?? m.msgType}]`,
        ]
          .map(csvCell)
          .join(";"),
      )
    }

    const csv = "\uFEFF" + rows.join("\r\n") + "\r\n" // BOM UTF-8 agar Excel benar
    const stamp = new Date().toISOString().slice(0, 10)

    await db.activityLog.create({
      data: {
        type: "settings",
        level: "success",
        message: `Laporan ${messages.length} pesan diekspor ke CSV${contactId ? " (satu percakapan)" : " (semua)"}.`,
      },
    })

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="laporan-chat-mukundo-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("GET /api/export error:", error)
    return NextResponse.json({ error: "Gagal mengekspor laporan" }, { status: 500 })
  }
}
