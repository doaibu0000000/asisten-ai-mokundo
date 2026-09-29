import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"
import {
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryTranscript,
  parseSummaryResult,
  type SummaryTranscriptLine,
} from "@/lib/summary-prompt"
import { AI_MODEL } from "@/lib/ai-prompt"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

/**
 * POST /api/chats/[id]/summary — generate ringkasan percakapan via LLM
 * (konteks cepat untuk pemilik saat mengambil alih chat) lalu simpan ke Contact.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const { id } = await params

    const contact = await db.contact.findUnique({ where: { id } })
    if (!contact) return NextResponse.json({ error: "Kontak tidak ditemukan" }, { status: 404 })

    // 60 pesan TERBARU (desc lalu dibalik) — ringkasan harus mencerminkan posisi percakapan sekarang
    const rows = await db.message.findMany({
      where: { contactId: id },
      orderBy: { createdAt: "desc" },
      select: { fromMe: true, source: true, body: true },
      take: 60,
    })
    const messages = rows.reverse()

    const lines: SummaryTranscriptLine[] = []
    for (const m of messages) {
      const text = (m.body ?? "").trim()
      if (!text) continue
      if (!m.fromMe) {
        lines.push({ role: "klien", text })
      } else if (m.source === "ai") {
        lines.push({ role: "ai", text })
      } else if (m.source === "manual" || m.source === "owner") {
        lines.push({ role: "pemilik", text })
      } // broadcast dilewati
    }

    if (!lines.some((l) => l.role === "klien")) {
      return NextResponse.json(
        { error: "Belum ada pesan dari klien untuk diringkas" },
        { status: 400 },
      )
    }

    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "assistant", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Berikut transkrip percakapannya (urut dari paling lama):\n\n${buildSummaryTranscript(lines)}`,
        },
      ],
      thinking: { type: "disabled" },
    })
    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) {
      return NextResponse.json({ error: "AI tidak menghasilkan ringkasan — coba lagi" }, { status: 502 })
    }

    const summary = parseSummaryResult(raw)
    const updated = await db.contact.update({
      where: { id },
      data: { aiSummary: JSON.stringify(summary), aiSummaryAt: new Date() },
    })

    await db.activityLog.create({
      data: {
        type: "ai_reply",
        level: "success",
        message: `🧠 Ringkasan AI dibuat utk +${updated.number}`,
        meta: JSON.stringify({ jid: updated.jid, urgensi: summary.urgensi }),
      },
    })

    return NextResponse.json({
      ...updated,
      aiPausedUntil: updated.aiPausedUntil ? updated.aiPausedUntil.toISOString() : null,
      aiSummary: updated.aiSummary,
      aiSummaryAt: updated.aiSummaryAt ? updated.aiSummaryAt.toISOString() : null,
      lastMessageAt: updated.lastMessageAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("POST /api/chats/[id]/summary error:", error)
    return NextResponse.json({ error: "Gagal membuat ringkasan AI" }, { status: 500 })
  }
}
