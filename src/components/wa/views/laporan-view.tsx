"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { motion } from "framer-motion"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  CalendarRange,
  Clock,
  Download,
  FileText,
  Hand,
  Image as ImageIcon,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Mic,
  Printer,
  RefreshCw,
  Shapes,
  TrendingDown,
  TrendingUp,
  Type,
  UserPlus,
  Users,
  Video,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import type { ReportDailyPoint, ReportDTO } from "@/lib/wa-types"
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/wa-types"
import { formatFull, relativeTime } from "@/components/wa/format"
import type { ActiveView } from "@/components/wa/nav"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const fmtNum = new Intl.NumberFormat("id-ID")

const PERIOD_OPTIONS = [7, 30] as const

type ChartPalette = ReturnType<typeof buildPalette>

function buildPalette(isDark: boolean) {
  return {
    client: isDark ? "#2dd4bf" : "#0d9488",
    ai: isDark ? "#34d399" : "#059669",
    manual: isDark ? "#fbbf24" : "#d97706",
    grid: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
    axis: isDark ? "#a1a1aa" : "#71717a",
  }
}

// Warna donut lead — konstan dua tema (hex medium, terbaca di terang & gelap)
const LEAD_DONUT: Array<{ key: LeadStatus; color: string }> = [
  { key: "hot", color: "#f43f5e" },
  { key: "selesai", color: "#10b981" },
  { key: "potensial", color: "#f59e0b" },
  { key: "baru", color: "#14b8a6" },
  { key: "none", color: "#a1a1aa" },
]

const MEDIA_META: Array<{ key: string; label: string; icon: LucideIcon; bar: string }> = [
  { key: "text", label: "Teks", icon: Type, bar: "from-teal-500 to-emerald-500" },
  { key: "image", label: "Foto", icon: ImageIcon, bar: "from-amber-400 to-orange-500" },
  { key: "audio", label: "Pesan Suara", icon: Mic, bar: "from-emerald-400 to-teal-600" },
  { key: "video", label: "Video", icon: Video, bar: "from-rose-400 to-pink-600" },
  { key: "document", label: "Dokumen", icon: FileText, bar: "from-teal-400 to-emerald-600" },
  { key: "other", label: "Lainnya", icon: Shapes, bar: "from-zinc-400 to-zinc-600" },
]

async function fetchReport(days: number): Promise<ReportDTO> {
  const res = await fetch(`/api/reports?days=${days}`, { cache: "no-store" })
  if (!res.ok) throw new Error("Gagal memuat laporan")
  return res.json()
}

// ---------------------------------------------------------------------------
// Potongan kecil: delta tren, sparkline, tooltip chart
// ---------------------------------------------------------------------------

function DeltaChip({ value, label }: { value: number | null; label: string }) {
  if (value === null) {
    return (
      <span className="text-[11px] text-muted-foreground/60" title={`${label} — belum ada data pembanding`}>
        — belum ada pembanding
      </span>
    )
  }
  const up = value >= 0
  return (
    <span
      title={`${label} — vs ${value >= 0 ? "naik" : "turun"} ${Math.abs(value)}% dibanding periode sebelumnya`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        up
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      )}
    >
      {up ? <TrendingUp className="size-3" aria-hidden="true" /> : <TrendingDown className="size-3" aria-hidden="true" />}
      {Math.abs(value)}%
    </span>
  )
}

function Sparkline({
  data,
  dataKey,
  color,
}: {
  data: ReportDailyPoint[]
  dataKey: "total" | "client" | "ai" | "newContacts"
  color: string
}) {
  const hasData = data.some((d) => d[dataKey] > 0)
  if (!hasData) {
    return (
      <div className="flex h-9 items-center text-[10px] text-muted-foreground/40" aria-hidden="true">
        belum ada aktivitas
      </div>
    )
  }
  return (
    <div className="h-9 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-grad-${dataKey})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function VolumeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color?: string; payload?: ReportDailyPoint }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">
        {point?.day ? `${point.day}, ` : ""}
        {label}
      </p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-popover-foreground/80">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          {p.name}: <span className="font-semibold tabular-nums text-popover-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function HourTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload?: { hour: number } }>
}) {
  if (!active || !payload?.length) return null
  const hour = payload[0]?.payload?.hour ?? 0
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">
        {String(hour).padStart(2, "0")}.00–{String((hour + 1) % 24).padStart(2, "0")}.00 WIB
      </p>
      <p className="text-popover-foreground/80">
        Pesan klien: <span className="font-semibold tabular-nums">{payload[0]?.value ?? 0}</span>
      </p>
    </div>
  )
}

function LeadTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string }>
  total: number
}) {
  if (!active || !payload?.length) return null
  const value = Number(payload[0]?.value ?? 0)
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{payload[0]?.name}</p>
      <p className="text-popover-foreground/80">
        {value} kontak ({total > 0 ? Math.round((value / total) * 100) : 0}%)
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kartu KPI dengan tile gradien + sparkline
// ---------------------------------------------------------------------------

const KPI_ACCENTS = {
  emerald: {
    tile: "bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-md shadow-emerald-500/20",
    spark: "#10b981",
  },
  teal: {
    tile: "bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/20",
    spark: "#14b8a6",
  },
  amber: {
    tile: "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/20",
    spark: "#f59e0b",
  },
  rose: {
    tile: "bg-gradient-to-br from-rose-400 to-pink-600 text-white shadow-md shadow-rose-500/20",
    spark: "#f43f5e",
  },
} as const

type KpiAccent = keyof typeof KPI_ACCENTS

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  deltaLabel,
  spark,
  accent,
  delay,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  delta: number | null
  deltaLabel: string
  spark?: React.ReactNode
  accent: KpiAccent
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      whileHover={{ y: -3 }}
      className="h-full"
    >
      <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md print:break-inside-avoid print:shadow-none">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", KPI_ACCENTS[accent].tile)}>
              <Icon className="size-4.5" aria-hidden="true" />
            </div>
            <DeltaChip value={delta} label={deltaLabel} />
          </div>
          <p className="mt-2.5 text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
          {sub && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">{sub}</p>}
          {spark && <div className="mt-2">{spark}</div>}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Header seksi (ikon + judul) — detail konsisten
// ---------------------------------------------------------------------------

function SectionIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", className)}>
      <Icon className="size-4" aria-hidden="true" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// View utama
// ---------------------------------------------------------------------------

export function LaporanView({ onNavigate }: { onNavigate?: (v: ActiveView) => void }) {
  const [days, setDays] = useState<number>(7)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const c: ChartPalette = useMemo(() => buildPalette(isDark), [isDark])

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["reports", days],
    queryFn: () => fetchReport(days),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  })

  const periodLabel = data ? `${data.daily[0]?.date ?? ""} – ${data.daily[data.daily.length - 1]?.date ?? ""}` : ""

  const leadData = useMemo(() => {
    if (!data) return []
    return LEAD_DONUT.filter((l) => (data.leads[l.key] ?? 0) > 0).map((l) => ({
      name: LEAD_STATUS_LABEL[l.key],
      value: data.leads[l.key],
      color: l.color,
    }))
  }, [data])
  const leadTotal = leadData.reduce((sum, l) => sum + l.value, 0)

  const mediaRows = useMemo(() => {
    if (!data) return []
    const rows = MEDIA_META.filter((m) => (data.media[m.key] ?? 0) > 0).map((m) => ({
      ...m,
      count: data.media[m.key],
    }))
    return rows.sort((a, b) => b.count - a.count)
  }, [data])
  const mediaMax = mediaRows[0]?.count ?? 1

  const insights = useMemo(() => {
    if (!data) return [] as Array<{ icon: LucideIcon; text: string }>
    const out: Array<{ icon: LucideIcon; text: string }> = []
    if (data.peakHour !== null) {
      out.push({
        icon: Clock,
        text: `Pelanggan paling aktif sekitar pukul ${String(data.peakHour).padStart(2, "0")}.00 WIB — ${data.hourly[data.peakHour]?.client ?? 0} pesan masuk di jam tersebut.`,
      })
    }
    const busiest = data.daily.reduce((b, cur) => (cur.total > b.total ? cur : b), data.daily[0])
    if (busiest && busiest.total > 0) {
      out.push({ icon: CalendarDays, text: `Hari tersibuk: ${busiest.day} ${busiest.date} dengan ${busiest.total} pesan.` })
    }
    if (data.kpis.newContacts > 0) {
      const leadBaru = data.leads.baru ?? 0
      out.push({
        icon: UserPlus,
        text: `${data.kpis.newContacts} kontak baru menghubungi di periode ini${leadBaru > 0 ? `, ${leadBaru} di antaranya terdeteksi sebagai lead baru` : ""}.`,
      })
    }
    if (data.kpis.aiRatio !== null) {
      out.push({
        icon: Bot,
        text: `AI menangani ${data.kpis.aiReplies} balasan (${data.kpis.aiRatio}% dari pesan klien) secara otomatis.`,
      })
    }
    if (data.kpis.handovers > 0) {
      out.push({ icon: Hand, text: `Anda mengambil alih ${data.kpis.handovers} percakapan secara manual.` })
    }
    if (data.broadcasts.sentCount > 0 && data.broadcasts.replyRate !== null) {
      out.push({
        icon: Megaphone,
        text: `Broadcast mendapat ${data.broadcasts.replies} balasan dari ${data.broadcasts.recipients} penerima (${data.broadcasts.replyRate}%).`,
      })
    }
    return out.slice(0, 5)
  }, [data])

  const topMax = data?.topContacts[0]?.messageCount ?? 1
  const noActivity = data ? data.kpis.messagesTotal === 0 && data.kpis.newContacts === 0 : false

  return (
    <div className="space-y-5">
      {/* Header khusus cetak */}
      <div className="hidden border-b pb-3 print:block">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
              <Bot className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold">Laporan Analitik — Mukundo AI</p>
              <p className="text-xs text-muted-foreground">Servis AC & Kelistrikan PLN Kalijati, Subang</p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Periode: {periodLabel} ({data?.days ?? days} hari)</p>
            <p>Dibuat {data ? formatFull(data.generatedAt) : ""}</p>
          </div>
        </div>
      </div>

      {/* Bilah kontrol ( disembunyikan saat cetak ) */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="inline-flex h-9 items-center rounded-lg border bg-card p-1 shadow-xs" role="tablist" aria-label="Pilih periode laporan">
          {PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={days === d}
              onClick={() => setDays(d)}
              className={cn(
                "h-7 rounded-md px-3.5 text-xs font-medium transition-colors",
                days === d
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d} Hari
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/reports?days=${days}&format=csv`} aria-label="Unduh laporan sebagai berkas CSV (bisa dibuka di Excel)">
              <Download className="size-4" aria-hidden="true" />
              Unduh CSV
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            aria-label="Cetak laporan atau simpan sebagai PDF"
          >
            <Printer className="size-4" aria-hidden="true" />
            Cetak / PDF
          </Button>
        </div>
      </div>

      {/* Memuat */}
      {isLoading && (
        <div className="space-y-5" aria-label="Memuat laporan">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 w-full lg:col-span-2" />
            <Skeleton className="h-72 w-full" />
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      )}

      {/* Galat */}
      {isError && (
        <Card className="border-rose-500/30">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="size-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Gagal Memuat Laporan</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Terjadi kesalahan saat menghitung statistik. Coba muat ulang.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className={cn("size-4", isRefetching && "animate-spin")} aria-hidden="true" />
              Muat Ulang
            </Button>
          </CardContent>
        </Card>
      )}

      {data && !isError && (
        <>
          {/* Kosong total */}
          {noActivity ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <CalendarRange className="size-7" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold">Belum Ada Aktivitas di Periode Ini</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                    Belum ada pesan atau kontak baru dalam {data.days} hari terakhir. Statistik akan muncul setelah
                    pelanggan mulai menghubungi WhatsApp ini.
                  </p>
                </div>
                {days === 7 && (
                  <Button variant="outline" size="sm" onClick={() => setDays(30)}>
                    <CalendarRange className="size-4" aria-hidden="true" />
                    Lihat 30 Hari Terakhir
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPI */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <KpiCard
                  icon={MessageSquare}
                  label="Total Pesan"
                  value={fmtNum.format(data.kpis.messagesTotal)}
                  delta={data.deltas.messages}
                  deltaLabel="Total pesan"
                  spark={<Sparkline data={data.daily} dataKey="total" color={KPI_ACCENTS.teal.spark} />}
                  accent="teal"
                  delay={0}
                />
                <KpiCard
                  icon={MessageSquare}
                  label="Pesan Klien"
                  value={fmtNum.format(data.kpis.clientMessages)}
                  sub={`${fmtNum.format(data.kpis.outgoingMessages)} balasan keluar`}
                  delta={data.deltas.client}
                  deltaLabel="Pesan klien"
                  spark={<Sparkline data={data.daily} dataKey="client" color={KPI_ACCENTS.teal.spark} />}
                  accent="teal"
                  delay={0.04}
                />
                <KpiCard
                  icon={Bot}
                  label="Balasan AI"
                  value={fmtNum.format(data.kpis.aiReplies)}
                  sub={
                    data.kpis.aiRatio !== null
                      ? `Rasio ${data.kpis.aiRatio}% dari pesan klien`
                      : "Belum ada pesan klien"
                  }
                  delta={data.deltas.ai}
                  deltaLabel="Balasan AI"
                  spark={<Sparkline data={data.daily} dataKey="ai" color={KPI_ACCENTS.emerald.spark} />}
                  accent="emerald"
                  delay={0.08}
                />
                <KpiCard
                  icon={UserPlus}
                  label="Kontak Baru"
                  value={fmtNum.format(data.kpis.newContacts)}
                  sub="mulai chat di periode ini"
                  delta={data.deltas.newContacts}
                  deltaLabel="Kontak baru"
                  spark={<Sparkline data={data.daily} dataKey="newContacts" color={KPI_ACCENTS.amber.spark} />}
                  accent="amber"
                  delay={0.12}
                />
                <KpiCard
                  icon={Users}
                  label="Kontak Aktif"
                  value={fmtNum.format(data.kpis.activeContacts)}
                  sub={`dari ${fmtNum.format(data.kpis.contactsTotal)} kontak tersimpan`}
                  delta={data.deltas.activeContacts}
                  deltaLabel="Kontak aktif"
                  accent="teal"
                  delay={0.16}
                />
                <KpiCard
                  icon={Hand}
                  label="Ambil Alih Manual"
                  value={fmtNum.format(data.kpis.handovers)}
                  sub="chat Anda tangani sendiri"
                  delta={data.deltas.handovers}
                  deltaLabel="Ambil alih manual"
                  accent="rose"
                  delay={0.2}
                />
              </div>

              {/* Insight otomatis */}
              {insights.length > 0 && (
                <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.06] to-teal-500/[0.04] print:break-inside-avoid print:from-none print:to-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <SectionIcon
                        icon={Lightbulb}
                        className="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      />
                      <p className="text-sm font-semibold">Insight Periode Ini</p>
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        otomatis
                      </Badge>
                    </div>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {insights.map((ins, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85">
                          <ins.icon className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                          <span>{ins.text}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Volume percakapan + Distribusi lead */}
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2 print:break-inside-avoid">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <SectionIcon
                        icon={MessageSquare}
                        className="bg-teal-500/15 text-teal-600 dark:text-teal-400"
                      />
                      <CardTitle className="text-sm">Volume Percakapan Harian</CardTitle>
                      <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: c.client }} aria-hidden="true" />
                          Klien
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: c.ai }} aria-hidden="true" />
                          Balasan AI
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ background: c.manual }} aria-hidden="true" />
                          Manual/Pemilik
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="h-60"
                      role="img"
                      aria-label={`Grafik volume percakapan harian: ${data.daily
                        .filter((d) => d.total > 0)
                        .map((d) => `${d.date} ${d.total} pesan`)
                        .join(", ")}`}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.daily} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="grad-client" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={c.client} stopOpacity={isDark ? 0.5 : 0.35} />
                              <stop offset="100%" stopColor={c.client} stopOpacity={0.03} />
                            </linearGradient>
                            <linearGradient id="grad-ai" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={c.ai} stopOpacity={isDark ? 0.5 : 0.35} />
                              <stop offset="100%" stopColor={c.ai} stopOpacity={0.03} />
                            </linearGradient>
                            <linearGradient id="grad-manual" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={c.manual} stopOpacity={isDark ? 0.5 : 0.35} />
                              <stop offset="100%" stopColor={c.manual} stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: c.axis, fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            interval={data.days > 10 ? 4 : 0}
                            tickMargin={6}
                          />
                          <YAxis
                            width={30}
                            allowDecimals={false}
                            tick={{ fill: c.axis, fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip content={<VolumeTooltip />} cursor={{ stroke: c.axis, strokeDasharray: "3 3" }} />
                          <Area
                            type="monotone"
                            dataKey="client"
                            name="Pesan klien"
                            stackId="1"
                            stroke={c.client}
                            strokeWidth={2}
                            fill="url(#grad-client)"
                          />
                          <Area
                            type="monotone"
                            dataKey="ai"
                            name="Balasan AI"
                            stackId="1"
                            stroke={c.ai}
                            strokeWidth={2}
                            fill="url(#grad-ai)"
                          />
                          <Area
                            type="monotone"
                            dataKey="manual"
                            name="Manual/Pemilik"
                            stackId="1"
                            stroke={c.manual}
                            strokeWidth={2}
                            fill="url(#grad-manual)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="mt-1 text-center text-[10px] text-muted-foreground/60">
                      Waktu zona Jakarta (WIB) — {periodLabel}
                    </p>
                  </CardContent>
                </Card>

                {/* Donut lead */}
                <Card className="print:break-inside-avoid">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <SectionIcon
                        icon={Users}
                        className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      />
                      <CardTitle className="text-sm">Distribusi Lead</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {leadTotal > 0 ? (
                      <>
                        <div className="relative h-48" role="img" aria-label={`Distribusi lead: ${leadData.map((l) => `${l.name} ${l.value}`).join(", ")}`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={leadData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="62%"
                                outerRadius="88%"
                                paddingAngle={2}
                                strokeWidth={0}
                                startAngle={90}
                                endAngle={-270}
                              >
                                {leadData.map((l) => (
                                  <Cell key={l.name} fill={l.color} />
                                ))}
                              </Pie>
                              <Tooltip content={<LeadTooltip total={leadTotal} />} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <p className="text-2xl font-semibold tabular-nums">{fmtNum.format(leadTotal)}</p>
                            <p className="text-[10px] text-muted-foreground">kontak</p>
                          </div>
                        </div>
                        <ul className="mt-3 space-y-1.5">
                          {leadData.map((l) => (
                            <li key={l.name} className="flex items-center gap-2 text-xs">
                              <span className="size-2.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                              <span className="text-foreground/80">{l.name}</span>
                              <span className="ml-auto font-semibold tabular-nums">{fmtNum.format(l.value)}</span>
                              <span className="w-10 text-right text-[10px] text-muted-foreground tabular-nums">
                                {Math.round((l.value / leadTotal) * 100)}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
                        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Users className="size-5" aria-hidden="true" />
                        </div>
                        <p className="text-xs text-muted-foreground">Belum ada kontak tersimpan</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Jam sibuk + tipe pesan & performa asisten */}
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2 print:break-inside-avoid">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <SectionIcon
                        icon={Clock}
                        className="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      />
                      <CardTitle className="text-sm">Kapan Pelanggan Menghubungi</CardTitle>
                      {data.peakHour !== null && (
                        <Badge
                          variant="secondary"
                          className="ml-auto gap-1 border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
                        >
                          <Clock className="size-3" aria-hidden="true" />
                          Tersibuk {String(data.peakHour).padStart(2, "0")}.00 WIB
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="h-48"
                      role="img"
                      aria-label={`Grafik pesan klien per jam: ${data.hourly
                        .filter((h) => h.client > 0)
                        .map((h) => `jam ${h.hour} ${h.client} pesan`)
                        .join(", ")}`}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.hourly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                          <XAxis
                            dataKey="hour"
                            tickFormatter={(h: number) => String(h).padStart(2, "0")}
                            tick={{ fill: c.axis, fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            interval={2}
                            tickMargin={4}
                          />
                          <YAxis
                            width={26}
                            allowDecimals={false}
                            tick={{ fill: c.axis, fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip content={<HourTooltip />} cursor={{ fill: c.grid }} />
                          <Bar dataKey="client" name="Pesan klien" radius={[3, 3, 0, 0]} maxBarSize={18}>
                            {data.hourly.map((h) => (
                              <Cell
                                key={h.hour}
                                fill={data.peakHour === h.hour && h.client > 0 ? c.manual : c.client}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="mt-1 text-center text-[10px] text-muted-foreground/60">
                      Pesan klien masuk per jam WIB (gabungan {data.days} hari)
                    </p>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  {/* Tipe pesan */}
                  <Card className="print:break-inside-avoid">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <SectionIcon
                          icon={Shapes}
                          className="bg-teal-500/15 text-teal-600 dark:text-teal-400"
                        />
                        <CardTitle className="text-sm">Tipe Pesan</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {mediaRows.length > 0 ? (
                        <ul className="space-y-2.5">
                          {mediaRows.map((m) => {
                            const pct = Math.max(6, Math.round((m.count / mediaMax) * 100))
                            return (
                              <li key={m.key}>
                                <div className="flex items-center gap-2 text-xs">
                                  <m.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  <span className="text-foreground/80">{m.label}</span>
                                  <span className="ml-auto font-semibold tabular-nums">{fmtNum.format(m.count)}</span>
                                  <span className="w-9 text-right text-[10px] text-muted-foreground tabular-nums">
                                    {Math.round((m.count / data.kpis.messagesTotal) * 100)}%
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={cn("h-full rounded-full bg-gradient-to-r transition-all", m.bar)}
                                    style={{ width: `${pct}%` }}
                                    aria-hidden="true"
                                  />
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <p className="py-4 text-center text-xs text-muted-foreground">Belum ada pesan di periode ini.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Performa asisten */}
                  <Card className="print:break-inside-avoid">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <SectionIcon
                          icon={Bot}
                          className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        />
                        <CardTitle className="text-sm">Performa Asisten</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-medium">Rasio Balasan AI</p>
                          <p className="text-sm font-semibold tabular-nums">
                            {data.kpis.aiRatio !== null ? `${data.kpis.aiRatio}%` : "—"}
                          </p>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-600 transition-all"
                            style={{ width: `${data.kpis.aiRatio ?? 0}%` }}
                            aria-hidden="true"
                          />
                        </div>
                        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/70">
                          {data.kpis.aiRatio !== null
                            ? `${fmtNum.format(data.kpis.aiReplies)} balasan AI dari ${fmtNum.format(data.kpis.clientMessages)} pesan klien`
                            : "Belum ada pesan klien di periode ini"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs">
                        <span className="flex items-center gap-1.5 text-foreground/80">
                          <Hand className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                          Ambil alih manual
                        </span>
                        <span className="font-semibold tabular-nums">{fmtNum.format(data.kpis.handovers)}×</span>
                      </div>
                      <p className="text-[10px] leading-snug text-muted-foreground/60">
                        Rasio turun saat Anda mengambil alih chat atau di luar jam kerja — bukan berarti AI gagal
                        membalas.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Kontak teraktif + broadcast */}
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2 print:break-inside-avoid">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <SectionIcon
                        icon={Users}
                        className="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      />
                      <CardTitle className="text-sm">Kontak Teraktif</CardTitle>
                      <span className="ml-auto text-[11px] text-muted-foreground">{periodLabel}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {data.topContacts.length > 0 ? (
                      <ol className="space-y-3">
                        {data.topContacts.map((contact, i) => {
                          const rank = i + 1
                          const pct = Math.max(8, Math.round((contact.messageCount / topMax) * 100))
                          return (
                            <li key={contact.id} className="flex items-center gap-3">
                              <span
                                aria-label={`Peringkat ${rank}`}
                                className={cn(
                                  "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums",
                                  rank === 1 && "bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-sm",
                                  rank === 2 && "bg-gradient-to-br from-teal-300 to-emerald-500 text-white shadow-sm",
                                  rank === 3 && "bg-gradient-to-br from-zinc-300 to-zinc-500 text-white shadow-sm",
                                  rank > 3 && "bg-muted text-muted-foreground",
                                )}
                              >
                                {rank}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <p className="truncate text-sm font-medium">
                                    {contact.name || `+${contact.number}`}
                                  </p>
                                  {contact.isGroup && (
                                    <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                                      Grup
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "px-1.5 py-0 text-[9px]",
                                      contact.leadStatus === "hot" && "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                                    )}
                                  >
                                    {(LEAD_STATUS_LABEL as Record<string, string>)[contact.leadStatus] ?? contact.leadStatus}
                                  </Badge>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <div className="h-1.5 max-w-52 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-600"
                                      style={{ width: `${pct}%` }}
                                      aria-hidden="true"
                                    />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground tabular-nums">
                                    {contact.messageCount} pesan · {contact.clientMessages} klien
                                  </span>
                                  <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
                                    {relativeTime(contact.lastMessageAt)}
                                  </span>
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    ) : (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Belum ada percakapan di periode ini.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Broadcast */}
                <Card className="print:break-inside-avoid">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <SectionIcon
                        icon={Megaphone}
                        className="bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      />
                      <CardTitle className="text-sm">Performa Broadcast</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {data.broadcasts.total > 0 ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: "Broadcast terkirim", value: fmtNum.format(data.broadcasts.sentCount) },
                            { label: "Total penerima", value: fmtNum.format(data.broadcasts.recipients) },
                            { label: "Balasan masuk", value: fmtNum.format(data.broadcasts.replies) },
                            {
                              label: "Tingkat balasan",
                              value: data.broadcasts.replyRate !== null ? `${data.broadcasts.replyRate}%` : "—",
                            },
                          ].map((stat) => (
                            <div key={stat.label} className="rounded-lg border bg-accent/40 px-2.5 py-2">
                              <p className="text-sm font-semibold tabular-nums">{stat.value}</p>
                              <p className="text-[10px] leading-tight text-muted-foreground">{stat.label}</p>
                            </div>
                          ))}
                        </div>
                        {data.broadcasts.replyRate !== null && (
                          <div className="mt-3">
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-500"
                                style={{ width: `${data.broadcasts.replyRate}%` }}
                                aria-hidden="true"
                              />
                            </div>
                            <p className="mt-1 text-[10px] text-muted-foreground/70">
                              Balasan klien dihitung hingga 72 jam setelah broadcast terkirim.
                            </p>
                          </div>
                        )}
                        {data.broadcasts.items.length > 0 && (
                          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto scrollbar-thin">
                            {data.broadcasts.items.map((b) => (
                              <li key={b.id} className="rounded-lg border bg-accent/30 px-2.5 py-2">
                                <div className="flex items-center gap-2">
                                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{b.name}</p>
                                  <span className="text-[10px] text-muted-foreground tabular-nums">
                                    {b.sentAt ? relativeTime(b.sentAt) : "—"}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                  <span>
                                    {b.sentCount}/{b.totalCount} terkirim
                                    {b.failedCount > 0 && <span className="text-rose-600 dark:text-rose-400"> · {b.failedCount} gagal</span>}
                                  </span>
                                  {b.replies > 0 && (
                                    <span className="ml-auto font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                                      {b.replies} balasan
                                    </span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-6 text-center">
                        <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Megaphone className="size-5" aria-hidden="true" />
                        </div>
                        <p className="text-xs font-medium">Belum Ada Broadcast</p>
                        <p className="max-w-52 text-[11px] leading-snug text-muted-foreground">
                          Statistik tingkat balasan broadcast akan muncul di sini setelah promo pertama terkirim.
                        </p>
                        {onNavigate && (
                          <Button variant="outline" size="sm" className="mt-1" onClick={() => onNavigate("broadcast")}>
                            <Megaphone className="size-3.5" aria-hidden="true" />
                            Buat Broadcast
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <p className="hidden text-center text-[10px] text-muted-foreground print:block">
                Laporan dibuat otomatis oleh Mukundo AI — asisten WhatsApp Mukundo Teknologi, Kalijati Subang.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
