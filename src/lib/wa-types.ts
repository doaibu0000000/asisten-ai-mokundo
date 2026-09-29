// Tipe data bersama antara API, socket, dan frontend — Asisten AI WhatsApp Mukundo

export type MessageSource = "client" | "ai" | "manual" | "owner" | "broadcast"

export interface MessageDTO {
  id: string
  contactId: string
  jid: string
  fromMe: boolean
  body: string
  msgType: string
  source: MessageSource
  status: string
  createdAt: string
}

export interface ContactDTO {
  id: string
  jid: string
  name: string | null
  number: string
  isGroup: boolean
  aiEnabled: boolean
  /** ISO date; null = AI normal, masa depan = AI dijeda (pemilik mengambil alih manual) */
  aiPausedUntil: string | null
  /** JSON string ringkasan percakapan dari AI (parse via parseAiSummary) — hanya di detail chat */
  aiSummary?: string | null
  /** ISO date kapan ringkasan AI terakhir dibuat */
  aiSummaryAt: string | null
  notes: string | null
  unread: number
  lastMessageAt: string | null
  lastMessageText: string | null
  lastMessageFromMe: boolean
  leadStatus: string
  leadManual: boolean
  createdAt: string
  updatedAt: string
}

export interface ChatListEntry extends ContactDTO {
  messageCount: number
}

export interface LogDTO {
  id: string
  type: string
  level: string
  message: string
  meta?: string | null
  createdAt: string
}

export type WaStatus = "disconnected" | "connecting" | "waiting_scan" | "connected"

export interface StatusOwner {
  name?: string
  number?: string
  jid?: string
}

export interface StatusObj {
  status: WaStatus
  owner?: StatusOwner
  connectedAt?: string
  reason?: string
}

export interface StatsDTO {
  contactsTotal: number
  messagesTotal: number
  aiRepliesTotal: number
  aiRepliesToday: number
  messagesToday: number
  last7days: Array<{ day: string; date: string; messages: number; ai: number }>
}

export interface SettingsDTO {
  id: string
  businessName: string
  ownerName: string
  assistantName: string
  persona: string
  autoReplyEnabled: boolean
  replyDelayMin: number
  replyDelayMax: number
  workHoursStart: string
  workHoursEnd: string
  outsideHoursReply: boolean
  awayMessage: string
  greetingMessage: string
  contextMessages: number
  typingIndicator: boolean
  transcribeVoice: boolean
  visionImages: boolean
  /** AI membaca dokumen PDF dari klien (penawaran/nota) via VLM */
  visionDocuments: boolean
  leadDetection: boolean
  /** Jeda AI otomatis saat pemilik membalas manual (ambil alih) */
  handoverEnabled: boolean
  /** Durasi jeda ambil alih (menit, 5-240) */
  handoverMinutes: number
  updatedAt: string
}

/** Status kunci dashboard PIN — GET /api/auth/state (route terbuka) */
export interface AuthState {
  pinEnabled: boolean
  pinSet: boolean
  unlocked: boolean
}

/** Panduan Awal (onboarding) — GET /api/onboarding */
export type OnboardingStepId = "whatsapp" | "simulator" | "knowledge" | "personalize" | "chat"

export interface OnboardingStepDTO {
  id: OnboardingStepId
  done: boolean
}

export interface OnboardingDTO {
  steps: OnboardingStepDTO[]
  counts: { knowledge: number; chats: number }
  whatsappConnected: boolean
  completed: number
  total: number
}

export interface KnowledgeDTO {
  id: string
  category: string
  title: string
  content: string
  keywords: string | null
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export const KNOWLEDGE_CATEGORIES = ["layanan", "harga", "faq", "info", "lainnya"] as const
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

export const LOG_TYPES = ["connection", "ai_reply", "message", "error", "settings", "knowledge", "simulate", "broadcast", "quick_reply"] as const
export const LOG_LEVELS = ["info", "success", "warn", "error"] as const

export const CATEGORY_BADGE: Record<string, string> = {
  layanan: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  harga: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25",
  faq: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/25",
  info: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/25",
  lainnya: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/25",
}

// ---------------------------------------------------------------------------
// Status lead (deteksi otomatis / diatur manual pemilik)
// ---------------------------------------------------------------------------
export const LEAD_STATUSES = ["none", "baru", "potensial", "hot", "selesai"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  none: "Belum Ada",
  baru: "Baru",
  potensial: "Potensial",
  hot: "Hot",
  selesai: "Selesai",
}

/** Kelas Tailwind badge per status lead (emerald/amber/rose/teal/zinc — tanpa indigo/blue) */
export const LEAD_STATUS_BADGE: Record<LeadStatus, string> = {
  none: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/25",
  baru: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/25",
  potensial: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  hot: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 font-semibold",
  selesai: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
}

/** Guard runtime untuk leadStatus yang datang sebagai string dari API/socket */
export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Jeda AI — ambil alih manual (human handover pause)
// ---------------------------------------------------------------------------

/** Kelas Tailwind badge "AI dijeda" (amber — beda dari semua warna lead) */
export const AI_PAUSED_BADGE =
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25"

// ---------------------------------------------------------------------------
// Ringkasan chat AI (konteks cepat utk pemilik saat ambil alih)
// ---------------------------------------------------------------------------

export type SummaryUrgency = "rendah" | "sedang" | "tinggi"

export interface AiSummaryData {
  ringkasan: string
  kebutuhan: string[]
  urgensi: SummaryUrgency
  namaKlien: string | null
  lokasi: string | null
  saran: string
}

export const URGENCY_LABEL: Record<SummaryUrgency, string> = {
  rendah: "Rendah",
  sedang: "Sedang",
  tinggi: "Tinggi",
}

export const URGENCY_ICON_LABEL: Record<SummaryUrgency, string> = {
  rendah: "Urgensi rendah — permintaan santai",
  sedang: "Urgensi sedang — menunggu tindakan",
  tinggi: "Urgensi tinggi — butuh perhatian segera",
}

/** Kelas Tailwind badge per tingkat urgensi ringkasan */
export const URGENCY_BADGE: Record<SummaryUrgency, string> = {
  rendah: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  sedang: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25",
  tinggi: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 font-semibold",
}

function isSummaryUrgency(v: unknown): v is SummaryUrgency {
  return v === "rendah" || v === "sedang" || v === "tinggi"
}

/** Parse aman JSON Contact.aiSummary — null bila rusak/kosong */
export function parseAiSummary(json: string | null | undefined): AiSummaryData | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Record<string, unknown>
    const kebutuhan = Array.isArray(raw.kebutuhan)
      ? raw.kebutuhan.filter((k): k is string => typeof k === "string" && !!k.trim()).slice(0, 4)
      : []
    return {
      ringkasan:
        typeof raw.ringkasan === "string" && raw.ringkasan.trim() ? raw.ringkasan : "(ringkasan tidak tersedia)",
      kebutuhan,
      urgensi: isSummaryUrgency(raw.urgensi) ? raw.urgensi : "sedang",
      namaKlien: typeof raw.namaKlien === "string" && raw.namaKlien.trim() ? raw.namaKlien : null,
      lokasi: typeof raw.lokasi === "string" && raw.lokasi.trim() ? raw.lokasi : null,
      saran: typeof raw.saran === "string" && raw.saran.trim() ? raw.saran : "",
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Balasan cepat (template balasan manual)
// ---------------------------------------------------------------------------
export const QUICK_REPLY_CATEGORIES = ["umum", "layanan", "jadwal", "penawaran", "lainnya"] as const
export type QuickReplyCategory = (typeof QUICK_REPLY_CATEGORIES)[number]

export interface QuickReplyDTO {
  id: string
  shortcut: string
  title: string
  content: string
  category: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Laporan & analitik (view Laporan, GET /api/reports)
// ---------------------------------------------------------------------------

export interface ReportKpis {
  messagesTotal: number
  clientMessages: number
  outgoingMessages: number
  aiReplies: number
  manualMessages: number
  newContacts: number
  activeContacts: number
  /** Berapa kali pemilik mengambil alih (AI dijeda) di periode ini */
  handovers: number
  /** Balasan AI ÷ pesan klien (persen) — null bila belum ada pesan klien */
  aiRatio: number | null
  contactsTotal: number
}

/** Perubahan persen vs periode sebelumnya sama panjang — null = tidak ada baseline */
export interface ReportDeltas {
  messages: number | null
  client: number | null
  ai: number | null
  newContacts: number | null
  activeContacts: number | null
  handovers: number | null
}

export interface ReportDailyPoint {
  /** "dd/mm" zona Jakarta */
  date: string
  /** Nama hari singkat, mis. "Sen" */
  day: string
  client: number
  ai: number
  manual: number
  total: number
  newContacts: number
}

export interface ReportHourPoint {
  hour: number
  client: number
}

export interface ReportTopContact {
  id: string
  name: string | null
  number: string
  isGroup: boolean
  leadStatus: string
  messageCount: number
  clientMessages: number
  lastMessageAt: string | null
}

export interface ReportBroadcastItem {
  id: string
  name: string
  status: string
  totalCount: number
  sentCount: number
  failedCount: number
  sentAt: string | null
  /** Balasan klien ≤ 72 jam setelah terkirim */
  replies: number
}

export interface ReportDTO {
  days: number
  start: string
  end: string
  generatedAt: string
  kpis: ReportKpis
  deltas: ReportDeltas
  daily: ReportDailyPoint[]
  hourly: ReportHourPoint[]
  peakHour: number | null
  leads: Record<string, number>
  topContacts: ReportTopContact[]
  broadcasts: {
    total: number
    sentCount: number
    recipients: number
    replies: number
    replyRate: number | null
    items: ReportBroadcastItem[]
  }
  media: Record<string, number>
}

// ---------------------------------------------------------------------------
// Broadcast promo terjadwal
// ---------------------------------------------------------------------------
export type BroadcastStatus = "draft" | "terjadwal" | "mengirim" | "terkirim" | "dibatalkan"

export const BROADCAST_STATUSES: BroadcastStatus[] = ["draft", "terjadwal", "mengirim", "terkirim", "dibatalkan"]

export const BROADCAST_STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft: "Draf",
  terjadwal: "Terjadwal",
  mengirim: "Mengirim…",
  terkirim: "Terkirim",
  dibatalkan: "Dibatalkan",
}

/** Kelas Tailwind badge per status broadcast */
export const BROADCAST_STATUS_BADGE: Record<BroadcastStatus, string> = {
  draft: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/25",
  terjadwal: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25",
  mengirim: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/25 animate-pulse",
  terkirim: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  dibatalkan: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/25",
}

export const BROADCAST_AUDIENCES = ["all", "ai", "baru", "potensial", "hot", "selesai"] as const
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number]

export const BROADCAST_AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  all: "Semua Kontak Chat",
  ai: "Kontak dengan AI Aktif",
  baru: "Lead Baru",
  potensial: "Lead Potensial",
  hot: "Lead Hot",
  selesai: "Lead Selesai",
}

export interface BroadcastRecipient {
  jid: string
  name: string
}

export interface BroadcastDTO {
  id: string
  name: string
  message: string
  status: BroadcastStatus
  audience: string
  recipients: string // JSON string [{jid, name}]
  totalCount: number
  sentCount: number
  failedCount: number
  scheduledAt: string | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Jam operasional (jadwal per-hari)                                   */
/* ------------------------------------------------------------------ */

export interface BusinessHourDTO {
  dayOfWeek: number // 0=Minggu .. 6=Sabtu
  isOpen: boolean
  openMinute: number // 0-1439
  closeMinute: number // 0-1439
}

export interface BusinessHoursResponse {
  days: BusinessHourDTO[]
  summary: string
  status: {
    open: boolean
    label: string
    detail: string
  }
}

