"use client"

import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  CalendarClock,
  CheckCheck,
  Eye,
  Loader2,
  Megaphone,
  Pause,
  Send,
  Trash2,
  TriangleAlert,
  Users,
  XCircle,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  BroadcastAudience,
  BroadcastDTO,
  BroadcastRecipient,
  BroadcastStatus,
  QuickReplyDTO,
} from "@/lib/wa-types"
import {
  BROADCAST_AUDIENCES,
  BROADCAST_AUDIENCE_LABEL,
  BROADCAST_STATUSES,
  BROADCAST_STATUS_BADGE,
  BROADCAST_STATUS_LABEL,
} from "@/lib/wa-types"
import { useSocket } from "@/components/wa/socket-provider"
import { formatFull, initials, relativeTime } from "@/components/wa/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error("Gagal memuat data")
  return res.json()
}

interface BroadcastPreview {
  audience: string
  count: number
  sample: string[]
}

type BroadcastAction = "send-now" | "cancel" | "pause"

/** Parse snapshot penerima (JSON string) dengan aman */
function parseRecipients(raw: string): BroadcastRecipient[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as BroadcastRecipient[]) : []
  } catch {
    return []
  }
}

function statusOf(s: string): BroadcastStatus {
  return (BROADCAST_STATUSES as readonly string[]).includes(s) ? (s as BroadcastStatus) : "draft"
}

function audienceLabel(a: string): string {
  return (BROADCAST_AUDIENCES as readonly string[]).includes(a)
    ? BROADCAST_AUDIENCE_LABEL[a as BroadcastAudience]
    : a
}

function numberFromJid(jid: string): string {
  return jid.split("@")[0]?.replace(/\D/g, "") ?? jid
}

/** Estimasi durasi kirim: 1 pesan per ±5,5 detik (rentang aman 4-7s) */
function estimateLabel(count: number): string {
  if (count <= 0) return "—"
  const seconds = count * 5.5
  if (seconds < 60) return `± ${Math.max(1, Math.round(seconds))} detik`
  return `± ${Math.ceil(seconds / 60)} menit`
}

/** Nilai min untuk input datetime-local (sekarang + 5 menit, format lokal) */
function minDateTimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60_000)
  d.setSeconds(0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

// ---------------------------------------------------------------------------
// Kartu susun broadcast
// ---------------------------------------------------------------------------

function ComposeCard() {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")
  const [audience, setAudience] = useState<BroadcastAudience>("all")
  const [mode, setMode] = useState<"now" | "schedule">("now")
  const [scheduledAt, setScheduledAt] = useState("")
  const [qrOpen, setQrOpen] = useState(false)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  const { data: quickReplies } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => fetchJson<QuickReplyDTO[]>("/api/quick-replies"),
    staleTime: 60_000,
  })

  // Pratinjau jumlah penerima per audiens (live saat audiens diganti)
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ["broadcast-preview", audience],
    queryFn: () => fetchJson<BroadcastPreview>(`/api/broadcasts?preview=${audience}`),
    staleTime: 30_000,
  })

  const minDateTime = useMemo(() => minDateTimeLocal(), [])
  const scheduleValid =
    mode === "now" || (!!scheduledAt && new Date(scheduledAt).getTime() > Date.now())
  const formValid =
    name.trim().length > 0 &&
    name.trim().length <= 100 &&
    message.trim().length > 0 &&
    message.length <= 1000 &&
    scheduleValid

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          message: message.trim(),
          audience,
          ...(mode === "now" ? { sendNow: true } : { scheduledAt: new Date(scheduledAt).toISOString() }),
        }),
      })
      const data = (await res.json()) as BroadcastDTO & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat broadcast")
      return data
    },
    onSuccess: (b) => {
      toast.success("Broadcast dijadwalkan", {
        description:
          mode === "now"
            ? `"${b.name}" masuk antrean dan akan dikirim ke ${b.totalCount} penerima.`
            : `"${b.name}" akan dikirim ${formatFull(b.scheduledAt ?? b.createdAt)}.`,
      })
      setName("")
      setMessage("")
      setAudience("all")
      setMode("now")
      setScheduledAt("")
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const insertQuickReply = (qr: QuickReplyDTO) => {
    setMessage((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${qr.content}` : qr.content))
    setQrOpen(false)
    messageRef.current?.focus()
  }

  const recipientCount = preview?.count ?? 0

  return (
    <Card className="overflow-hidden p-0 py-0">
      {/* Hero header gradient */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-5 text-white">
        <div className="absolute -right-8 -top-10 size-32 rounded-full bg-white/10" aria-hidden="true" />
        <div className="absolute -bottom-12 -left-6 size-24 rounded-full bg-black/10" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Megaphone className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">Buat Broadcast Promo</h2>
            <p className="text-xs text-white/80">
              Kirim promo ke banyak klien sekaligus, dengan jeda aman antar pesan
            </p>
          </div>
        </div>
      </div>

      <CardContent className="p-5">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (formValid && !createMutation.isPending) createMutation.mutate()
          }}
        >
          {/* Nama broadcast */}
          <div className="space-y-2">
            <Label htmlFor="broadcast-name">Nama Broadcast</Label>
            <Input
              id="broadcast-name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="Promo Cuci AC Bulan Ini"
            />
          </div>

          {/* Pesan + sisip balasan cepat */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="broadcast-message">Pesan Promo</Label>
              <span
                className={cn(
                  "text-[11px] tabular-nums text-muted-foreground",
                  message.length > 900 && "font-medium text-amber-600 dark:text-amber-400"
                )}
                aria-live="polite"
              >
                {message.length}/1000
              </span>
            </div>
            <Textarea
              id="broadcast-message"
              ref={messageRef}
              rows={5}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Halo Kak! Ada promo cuci AC bulan ini di Mukundo Teknologi 😊 …"
              className="resize-none"
            />
            {quickReplies && quickReplies.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-muted-foreground">Sisip:</span>
                {quickReplies.slice(0, 3).map((qr) => (
                  <button
                    key={qr.id}
                    type="button"
                    onClick={() => insertQuickReply(qr)}
                    title={qr.title}
                    className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-700 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-300"
                  >
                    /{qr.shortcut}
                  </button>
                ))}
                <Popover open={qrOpen} onOpenChange={setQrOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 px-2.5 text-[11px]"
                      aria-label="Sisipkan balasan cepat ke pesan"
                    >
                      <Zap className="size-3.5 text-amber-500" aria-hidden="true" />
                      Sisipkan Balasan Cepat
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-0">
                    <p className="border-b px-3 py-2.5 text-xs font-medium">Balasan Cepat</p>
                    <div className="max-h-72 overflow-y-auto scrollbar-thin p-1.5">
                      {quickReplies.map((qr) => (
                        <button
                          key={qr.id}
                          type="button"
                          onClick={() => insertQuickReply(qr)}
                          className="w-full rounded-md p-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium">{qr.title}</span>
                            <span className="shrink-0 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                              /{qr.shortcut}
                            </span>
                          </span>
                          <span className="mt-0.5 line-clamp-1 block text-[11px] text-muted-foreground">
                            {qr.content}
                          </span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Audiens + jumlah penerima live */}
          <div className="space-y-2">
            <Label htmlFor="broadcast-audience">Audiens Penerima</Label>
            <div className="flex items-center gap-2">
              <Select value={audience} onValueChange={(v) => setAudience(v as BroadcastAudience)}>
                <SelectTrigger id="broadcast-audience" className="w-full" aria-label="Pilih audiens penerima">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BROADCAST_AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {BROADCAST_AUDIENCE_LABEL[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {previewLoading || !preview ? (
                <Badge variant="secondary" className="shrink-0 gap-1 tabular-nums">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  …
                </Badge>
              ) : recipientCount > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="shrink-0 gap-1 tabular-nums border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      <Users className="size-3" aria-hidden="true" />
                      {recipientCount} penerima
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-56">
                    <p className="text-xs font-medium">Contoh penerima</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {preview.sample.length > 0 ? preview.sample.join(", ") : "—"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Badge variant="secondary" className="shrink-0 gap-1 tabular-nums">
                  <Users className="size-3" aria-hidden="true" />0 penerima
                </Badge>
              )}
            </div>
            {preview && recipientCount === 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                Belum ada kontak untuk audiens ini
              </p>
            )}
            {preview && recipientCount > 0 && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {preview.sample.length > 0 && (
                  <>
                    Contoh: {preview.sample.join(", ")}
                    {recipientCount > preview.sample.length ? ", …" : ""} •{" "}
                  </>
                )}
                Estimasi durasi kirim {estimateLabel(recipientCount)} (1 pesan / 4-7 detik)
              </p>
            )}
          </div>

          {/* Mode kirim */}
          <div className="space-y-2">
            <Label>Waktu Kirim</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v === "schedule" ? "schedule" : "now")}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label
                htmlFor="broadcast-mode-now"
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50",
                  mode === "now" && "border-primary/60 bg-primary/5"
                )}
              >
                <RadioGroupItem value="now" id="broadcast-mode-now" className="mt-0.5" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Send className="size-3.5 text-primary" aria-hidden="true" />
                    Kirim Sekarang
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Masuk antrean dan langsung dikirim.
                  </span>
                </span>
              </label>
              <label
                htmlFor="broadcast-mode-schedule"
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50",
                  mode === "schedule" && "border-primary/60 bg-primary/5"
                )}
              >
                <RadioGroupItem value="schedule" id="broadcast-mode-schedule" className="mt-0.5" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <CalendarClock className="size-3.5 text-primary" aria-hidden="true" />
                    Jadwalkan
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Tentukan tanggal &amp; jam kirim.
                  </span>
                </span>
              </label>
            </RadioGroup>
            {mode === "schedule" && (
              <div className="space-y-1.5">
                <Label htmlFor="broadcast-schedule">Tanggal &amp; Jam Kirim</Label>
                <Input
                  id="broadcast-schedule"
                  type="datetime-local"
                  className="w-full"
                  value={scheduledAt}
                  min={minDateTime}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  aria-describedby="broadcast-schedule-help"
                />
                {scheduledAt && new Date(scheduledAt).getTime() <= Date.now() && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Jadwal harus di masa depan.
                  </p>
                )}
                <p id="broadcast-schedule-help" className="text-[11px] text-muted-foreground">
                  Mengikuti zona waktu perangkat Anda (WIB untuk Kalijati/Subang).
                </p>
              </div>
            )}
          </div>

          {/* Peringatan anti-spam */}
          <div
            className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
            role="note"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Broadcast dikirim <span className="font-semibold">1 pesan per 4-7 detik</span> agar aman
              dari spam. Pastikan pesan relevan — kirim hanya ke klien yang pernah chat agar nomor
              tidak dilaporkan.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={!formValid || createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : mode === "now" ? (
              <Send className="size-4" aria-hidden="true" />
            ) : (
              <CalendarClock className="size-4" aria-hidden="true" />
            )}
            {mode === "now" ? "Kirim Broadcast Sekarang" : "Jadwalkan Broadcast"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Item riwayat broadcast
// ---------------------------------------------------------------------------

function BroadcastItem({
  b,
  index,
  busy,
  onDetail,
  onAction,
  onDelete,
}: {
  b: BroadcastDTO
  index: number
  busy: boolean
  onDetail: () => void
  onAction: (action: BroadcastAction) => void
  onDelete: () => void
}) {
  const status = statusOf(b.status)
  const pct = b.totalCount > 0 ? Math.round((b.sentCount / b.totalCount) * 100) : 0
  const audience = audienceLabel(b.audience)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.05, 0.3), ease: "easeOut" }}
      className="rounded-lg border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{b.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            <Users className="size-3 shrink-0" aria-hidden="true" />
            {audience}
            <span aria-hidden="true">•</span>
            {status === "terjadwal" &&
              (b.scheduledAt ? (
                <>
                  akan dikirim {formatFull(b.scheduledAt)}
                  <span className="text-primary">({relativeTime(b.scheduledAt)})</span>
                </>
              ) : (
                "menunggu jadwal"
              ))}
            {status === "mengirim" && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin text-primary" aria-hidden="true" />
                mengirim {b.sentCount}/{b.totalCount}
              </span>
            )}
            {status === "terkirim" && (b.sentAt ? `terkirim ${formatFull(b.sentAt)}` : "terkirim")}
            {status === "dibatalkan" && `dibatalkan ${formatFull(b.updatedAt)}`}
            {status === "draft" && `dibuat ${formatFull(b.createdAt)}`}
          </p>
        </div>
        <Badge variant="outline" className={cn("shrink-0", BROADCAST_STATUS_BADGE[status])}>
          {BROADCAST_STATUS_LABEL[status]}
        </Badge>
      </div>

      <p className="mt-2 line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
        {b.message}
      </p>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>
            {b.sentCount}/{b.totalCount} terkirim
          </span>
          <span>{pct}%</span>
        </div>
        <Progress
          value={pct}
          aria-label={`Progres kirim ${pct}%`}
          className={cn("h-2", status === "mengirim" && "progress-shimmer")}
        />
        {b.failedCount > 0 && (
          <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
            {b.failedCount} gagal terkirim
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onDetail}>
          <Eye className="size-3.5" aria-hidden="true" />
          Detail
        </Button>
        {(status === "draft" || status === "terjadwal") && (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => onAction("send-now")}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-3.5" aria-hidden="true" />
            )}
            Kirim
          </Button>
        )}
        {status === "mengirim" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => onAction("pause")}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Pause className="size-3.5" aria-hidden="true" />
            )}
            Jeda
          </Button>
        )}
        {(status === "terjadwal" || status === "mengirim") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={() => onAction("cancel")}
          >
            <XCircle className="size-3.5" aria-hidden="true" />
            Batalkan
          </Button>
        )}
        {status !== "mengirim" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                disabled={busy}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Hapus
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus broadcast &quot;{b.name}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>
                  Riwayat broadcast ini akan dihapus permanen dan tidak bisa dikembalikan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    onDelete()
                  }}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Ya, Hapus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Dialog detail broadcast (pesan lengkap + daftar penerima)
// ---------------------------------------------------------------------------

function DetailDialog({
  broadcast,
  onOpenChange,
}: {
  broadcast: BroadcastDTO | null
  onOpenChange: (v: boolean) => void
}) {
  const recipients = useMemo(
    () => (broadcast ? parseRecipients(broadcast.recipients) : []),
    [broadcast]
  )
  const status = broadcast ? statusOf(broadcast.status) : "draft"

  return (
    <Dialog open={!!broadcast} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-base">
            <Megaphone className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 truncate">{broadcast?.name ?? ""}</span>
            {broadcast && (
              <Badge variant="outline" className={BROADCAST_STATUS_BADGE[status]}>
                {BROADCAST_STATUS_LABEL[status]}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {broadcast ? audienceLabel(broadcast.audience) : ""} • dibuat{" "}
            {broadcast ? formatFull(broadcast.createdAt) : ""}
          </DialogDescription>
        </DialogHeader>

        {broadcast && (
          <div className="space-y-4">
            {/* Statistik ringkas */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-muted/40 p-2.5 text-center">
                <p className="text-lg font-semibold tabular-nums">{broadcast.totalCount}</p>
                <p className="text-[11px] text-muted-foreground">Penerima</p>
              </div>
              <div className="rounded-lg border bg-emerald-500/10 p-2.5 text-center">
                <p className="flex items-center justify-center gap-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  <CheckCheck className="size-4" aria-hidden="true" />
                  {broadcast.sentCount}
                </p>
                <p className="text-[11px] text-muted-foreground">Terkirim</p>
              </div>
              <div className="rounded-lg border bg-rose-500/10 p-2.5 text-center">
                <p className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {broadcast.failedCount}
                </p>
                <p className="text-[11px] text-muted-foreground">Gagal</p>
              </div>
            </div>

            {/* Waktu */}
            <div className="space-y-1.5 text-xs">
              {broadcast.scheduledAt && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
                  Jadwal kirim: <span className="text-foreground">{formatFull(broadcast.scheduledAt)}</span>
                </p>
              )}
              {broadcast.sentAt && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Send className="size-3.5 shrink-0" aria-hidden="true" />
                  Terkirim pada: <span className="text-foreground">{formatFull(broadcast.sentAt)}</span>
                </p>
              )}
            </div>

            {/* Isi pesan */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Isi Pesan</p>
              <div className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed">
                {broadcast.message}
              </div>
            </div>

            {/* Daftar penerima */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Penerima ({recipients.length})
              </p>
              <ul className="max-h-96 space-y-1 overflow-y-auto scrollbar-thin pr-1" aria-label="Daftar penerima broadcast">
                {recipients.map((r, i) => (
                  <li key={`${r.jid}-${i}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white">
                      {initials(r.name, "K")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{r.name}</span>
                      <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
                        +{numberFromJid(r.jid)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Kartu riwayat broadcast
// ---------------------------------------------------------------------------

const ACTION_TOAST: Record<BroadcastAction, { title: string; desc: string }> = {
  "send-now": { title: "Broadcast dikirim sekarang", desc: "Pesan masuk antrean dan mulai dikirim." },
  cancel: { title: "Broadcast dibatalkan", desc: "Pesan berikutnya tidak akan dikirim." },
  pause: { title: "Broadcast dijeda", desc: "Akan lanjut mengirim otomatis beberapa saat lagi." },
}

function HistoryCard() {
  const queryClient = useQueryClient()
  const [detailId, setDetailId] = useState<string | null>(null)

  const { data: broadcasts, isLoading } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => fetchJson<BroadcastDTO[]>("/api/broadcasts"),
    refetchInterval: 20_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["broadcasts"] })
    queryClient.invalidateQueries({ queryKey: ["logs"] })
  }

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: BroadcastAction }) => {
      const res = await fetch(`/api/broadcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = (await res.json()) as BroadcastDTO & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Aksi gagal")
      return data
    },
    onSuccess: (_b, { action }) => {
      const t = ACTION_TOAST[action]
      toast.success(t.title, { description: t.desc })
      invalidate()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/broadcasts/${id}`, { method: "DELETE" })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Gagal menghapus broadcast")
      return data
    },
    onSuccess: () => {
      toast.success("Broadcast dihapus")
      if (detailId) setDetailId(null)
      invalidate()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Detail selalu ambil versi terbaru dari cache (progress live via socket)
  const detail = useMemo(
    () => broadcasts?.find((b) => b.id === detailId) ?? null,
    [broadcasts, detailId]
  )

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span> Riwayat Broadcast</span>
          {broadcasts && broadcasts.length > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {broadcasts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/2" />
                <Skeleton className="mt-3 h-2 w-full" />
                <Skeleton className="mt-3 h-8 w-48" />
              </div>
            ))}
          </div>
        ) : !broadcasts || broadcasts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 ring-1 ring-emerald-500/30">
              <Megaphone className="size-7 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium">Belum ada broadcast</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Buat broadcast promo pertama Anda lewat formulir ini — pesan terjadwal terkirim
                otomatis saat WhatsApp tersambung.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-h-[calc(100dvh-18rem)] space-y-3 overflow-y-auto scrollbar-thin pr-1">
            {broadcasts.map((b, i) => (
              <BroadcastItem
                key={b.id}
                b={b}
                index={i}
                busy={
                  (actionMutation.isPending && actionMutation.variables?.id === b.id) ||
                  (deleteMutation.isPending && deleteMutation.variables === b.id)
                }
                onDetail={() => setDetailId(b.id)}
                onAction={(action) => actionMutation.mutate({ id: b.id, action })}
                onDelete={() => deleteMutation.mutate(b.id)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <DetailDialog broadcast={detail} onOpenChange={(v) => !v && setDetailId(null)} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// View utama
// ---------------------------------------------------------------------------

export function BroadcastView() {
  const { status } = useSocket()

  return (
    <div className="space-y-6">
      {status.status !== "connected" && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400"
          role="note"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            WhatsApp belum terhubung — broadcast terjadwal akan menunggu hingga tersambung, lalu
            terkirim otomatis.
          </p>
        </motion.div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="min-w-0"
        >
          <ComposeCard />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.08, ease: "easeOut" }}
          className="min-w-0"
        >
          <HistoryCard />
        </motion.div>
      </div>
    </div>
  )
}
