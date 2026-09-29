import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

/**
 * GET /api/onboarding — status langkah "Panduan Awal" bagi pengguna baru.
 * Semua langkah diturunkan dari data nyata (tanpa tabel baru):
 * - whatsapp   : WaSession.status === "connected"
 * - simulator  : pernah ada log aktivitas type "simulate"
 * - knowledge  : ada item pengetahuan aktif
 * - personalize: persona asisten terisi
 * - chat       : ada kontak (non-grup) tercatat
 */
export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked

    const [session, knowledgeCount, simulateCount, contactCount, settings] = await Promise.all([
      db.waSession.findUnique({ where: { id: "main" }, select: { status: true } }),
      db.knowledgeItem.count({ where: { active: true } }),
      db.activityLog.count({ where: { type: "simulate" } }),
      db.contact.count({ where: { isGroup: false } }),
      db.aiSetting.findUnique({ where: { id: "main" }, select: { persona: true } }),
    ])

    const whatsappConnected = session?.status === "connected"
    const steps = [
      { id: "whatsapp", done: whatsappConnected },
      { id: "simulator", done: simulateCount > 0 },
      { id: "knowledge", done: knowledgeCount > 0 },
      { id: "personalize", done: (settings?.persona ?? "").trim().length > 0 },
      { id: "chat", done: contactCount > 0 },
    ] as const

    return NextResponse.json({
      steps,
      counts: { knowledge: knowledgeCount, chats: contactCount },
      whatsappConnected,
      completed: steps.filter((s) => s.done).length,
      total: steps.length,
    })
  } catch (error) {
    console.error("GET /api/onboarding error:", error)
    return NextResponse.json({ error: "Gagal memuat panduan awal" }, { status: 500 })
  }
}
