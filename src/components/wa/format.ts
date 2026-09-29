import { formatDistanceToNow } from "date-fns"
import { id as localeId } from "date-fns/locale"

const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" })
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" })
const fullFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" })

export function formatTime(iso: string): string {
  try {
    return timeFmt.format(new Date(iso))
  } catch {
    return ""
  }
}

export function formatDate(iso: string): string {
  try {
    return dateFmt.format(new Date(iso))
  } catch {
    return ""
  }
}

export function formatFull(iso: string): string {
  try {
    return fullFmt.format(new Date(iso))
  } catch {
    return ""
  }
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ""
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: localeId })
  } catch {
    return ""
  }
}

export function initials(name: string | null | undefined, fallback: string): string {
  const src = (name ?? "").trim()
  if (!src) return fallback
  const parts = src.split(/\s+/).slice(0, 2)
  const result = parts
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
  return result || fallback
}

const AVATAR_PALETTE = [
  "bg-emerald-600",
  "bg-teal-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-lime-700",
  "bg-cyan-800",
  "bg-stone-600",
]

export function avatarColor(seed: string): string {
  let sum = 0
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i)
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length]
}

/** Durasi terhubung, mis. "2 jam 15 menit" */
export function formatUptime(startIso: string | null | undefined, now: number = Date.now()): string | null {
  if (!startIso) return null
  const ms = now - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days} hari ${hours % 24} jam`
  if (hours > 0) return `${hours} jam ${minutes % 60} menit`
  if (minutes > 0) return `${minutes} menit`
  return "baru saja"
}

/** true bila jeda AI (ambil alih manual) masih berlaku — aiPausedUntil ada & di masa depan */
export function isAiPaused(pauseIso: string | null | undefined, now: number = Date.now()): boolean {
  if (!pauseIso) return false
  const t = new Date(pauseIso).getTime()
  return Number.isFinite(t) && t > now
}

/** Sisa waktu jeda AI sampai kedaluwarsa: "X mnt" / "X j Y mnt" / "X j" */
export function formatRemaining(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return ""
  try {
    const ms = new Date(iso).getTime() - now
    if (!Number.isFinite(ms) || ms <= 0) return "berakhir"
    const minutes = Math.max(1, Math.ceil(ms / 60000))
    const hours = Math.floor(minutes / 60)
    const restMinutes = minutes % 60
    if (hours > 0) return restMinutes > 0 ? `${hours} j ${restMinutes} mnt` : `${hours} j`
    return `${minutes} mnt`
  } catch {
    return ""
  }
}
