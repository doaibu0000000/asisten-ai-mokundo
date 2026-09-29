import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertUnlocked } from "@/lib/pin-auth"

export const runtime = "nodejs"

/**
 * API Cadangan ("backup") Asisten AI — jaminan pengetahuan tidak hilang:
 * - GET  /api/backup → unduh JSON berisi seluruh basis pengetahuan + pengaturan AI + jam operasional
 * - POST /api/backup → pulihkan dari file cadangan (gabungkan: perbarui yang sama, tambah yang baru)
 *
 * Catatan keamanan: tidak pernah menyertakan pinHash/pinEnabled (PIN dashboard) dan
 * tidak menyentuh data privat (kontak, pesan, sesi WhatsApp).
 */

const BACKUP_VERSION = 1

/** Field pengaturan AI yang boleh dicadangkan/dipulihkan (PIN & identitas sensitif dikecualikan) */
const STRING_KEYS = [
  "businessName",
  "ownerName",
  "assistantName",
  "persona",
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

interface BackupKnowledgeItem {
  category: string
  title: string
  content: string
  keywords?: string | null
  active?: boolean
  sortOrder?: number
}

interface BackupBusinessDay {
  dayOfWeek: number
  isOpen: boolean
  openMinute: number
  closeMinute: number
}

interface BackupPayload {
  version?: number
  app?: string
  exportedAt?: string
  aiSettings?: Record<string, unknown>
  knowledgeItems?: BackupKnowledgeItem[]
  businessHours?: BackupBusinessDay[]
}

export async function GET(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked

    const [settings, knowledgeItems, businessHours] = await Promise.all([
      db.aiSetting.findUnique({ where: { id: "main" } }),
      db.knowledgeItem.findMany({ orderBy: { sortOrder: "asc" } }),
      db.businessHour.findMany({ orderBy: { dayOfWeek: "asc" } }),
    ])

    // Sanitasi pengaturan: buang kolom sensitif (PIN dashboard) & metadata internal
    const safeSettings: Record<string, unknown> = {}
    if (settings) {
      for (const key of STRING_KEYS) if (typeof settings[key] === "string") safeSettings[key] = settings[key]
      for (const key of BOOL_KEYS) if (typeof settings[key] === "boolean") safeSettings[key] = settings[key]
      for (const key of NUMBER_KEYS) if (typeof settings[key] === "number") safeSettings[key] = settings[key]
    }

    return NextResponse.json({
      version: BACKUP_VERSION,
      app: "mukundo-ai",
      exportedAt: new Date().toISOString(),
      aiSettings: safeSettings,
      knowledgeItems: knowledgeItems.map((k) => ({
        category: k.category,
        title: k.title,
        content: k.content,
        keywords: k.keywords,
        active: k.active,
        sortOrder: k.sortOrder,
      })),
      businessHours: businessHours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        isOpen: h.isOpen,
        openMinute: h.openMinute,
        closeMinute: h.closeMinute,
      })),
    })
  } catch (error) {
    console.error("GET /api/backup error:", error)
    return NextResponse.json({ error: "Gagal membuat cadangan" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked

    const body = (await req.json()) as BackupPayload

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "File cadangan tidak valid" }, { status: 400 })
    }
    if (!Array.isArray(body.knowledgeItems)) {
      return NextResponse.json({ error: "File cadangan tidak berisi basis pengetahuan" }, { status: 400 })
    }

    const summary = { restored: 0, created: 0, updated: 0, settings: false, businessHours: false }

    // 1) Basis pengetahuan — gabungkan per judul (aman: tidak menghapus item yang tidak ada di cadangan)
    for (const [i, item] of body.knowledgeItems.entries()) {
      if (!item || typeof item.title !== "string" || !item.title.trim() || typeof item.content !== "string") {
        continue // lewati entry rusak
      }
      const data = {
        category: typeof item.category === "string" && item.category.trim() ? item.category.trim().slice(0, 40) : "info",
        title: item.title.trim().slice(0, 200),
        content: item.content.slice(0, 4000),
        keywords: typeof item.keywords === "string" ? item.keywords.slice(0, 500) : null,
        active: typeof item.active === "boolean" ? item.active : true,
        sortOrder:
          typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder) && item.sortOrder >= 0
            ? Math.min(Math.trunc(item.sortOrder), 9999)
            : i + 1,
      }
      const existing = await db.knowledgeItem.findFirst({ where: { title: data.title } })
      if (existing) {
        await db.knowledgeItem.update({ where: { id: existing.id }, data })
        summary.updated++
      } else {
        await db.knowledgeItem.create({ data })
        summary.created++
      }
      summary.restored++
    }

    // 2) Pengaturan AI — validasi sama seperti PUT /api/settings
    const s = body.aiSettings
    if (s && typeof s === "object") {
      const data: Record<string, string | number | boolean> = {}
      for (const key of STRING_KEYS) if (typeof s[key] === "string") data[key] = (s[key] as string).slice(0, 4000)
      for (const key of BOOL_KEYS) if (typeof s[key] === "boolean") data[key] = s[key] as boolean
      for (const key of NUMBER_KEYS) {
        if (s[key] !== undefined) {
          const num = Number(s[key])
          if (Number.isFinite(num)) data[key] = Math.trunc(num)
        }
      }
      if (
        typeof data.replyDelayMin === "number" &&
        typeof data.replyDelayMax === "number" &&
        data.replyDelayMin > data.replyDelayMax
      ) {
        return NextResponse.json({ error: "Jeda balas minimal melebihi maksimal di cadangan" }, { status: 400 })
      }
      if (typeof data.contextMessages === "number" && (data.contextMessages < 5 || data.contextMessages > 50)) {
        return NextResponse.json({ error: "Konteks pesan di cadangan harus 5-50" }, { status: 400 })
      }
      if (Object.keys(data).length > 0) {
        const existing = await db.aiSetting.findUnique({ where: { id: "main" } })
        if (existing) {
          await db.aiSetting.update({ where: { id: "main" }, data })
          summary.settings = true
        }
      }
    }

    // 3) Jam operasional — validasi 7 hari
    const hours = body.businessHours
    if (Array.isArray(hours) && hours.length === 7) {
      const seen = new Set<number>()
      const valid = hours.every((h) => {
        if (!h || typeof h.dayOfWeek !== "number" || seen.has(h.dayOfWeek)) return false
        if (h.dayOfWeek < 0 || h.dayOfWeek > 6) return false
        if (typeof h.isOpen !== "boolean") return false
        if (!Number.isInteger(h.openMinute) || h.openMinute < 0 || h.openMinute > 1439) return false
        if (!Number.isInteger(h.closeMinute) || h.closeMinute < 0 || h.closeMinute > 1439) return false
        seen.add(h.dayOfWeek)
        return true
      })
      if (valid) {
        for (const h of hours) {
          await db.businessHour.upsert({
            where: { dayOfWeek: h.dayOfWeek },
            update: { isOpen: h.isOpen, openMinute: h.openMinute, closeMinute: h.closeMinute },
            create: {
              dayOfWeek: h.dayOfWeek,
              isOpen: h.isOpen,
              openMinute: h.openMinute,
              closeMinute: h.closeMinute,
            },
          })
        }
        summary.businessHours = true
      }
    }

    await db.activityLog.create({
      data: {
        type: "settings",
        level: "success",
        message: `Cadangan dipulihkan: ${summary.created} pengetahuan baru, ${summary.updated} diperbarui${summary.settings ? ", pengaturan AI" : ""}${summary.businessHours ? ", jam operasional" : ""}.`,
      },
    })

    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    console.error("POST /api/backup error:", error)
    return NextResponse.json({ error: "Gagal memulihkan cadangan" }, { status: 500 })
  }
}
