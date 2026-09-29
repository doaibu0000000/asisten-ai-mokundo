"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  BookOpen,
  CheckCircle2,
  Clock,
  FlaskConical,
  Flame,
  Lightbulb,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Plug,
  QrCode,
  Settings2,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { BusinessHoursResponse, ChatListEntry, LogDTO, SettingsDTO, StatsDTO } from "@/lib/wa-types"
import { getStatusDetail } from "@/lib/business-hours"
import { useSocket } from "@/components/wa/socket-provider"
import { formatUptime, initials, isAiPaused } from "@/components/wa/format"
import { OnboardingChecklist, OnboardingWizard } from "@/components/wa/onboarding"
import type { ActiveView } from "@/components/wa/nav"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"

const LOG_TYPE_ICON: Record<string, typeof Activity> = {
  connection: Plug,
  ai_reply: Sparkles,
  message: MessageSquare,
  error: AlertTriangle,
  settings: Settings2,
  knowledge: BookOpen,
  simulate: FlaskConical,
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error("Gagal memuat data")
  return res.json()
}

const STAT_ACCENTS = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
} as const

type StatAccent = keyof typeof STAT_ACCENTS

function StatCard({
  icon: Icon,
  value,
  label,
  delta,
  delay,
  accent = "emerald",
}: {
  icon: typeof Bot
  value: number | string
  label: string
  delta: string
  delay: number
  accent?: StatAccent
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      whileHover={{ y: -3 }}
    >
      <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-0.5 opacity-70 transition-opacity group-hover:opacity-100",
            accent === "emerald" && "bg-emerald-500",
            accent === "teal" && "bg-teal-500",
            accent === "amber" && "bg-amber-500",
            accent === "rose" && "bg-rose-500"
          )}
          aria-hidden="true"
        />
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-2">
            <div className={cn("flex size-10 items-center justify-center rounded-lg", STAT_ACCENTS[accent])}>
              <Icon className="size-5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/70">{delta}</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-popover-foreground/80">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          {p.name}: <span className="font-semibold tabular-nums text-popover-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export function DashboardView({ onNavigate }: { onNavigate: (v: ActiveView) => void }) {
  const { status, serviceConnected } = useSocket()
  const queryClient = useQueryClient()
  const [wizardOpen, setWizardOpen] = useState(false)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => fetchJson<StatsDTO>("/api/stats"),
    refetchInterval: 30000,
  })
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetchJson<SettingsDTO>("/api/settings"),
  })
  // Jadwal jam operasional — status buka/tutup ikut detak 30 detik
  const { data: hours } = useQuery({
    queryKey: ["business-hours"],
    queryFn: () => fetchJson<BusinessHoursResponse>("/api/business-hours"),
    refetchInterval: 60_000,
  })
  const { data: logs } = useQuery({
    queryKey: ["logs", "dashboard"],
    queryFn: () => fetchJson<LogDTO[]>("/api/logs?limit=5"),
  })
  // Kunci sama dengan query chats lain — cache React Query terbagi (dedupe otomatis)
  const { data: chats, isLoading: chatsLoading } = useQuery({
    queryKey: ["chats", ""],
    queryFn: () => fetchJson<ChatListEntry[]>("/api/chats"),
    refetchInterval: 30000,
  })
  // Hanya chat pribadi (bukan grup) yang bisa dikontrol AI-nya
  const activeChats = useMemo(() => (chats ?? []).filter((c) => !c.isGroup), [chats])
  const hotLeadCount = useMemo(
    () => activeChats.filter((c) => c.leadStatus === "hot").length,
    [activeChats]
  )

  // Durasi terhubung diperbarui tiap 30 detik
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])
  const uptime = formatUptime(status.connectedAt, now)

  // Status buka/tutup usaha saat ini (WIB) — dihitung ulang tiap detak
  const hoursStatus = useMemo(() => {
    void now // dependensi waktu — status dihitung ulang tiap detak 30 detik
    return hours?.days?.length === 7 ? getStatusDetail(hours.days) : null
  }, [hours, now])

  // Chat dengan AI sedang dijeda (pemilik mengambil alih manual)
  const pausedChatCount = useMemo(
    () => activeChats.filter((c) => c.aiEnabled && isAiPaused(c.aiPausedUntil, now)).length,
    [activeChats, now]
  )

  // Toggle AI per percakapan dari dashboard — perilaku sama dengan saklar titik ( . )
  const aiToggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEnabled: enabled }),
      })
      if (!res.ok) throw new Error("Gagal mengubah status AI")
    },
    onSuccess: (_data, { enabled }) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] })
      if (enabled) {
        toast.success("AI diaktifkan", {
          description: "Hanya pesan baru yang masuk yang dibalas — riwayat sebelumnya dibiarkan.",
        })
      } else {
        toast.success("AI dimatikan untuk kontak ini")
      }
    },
    onError: () => toast.error("Gagal mengubah status AI"),
  })

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoReplyEnabled: enabled }),
      })
      if (!res.ok) throw new Error("Gagal mengubah status asisten")
      return res.json()
    },
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
      toast.success(enabled ? "Balasan otomatis diaktifkan" : "Balasan otomatis dimatikan")
    },
    onError: () => toast.error("Gagal mengubah status asisten"),
  })

  const chartData = stats?.last7days ?? []
  const ownerName = status.owner?.name ?? settings?.ownerName ?? "Pemilik"
  const ownerNumber = status.owner?.number

  return (
    <div className="space-y-6">
      {/* Kartu status koneksi */}
      {status.status === "connected" ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-6 text-white shadow-lg"
        >
          <div className="absolute -right-10 -top-10 size-44 rounded-full bg-white/10" aria-hidden="true" />
          <div className="absolute -bottom-14 -left-6 size-36 rounded-full bg-black/10" aria-hidden="true" />
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-white/15 text-lg font-semibold backdrop-blur">
              {initials(ownerName, "MT")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{ownerName}</h2>
                <Badge className="gap-1 border-transparent bg-white/15 text-white">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  WhatsApp Terhubung
                </Badge>
                {hoursStatus && (
                  <span
                    role="status"
                    title={hoursStatus.detail + (hours?.summary ? ` — ${hours.summary}` : "")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums",
                      hoursStatus.open
                        ? "border-emerald-300/30 bg-emerald-950/30 text-emerald-100"
                        : "border-amber-200/50 bg-amber-400/90 text-amber-950",
                    )}
                  >
                    <span className="relative flex size-2" aria-hidden="true">
                      <span
                        className={cn(
                          "absolute inline-flex size-full animate-ping rounded-full opacity-70",
                          hoursStatus.open ? "bg-emerald-300" : "bg-amber-200",
                        )}
                      />
                      <span
                        className={cn(
                          "relative inline-flex size-2 rounded-full",
                          hoursStatus.open ? "bg-emerald-300" : "bg-amber-100",
                        )}
                      />
                    </span>
                    {hoursStatus.label} · {hoursStatus.detail.replace(" WIB", "")}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-white/85 tabular-nums">
                {ownerNumber ? `+${ownerNumber.replace(/^\+/, "")}` : "Nomor pribadi"}{" "}
                {uptime ? <span className="text-white/70">• aktif {uptime}</span> : null}
              </p>
            </div>
          </div>
        </motion.div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:text-left">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <QrCode className="size-7" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight">WhatsApp belum terhubung</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Scan QR untuk menghubungkan nomor pribadi Anda — setelah itu asisten AI mulai membalas klien otomatis.
              </p>
            </div>
            <Button size="lg" onClick={() => onNavigate("koneksi")} className="shrink-0">
              <QrCode className="size-4" aria-hidden="true" />
              Hubungkan WhatsApp
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Panduan Awal — checklist onboarding bagi pengguna baru */}
      <OnboardingChecklist onNavigate={onNavigate} onOpenWizard={() => setWizardOpen(true)} />

      {/* Aksi cepat */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => onNavigate("simulator")}>
          <FlaskConical className="size-4" aria-hidden="true" />
          Uji Simulasi
        </Button>
        <Button variant="outline" onClick={() => onNavigate("knowledge")}>
          <BookOpen className="size-4" aria-hidden="true" />
          Tambah Pengetahuan
        </Button>
        <Button variant="outline" onClick={() => onNavigate("broadcast")}>
          <Megaphone className="size-4" aria-hidden="true" />
          Buat Broadcast
        </Button>
        <Button variant="outline" onClick={() => onNavigate("laporan")}>
          <BarChart3 className="size-4" aria-hidden="true" />
          Lihat Laporan
        </Button>
      </div>

      {/* Kontrol AI per percakapan — pusat kendali pengganti Inbox */}
      <section aria-label="Kontrol AI per percakapan">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Bot className="size-4 text-primary" aria-hidden="true" />
              Kontrol AI per Percakapan
              {hotLeadCount > 0 && (
                <Badge className="gap-1 border-transparent bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  <Flame className="size-3" aria-hidden="true" />
                  {hotLeadCount} hot lead
                </Badge>
              )}
              {pausedChatCount > 0 && (
                <Badge className="gap-1 border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <Clock className="size-3" aria-hidden="true" />
                  {pausedChatCount} dijeda
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {activeChats.length > 0
                ? `${activeChats.length} percakapan klien — chat terbaru paling atas`
                : "Hidupkan/matikan asisten AI untuk tiap percakapan"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                <Lightbulb className="size-4 shrink-0" aria-hidden="true" />
                Saklar titik ( . ) langsung dari HP
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-amber-800/90 dark:text-amber-200/80">
                Kirim pesan berisi <span className="font-semibold">titik ( . )</span> di chat WhatsApp untuk mematikan
                AI di chat itu — kirim titik lagi untuk menghidupkannya. Setelah dihidupkan, AI{" "}
                <span className="font-semibold">hanya membalas pesan baru yang masuk</span>; riwayat percakapan
                sebelumnya dibiarkan tanpa dibalas.
              </p>
            </div>

            {chatsLoading ? (
              <div className="space-y-2" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                    <Skeleton className="h-5 w-9 rounded-full" />
                  </div>
                ))}
              </div>
            ) : activeChats.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Belum ada percakapan — chat klien akan muncul di sini setelah WhatsApp terhubung.
              </p>
            ) : (
              <ul
                className="max-h-96 divide-y overflow-y-auto scrollbar-thin pr-1"
                aria-label="Daftar percakapan dan status AI"
              >
                {activeChats.map((chat) => {
                  const paused = chat.aiEnabled && isAiPaused(chat.aiPausedUntil, now)
                  const pending = aiToggle.isPending && aiToggle.variables?.id === chat.id
                  return (
                    <li
                      key={chat.id}
                      className="flex items-center gap-3 rounded-lg px-1.5 py-2.5 transition-colors first:pt-0 last:pb-0 hover:bg-muted/40"
                    >
                      <span
                        className="flex size-9 shrink-0 select-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary"
                        aria-hidden="true"
                      >
                        {initials(chat.name ?? "", chat.number.slice(-2))}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-medium">{chat.name || `+${chat.number}`}</p>
                          {chat.leadStatus === "hot" && (
                            <Badge className="gap-0.5 border-transparent bg-rose-500/15 px-1.5 text-[10px] text-rose-600 dark:text-rose-400">
                              <Flame className="size-3" aria-hidden="true" />
                              Hot
                            </Badge>
                          )}
                          {paused && (
                            <Badge className="gap-0.5 border-transparent bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                              <Clock className="size-3" aria-hidden="true" />
                              Dijeda
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {chat.lastMessageFromMe ? "Anda: " : ""}
                          {chat.lastMessageText || "Belum ada pesan"}
                        </p>
                      </div>
                      <Switch
                        checked={chat.aiEnabled}
                        disabled={pending}
                        onCheckedChange={(v) => aiToggle.mutate({ id: chat.id, enabled: v })}
                        aria-label={`${chat.aiEnabled ? "Matikan" : "Aktifkan"} AI untuk ${chat.name || "+" + chat.number}`}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Statistik */}
      <section aria-label="Statistik singkat">
        {statsLoading || !stats ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <Skeleton className="size-10 rounded-lg" />
                  <Skeleton className="mt-3 h-7 w-16" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={MessageCircle}
              value={stats.contactsTotal}
              label="Total Percakapan"
              delta="kontak klien tercatat"
              delay={0}
              accent="emerald"
            />
            <StatCard
              icon={Mail}
              value={stats.messagesToday}
              label="Pesan Hari Ini"
              delta="masuk + keluar sejak tengah malam"
              delay={0.05}
              accent="teal"
            />
            <StatCard
              icon={Sparkles}
              value={stats.aiRepliesToday}
              label="Balasan AI Hari Ini"
              delta={settings?.autoReplyEnabled ? "auto-reply aktif" : "auto-reply nonaktif"}
              delay={0.1}
              accent="amber"
            />
            <StatCard
              icon={Bot}
              value={stats.aiRepliesTotal}
              label="Total Balasan AI"
              delta="sepanjang waktu"
              delay={0.15}
              accent="rose"
            />
          </div>
        )}
      </section>

      {/* Grafik + status asisten */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Aktivitas 7 Hari Terakhir</CardTitle>
          </CardHeader>
          <CardContent className="h-72 min-w-0">
            {statsLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradAi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "currentColor" }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "currentColor" }}
                    className="text-muted-foreground"
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="messages"
                    name="Pesan"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#gradMessages)"
                  />
                  <Area
                    type="monotone"
                    dataKey="ai"
                    name="Balasan AI"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    fill="url(#gradAi)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          {/* Status asisten AI */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                Status Asisten AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Balasan Otomatis</p>
                  <p className="text-xs text-muted-foreground">
                    AI membalas setiap chat masuk dari klien
                  </p>
                </div>
                <Switch
                  checked={settings?.autoReplyEnabled ?? false}
                  onCheckedChange={(v) => toggleMutation.mutate(v)}
                  disabled={toggleMutation.isPending || !settings}
                  aria-label="Aktifkan balasan otomatis AI"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {settings?.assistantName || "Rani"} • Persona
                </p>
                <p className={cn("mt-1 text-sm leading-relaxed", !settings?.persona && "italic text-muted-foreground/70")}>
                  {settings?.persona?.trim()
                    ? settings.persona
                    : "Belum ada instruksi khusus dari pemilik. Asisten memakai gaya bawaan yang ramah dan ringkas."}
                </p>
              </div>
              <Separator />
              <Button variant="outline" className="w-full" onClick={() => onNavigate("pengaturan")}>
                <Settings2 className="size-4" aria-hidden="true" />
                Buka Pengaturan
              </Button>
            </CardContent>
          </Card>

          {/* Aktivitas terbaru */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-primary" aria-hidden="true" />
                Aktivitas Terbaru
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!logs || logs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Belum ada aktivitas tercatat.
                </p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin pr-1" aria-label="Daftar aktivitas terbaru">
                  {logs.map((log) => {
                    const Icon = LOG_TYPE_ICON[log.type] ?? Activity
                    return (
                      <li key={log.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
                        <Icon
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            log.level === "success" && "text-emerald-600",
                            log.level === "warn" && "text-amber-600",
                            log.level === "error" && "text-red-600",
                            log.level === "info" && "text-muted-foreground"
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{log.message}</p>
                          <p className="text-[11px] text-muted-foreground/70">{log.type}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Catatan layanan offline */}
      {!serviceConnected && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Layanan WhatsApp (wa-service) sedang offline. Data di halaman ini diambil dari database terakhir.
        </p>
      )}

      {/* Overlay wizard Panduan Awal */}
      <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onNavigate={onNavigate} />
    </div>
  )
}
