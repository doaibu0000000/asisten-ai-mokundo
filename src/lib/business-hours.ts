/**
 * Jadwal jam operasional — helper bersama.
 * MIROR: file ini harus identik logikanya dengan mini-services/wa-service/business-hours.ts.
 */

export interface DaySchedule {
  dayOfWeek: number // 0=Minggu, 1=Senin, ... 6=Sabtu
  isOpen: boolean
  openMinute: number // menit dari tengah malam (0-1439)
  closeMinute: number // menit dari tengah malam (0-1439)
}

export const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const

/** Urutan tampil Senin dulu (value = dayOfWeek) */
export const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

/** Default: setiap hari buka 24 jam (perilaku bawaan usaha layanan 24 jam) */
export const DEFAULT_SCHEDULE: DaySchedule[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  isOpen: true,
  openMinute: 0,
  closeMinute: 1439,
}))

const clampMinute = (m: number): number => Math.max(0, Math.min(1439, Math.trunc(m) || 0))

/** Pastikan selalu 7 hari valid — hari hilang diisi default (buka 24 jam) */
export function normalizeSchedule(rows: Array<Partial<DaySchedule>>): DaySchedule[] {
  const out: DaySchedule[] = []
  for (let d = 0; d <= 6; d++) {
    const row = rows.find((r) => Number(r.dayOfWeek) === d)
    if (row && typeof row.isOpen === "boolean") {
      const open = clampMinute(Number(row.openMinute))
      const close = clampMinute(Number(row.closeMinute))
      out.push({
        dayOfWeek: d,
        isOpen: row.isOpen,
        openMinute: row.isOpen ? open : open,
        closeMinute: row.isOpen ? Math.max(close, open) : close,
      })
    } else {
      out.push({ dayOfWeek: d, isOpen: true, openMinute: 0, closeMinute: 1439 })
    }
  }
  return out
}

/** 480 → "08.00" (format jam Indonesia) */
export function formatMinute(m: number): string {
  const mm = clampMinute(m)
  const h = Math.floor(mm / 60)
  const m2 = mm % 60
  return `${String(h).padStart(2, "0")}.${String(m2).padStart(2, "0")}`
}

/** 480 → "08:00" (untuk input type=time) */
export function minuteToHHMM(m: number): string {
  const mm = clampMinute(m)
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`
}

/** "08:00" → 480 */
export function hhmmToMinute(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || "").trim())
  if (!m) return -1
  return clampMinute(Number(m[1]) * 60 + Number(m[2]))
}

/** Waktu sekarang dalam WIB (Asia/Jakarta) */
export function getNowWIB(now: Date = new Date()): { dayOfWeek: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const parts = fmt.formatToParts(now)
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon"
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0")
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  return { dayOfWeek: wdMap[wd] ?? 1, minutes: hh * 60 + mm }
}

export function isOpenNow(days: DaySchedule[], now: Date = new Date()): boolean {
  const { dayOfWeek, minutes } = getNowWIB(now)
  const today = days.find((d) => d.dayOfWeek === dayOfWeek)
  if (!today || !today.isOpen) return false
  return minutes >= today.openMinute && minutes <= today.closeMinute
}

/** Kompres daftar hari jadi label, mis. "Senin–Sabtu" / "Senin, Rabu" / "Minggu" */
function compressDays(dayNums: number[]): string {
  const sorted = DISPLAY_ORDER.filter((d) => dayNums.includes(d))
  const runs: number[][] = []
  for (const d of sorted) {
    const last = runs[runs.length - 1]
    if (last && DISPLAY_ORDER.indexOf(d) === DISPLAY_ORDER.indexOf(last[last.length - 1] as 1) + 1) {
      last.push(d)
    } else {
      runs.push([d])
    }
  }
  return runs
    .map((r) =>
      r.length >= 3
        ? `${DAY_NAMES[r[0] as number]}–${DAY_NAMES[r[r.length - 1] as number]}`
        : r.map((d) => DAY_NAMES[d as number]).join(", ")
    )
    .join(" & ")
}

/** Ringkasan jadwal untuk manusia, mis. "Setiap hari, 24 jam" / "Senin–Sabtu 08.00–17.00 · Minggu tutup" */
export function describeSchedule(days: DaySchedule[]): string {
  const valid = normalizeSchedule(days)
  const openDays = valid.filter((d) => d.isOpen)
  if (openDays.length === 0) return "Tutup setiap hari"
  if (openDays.length === 7) {
    const first = openDays[0] as DaySchedule
    const allSame = openDays.every((d) => d.openMinute === first.openMinute && d.closeMinute === first.closeMinute)
    if (allSame && first.openMinute === 0 && first.closeMinute >= 1439) return "Setiap hari, 24 jam"
    if (allSame) return `Setiap hari, ${formatMinute(first.openMinute)}–${formatMinute(first.closeMinute)}`
  }
  // Kelompokkan hari buka dengan rentang jam identik (urut Senin-dulu)
  const groups = new Map<string, number[]>()
  for (const dow of DISPLAY_ORDER) {
    const d = valid.find((x) => x.dayOfWeek === dow)
    if (!d?.isOpen) continue
    const key = `${d.openMinute}-${d.closeMinute}`
    const arr = groups.get(key) ?? []
    arr.push(d.dayOfWeek)
    groups.set(key, arr)
  }
  const parts: string[] = []
  for (const [key, dayNums] of groups) {
    const [o = 0, c = 0] = key.split("-").map(Number)
    parts.push(`${compressDays(dayNums)} ${formatMinute(o)}–${formatMinute(c)}`)
  }
  const closed = valid.filter((d) => !d.isOpen).map((d) => d.dayOfWeek)
  if (closed.length > 0) parts.push(`${compressDays(closed)} tutup`)
  return parts.join(" · ")
}

export interface HoursStatus {
  open: boolean
  label: string // "Buka sekarang" / "Tutup sekarang"
  detail: string // "Buka sampai 17.00 WIB" / "Buka lagi besok pukul 08.00 WIB"
}

/** Status buka/tutup saat ini + keterangan perubahan berikutnya */
export function getStatusDetail(days: DaySchedule[], now: Date = new Date()): HoursStatus {
  const valid = normalizeSchedule(days)
  const { dayOfWeek, minutes } = getNowWIB(now)
  const today = valid.find((d) => d.dayOfWeek === dayOfWeek)
  if (today?.isOpen && minutes >= today.openMinute && minutes <= today.closeMinute) {
    if (today.openMinute === 0 && today.closeMinute >= 1439) {
      return { open: true, label: "Buka sekarang", detail: "Buka 24 jam hari ini" }
    }
    return { open: true, label: "Buka sekarang", detail: `Buka sampai ${formatMinute(today.closeMinute)} WIB` }
  }
  // Sedang tutup — cari slot buka berikutnya
  for (let offset = 0; offset < 8; offset++) {
    const d = (dayOfWeek + offset) % 7
    const day = valid.find((x) => x.dayOfWeek === d)
    if (!day?.isOpen) continue
    if (offset === 0 && minutes < day.openMinute) {
      return { open: false, label: "Tutup sekarang", detail: `Buka lagi hari ini ${formatMinute(day.openMinute)} WIB` }
    }
    if (offset > 0) {
      const dayLabel = offset === 1 ? "besok" : (DAY_NAMES[d] as string)
      return { open: false, label: "Tutup sekarang", detail: `Buka lagi ${dayLabel} pukul ${formatMinute(day.openMinute)} WIB` }
    }
  }
  return { open: false, label: "Tutup sekarang", detail: "Jadwal buka belum diatur" }
}

/** Baris jadwal lengkap untuk system prompt AI */
export function scheduleLinesForPrompt(days: DaySchedule[]): string {
  const valid = normalizeSchedule(days)
  return DISPLAY_ORDER.map((dow) => {
    const d = valid.find((x) => x.dayOfWeek === dow) as DaySchedule
    return d.isOpen
      ? `- ${DAY_NAMES[dow]}: ${formatMinute(d.openMinute)}–${formatMinute(d.closeMinute)} WIB`
      : `- ${DAY_NAMES[dow]}: tutup`
  }).join("\n")
}
