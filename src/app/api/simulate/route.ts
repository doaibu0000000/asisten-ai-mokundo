import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"
import { buildSystemPrompt, fixStaleCurrentTime, humanizeTone, AI_MODEL } from "@/lib/ai-prompt"
import { normalizeSchedule } from "@/lib/business-hours"

export const runtime = "nodejs"

interface HistoryItem {
  role: "user" | "assistant"
  content: string
}

export async function POST(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked
    const body = (await req.json()) as { history?: HistoryItem[]; contactName?: string }

    const history = Array.isArray(body.history) ? body.history : []
    // Validasi: hanya role user/assistant, content string, buang yang kosong
    const cleanHistory = history
      .filter(
        (m): m is HistoryItem =>
          !!m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content.trim() }))

    if (cleanHistory.length === 0) {
      return NextResponse.json({ error: "Riwayat percakapan kosong" }, { status: 400 })
    }

    let settings = await db.aiSetting.findUnique({ where: { id: "main" } })
    if (!settings) {
      settings = await db.aiSetting.create({ data: { id: "main" } })
    }

    const knowledgeItems = await db.knowledgeItem.findMany({ where: { active: true } })
    const hoursRows = await db.businessHour.findMany()
    const systemPrompt = buildSystemPrompt(settings, knowledgeItems, normalizeSchedule(hoursRows))

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "assistant", content: systemPrompt }, ...cleanHistory],
      thinking: { type: "disabled" },
    })

    const replyRaw: string = (completion?.choices?.[0]?.message?.content ?? "").toString().trim()
    if (!replyRaw) {
      return NextResponse.json({ error: "Gagal menghasilkan balasan AI" }, { status: 500 })
    }
    // Safety net akurasi jam — koreksi bila AI menyalin jam basi dari riwayat simulasi
    // + konsistensi sapaan ("Anda" → "Kakak", gaya referensi pemilik)
    const lastUser = [...cleanHistory].reverse().find((m) => m.role === "user")?.content
    const reply = humanizeTone(fixStaleCurrentTime(replyRaw, lastUser))

    await db.activityLog
      .create({
        data: {
          type: "simulate",
          level: "success",
          message: `Simulasi AI diuji (${cleanHistory[cleanHistory.length - 1]?.role === "user" ? cleanHistory[cleanHistory.length - 1].content.slice(0, 60) : ""})`,
        },
      })
      .catch(() => null)

    return NextResponse.json({ reply })
  } catch (error) {
    console.error("POST /api/simulate error:", error)
    return NextResponse.json({ error: "Gagal menghasilkan balasan AI" }, { status: 500 })
  }
}
