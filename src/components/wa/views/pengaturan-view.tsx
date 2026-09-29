"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowRight,
  AudioLines,
  BriefcaseBusiness,
  CalendarClock,
  Clock,
  FileText,
  Flame,
  Hand,
  Image as ImageIcon,
  Info,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
  Sunrise,
  Sunset,
  Trash2,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { AuthState, BusinessHourDTO, BusinessHoursResponse, QuickReplyDTO, SettingsDTO } from "@/lib/wa-types"
import {
  DAY_NAMES,
  DISPLAY_ORDER,
  describeSchedule,
  getStatusDetail,
  getNowWIB,
  hhmmToMinute,
  minuteToHHMM,
} from "@/lib/business-hours"
import {
  LEAD_STATUS_BADGE,
  LEAD_STATUS_LABEL,
  QUICK_REPLY_CATEGORIES,
} from "@/lib/wa-types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

interface FormState {
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
  visionDocuments: boolean
  leadDetection: boolean
  handoverEnabled: boolean
  handoverMinutes: number
}

function toForm(s: SettingsDTO): FormState {
  return {
    businessName: s.businessName,
    ownerName: s.ownerName,
    assistantName: s.assistantName,
    persona: s.persona,
    autoReplyEnabled: s.autoReplyEnabled,
    replyDelayMin: s.replyDelayMin,
    replyDelayMax: s.replyDelayMax,
    workHoursStart: s.workHoursStart,
    workHoursEnd: s.workHoursEnd,
    outsideHoursReply: s.outsideHoursReply,
    awayMessage: s.awayMessage,
    greetingMessage: s.greetingMessage,
    contextMessages: s.contextMessages,
    typingIndicator: s.typingIndicator,
    transcribeVoice: s.transcribeVoice,
    visionImages: s.visionImages,
    visionDocuments: s.visionDocuments,
    leadDetection: s.leadDetection,
    handoverEnabled: s.handoverEnabled,
    handoverMinutes: s.handoverMinutes,
  }
}

const LEAD_LEGEND: Array<{ status: "baru" | "potensial" | "hot" | "selesai"; hint: string }> = [
  { status: "baru", hint: "Chat klien baru masuk — kenalkan layanan dengan ramah." },
  { status: "potensial", hint: "Ada tanda minat (tanya harga/jadwal) — layak di-follow-up." },
  { status: "hot", hint: "Siap order — prioritaskan follow-up segera." },
  { status: "selesai", hint: "Sudah tertangani / order selesai." },
]

const QR_CATEGORY_LABEL: Record<string, string> = {
  umum: "Umum",
  layanan: "Layanan",
  jadwal: "Jadwal",
  penawaran: "Penawaran",
  lainnya: "Lainnya",
}

const QR_CATEGORY_BADGE: Record<string, string> = {
  umum: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/25",
  layanan: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  jadwal: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/25",
  penawaran: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25",
  lainnya: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/25",
}

/** Urutkan hari Senin-dulu untuk perbandingan & penyimpanan yang stabil */
function sortDays(days: BusinessHourDTO[]): BusinessHourDTO[] {
  return [...days].sort((a, b) => DISPLAY_ORDER.indexOf(a.dayOfWeek as 1) - DISPLAY_ORDER.indexOf(b.dayOfWeek as 1))
}

function SwitchRow({
  id,
  title,
  description,
  icon,
  checked,
  onCheckedChange,
}: {
  id: string
  title: string
  description: string
  icon?: ReactNode
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 p-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <Label htmlFor={id} className="text-sm font-medium">
            {title}
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  )
}

interface QuickReplyFormState {
  shortcut: string
  title: string
  category: string
  content: string
}

const EMPTY_QR_FORM: QuickReplyFormState = { shortcut: "", title: "", category: "umum", content: "" }

/** Dialog tambah/edit balasan cepat — key di parent agar state reset tiap buka */
function QuickReplyDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: QuickReplyDTO | null
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<QuickReplyFormState>(() =>
    editing
      ? {
          shortcut: editing.shortcut,
          title: editing.title,
          category: QUICK_REPLY_CATEGORIES.includes(editing.category as never)
            ? editing.category
            : "umum",
          content: editing.content,
        }
      : EMPTY_QR_FORM
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(editing ? `/api/quick-replies/${editing.id}` : "/api/quick-replies", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortcut: form.shortcut,
          title: form.title.trim(),
          content: form.content,
          category: form.category,
        }),
      })
      const data = (await res.json()) as QuickReplyDTO & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan balasan cepat")
      return data
    },
    onSuccess: (item) => {
      toast.success(editing ? "Balasan cepat diperbarui" : "Balasan cepat ditambahkan", {
        description: `${item.title} (/${item.shortcut})`,
      })
      queryClient.invalidateQueries({ queryKey: ["quick-replies"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const valid =
    /^[a-z0-9]{1,30}$/.test(form.shortcut) &&
    form.title.trim().length > 0 &&
    form.title.trim().length <= 100 &&
    form.content.trim().length > 0 &&
    form.content.length <= 1000

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Balasan Cepat" : "Tambah Balasan Cepat"}</DialogTitle>
          <DialogDescription>
            Template pesan siap pakai untuk membalas chat klien lebih cepat.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qr-shortcut">Pintasan</Label>
            <div className="flex items-center gap-2">
              <span
                className="flex h-10 min-w-9 items-center justify-center rounded-md border bg-muted/60 px-3 font-mono text-sm text-emerald-700 dark:text-emerald-300"
                aria-hidden="true"
              >
                /
              </span>
              <Input
                id="qr-shortcut"
                className="font-mono"
                placeholder="harga"
                value={form.shortcut}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30),
                  }))
                }
                aria-describedby="qr-shortcut-help"
              />
            </div>
            <p id="qr-shortcut-help" className="text-[11px] text-muted-foreground">
              Huruf kecil &amp; angka saja, 1-30 karakter — dipakai sebagai /pintasan.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="qr-title">Judul</Label>
            <Input
              id="qr-title"
              maxLength={100}
              placeholder="Penawaran cuci AC"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Kategori</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((prev) => ({ ...prev, category: v }))}
            >
              <SelectTrigger className="w-full" aria-label="Pilih kategori balasan cepat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUICK_REPLY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {QR_CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="qr-content">Isi Balasan</Label>
              <span
                className={cn(
                  "text-[11px] tabular-nums text-muted-foreground",
                  form.content.length > 900 && "font-medium text-amber-600 dark:text-amber-400"
                )}
                aria-live="polite"
              >
                {form.content.length}/1000
              </span>
            </div>
            <Textarea
              id="qr-content"
              rows={5}
              maxLength={1000}
              className="resize-none"
              placeholder="Halo Kak! Untuk cuci AC kami ada promo bulan ini…"
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!valid || saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {editing ? "Simpan Perubahan" : "Tambah"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============ Keamanan Dashboard (PIN) ============ */

const PIN_PATTERN = /^\d{4,8}$/

/** Input PIN — password, numerik, otomatis 4-8 angka */
function PinInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        placeholder="····"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
        className="font-mono"
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="text-[11px] text-muted-foreground">
        4-8 angka
      </p>
    </div>
  )
}

/** Kartu Keamanan Dashboard — aktifkan / ubah / nonaktifkan PIN */
function KeamananCard() {
  const queryClient = useQueryClient()
  const { data: auth } = useQuery({
    queryKey: ["auth-state"],
    queryFn: async () => {
      const res = await fetch("/api/auth/state", { cache: "no-store" })
      if (!res.ok) throw new Error("Gagal memuat status kunci")
      return res.json() as Promise<AuthState>
    },
    staleTime: 15_000,
  })
  const pinSet = auth?.pinSet ?? false

  // Form aktifasi (belum ada PIN)
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  // Form ubah PIN
  const [oldPin, setOldPin] = useState("")
  const [editNewPin, setEditNewPin] = useState("")
  const [editConfirmPin, setEditConfirmPin] = useState("")
  // Dialog nonaktifkan
  const [disableOpen, setDisableOpen] = useState(false)
  const [disablePin, setDisablePin] = useState("")

  const postPin = async (payload: { currentPin?: string; newPin: string | null }) => {
    const res = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok) throw new Error(data.error ?? "Gagal mengatur PIN")
    return data
  }

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!PIN_PATTERN.test(newPin)) throw new Error("PIN baru harus 4-8 angka")
      if (newPin !== confirmPin) throw new Error("Konfirmasi PIN tidak cocok")
      return postPin({ newPin })
    },
    onSuccess: () => {
      toast.success("PIN aktif — dashboard terkunci", {
        description: "Sesi ini tetap terbuka; kunci aktif saat sesi berakhir atau dikunci manual.",
      })
      setNewPin("")
      setConfirmPin("")
      queryClient.invalidateQueries({ queryKey: ["auth-state"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const changeMutation = useMutation({
    mutationFn: async () => {
      if (!PIN_PATTERN.test(oldPin)) throw new Error("PIN lama harus 4-8 angka")
      if (!PIN_PATTERN.test(editNewPin)) throw new Error("PIN baru harus 4-8 angka")
      if (editNewPin !== editConfirmPin) throw new Error("Konfirmasi PIN baru tidak cocok")
      return postPin({ currentPin: oldPin, newPin: editNewPin })
    },
    onSuccess: () => {
      toast.success("PIN berhasil diubah", {
        description: "Gunakan PIN baru saat dashboard terkunci berikutnya.",
      })
      setOldPin("")
      setEditNewPin("")
      setEditConfirmPin("")
      queryClient.invalidateQueries({ queryKey: ["auth-state"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const disableMutation = useMutation({
    mutationFn: () => postPin({ currentPin: disablePin, newPin: null }),
    onSuccess: () => {
      toast.success("PIN dinonaktifkan", {
        description: "Dashboard kini terbuka tanpa kunci di perangkat ini.",
      })
      setDisableOpen(false)
      setDisablePin("")
      queryClient.invalidateQueries({ queryKey: ["auth-state"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const activateValid = PIN_PATTERN.test(newPin) && newPin === confirmPin
  const changeValid = PIN_PATTERN.test(oldPin) && PIN_PATTERN.test(editNewPin) && editNewPin === editConfirmPin
  const disableValid = PIN_PATTERN.test(disablePin)

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-4">
        <CardTitle className="flex flex-wrap items-center gap-2.5 text-base">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          Keamanan Dashboard
          {pinSet ? (
            <Badge
              variant="outline"
              className="gap-1 rounded-full border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
            >
              <Lock className="size-2.5" aria-hidden="true" />
              Aktif
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="rounded-full border-zinc-500/30 bg-zinc-500/10 px-2 text-[10px] font-medium text-zinc-600 dark:text-zinc-400"
            >
              Nonaktif
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Lindungi akses panel dengan PIN — chat, kontak, dan aksi WhatsApp hanya terlihat setelah dibuka.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {pinSet ? (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-muted-foreground">
                Dashboard akan terkunci saat sesi berakhir atau{" "}
                <span className="font-medium text-foreground">dikunci manual</span> lewat tombol gembok di
                header.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <PinInput id="pin-old" label="PIN Lama" value={oldPin} onChange={setOldPin} />
              <PinInput id="pin-new" label="PIN Baru" value={editNewPin} onChange={setEditNewPin} />
              <PinInput id="pin-confirm" label="Ulangi PIN Baru" value={editConfirmPin} onChange={setEditConfirmPin} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => changeMutation.mutate()} disabled={!changeValid || changeMutation.isPending}>
                {changeMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="size-4" aria-hidden="true" />
                )}
                Ubah PIN
              </Button>

              <AlertDialog
                open={disableOpen}
                onOpenChange={(open) => {
                  setDisableOpen(open)
                  if (!open) setDisablePin("")
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LockOpen className="size-4" aria-hidden="true" />
                    Nonaktifkan PIN
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Nonaktifkan PIN dashboard?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dashboard akan bisa dibuka tanpa PIN oleh siapa pun yang mengakses perangkat ini.
                      Masukkan PIN lama untuk konfirmasi.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-1">
                    <PinInput id="pin-disable" label="PIN Lama" value={disablePin} onChange={setDisablePin} />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault()
                        disableMutation.mutate()
                      }}
                      disabled={!disableValid || disableMutation.isPending}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      {disableMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <LockOpen className="size-4" aria-hidden="true" />
                      )}
                      Ya, Nonaktifkan
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-muted-foreground">
                Belum ada PIN. Aktifkan agar dashboard terkunci dan hanya bisa dibuka dengan PIN 4-8
                angka — chat &amp; aksi WhatsApp Anda tetap berjalan normal di belakang.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <PinInput id="pin-set-new" label="PIN Baru" value={newPin} onChange={setNewPin} />
              <PinInput id="pin-set-confirm" label="Ulangi PIN" value={confirmPin} onChange={setConfirmPin} />
            </div>

            <Button onClick={() => activateMutation.mutate()} disabled={!activateValid || activateMutation.isPending}>
              {activateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-4" aria-hidden="true" />
              )}
              Aktifkan PIN
            </Button>
          </>
        )}

        <Separator />
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Sesi buka kunci bertahan 12 jam di perangkat ini. WhatsApp tetap terhubung &amp; AI tetap
          membalas saat dashboard terkunci.
        </p>
      </CardContent>
    </Card>
  )
}

function QuickReplyTab() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<QuickReplyDTO | null>(null)

  const { data: items, isLoading } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: async () => {
      const res = await fetch("/api/quick-replies", { cache: "no-store" })
      if (!res.ok) throw new Error("Gagal memuat balasan cepat")
      return res.json() as Promise<QuickReplyDTO[]>
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/quick-replies/${id}`, { method: "DELETE" })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Gagal menghapus balasan cepat")
      return data
    },
    onSuccess: () => {
      toast.success("Balasan cepat dihapus")
      queryClient.invalidateQueries({ queryKey: ["quick-replies"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (item: QuickReplyDTO) => {
    setEditing(item)
    setDialogOpen(true)
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Balasan Cepat</CardTitle>
            <CardDescription>
              Template pesan siap pakai untuk membalas chat klien lebih cepat.
            </CardDescription>
          </div>
          <Button onClick={openAdd}>
            <Plus className="size-4" aria-hidden="true" />
            Tambah Balasan
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
          <Zap className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
          <p className="text-muted-foreground">
            Template balasan cepat siap pakai untuk Broadcast promo maupun referensi membalas klien dari HP.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 ring-1 ring-emerald-500/30">
              <Zap className="size-7 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium">Belum ada balasan cepat</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Tambahkan template seperti sapaan, tawaran survey, atau konfirmasi jadwal agar
                membalas chat lebih cepat.
              </p>
            </div>
            <Button size="sm" onClick={openAdd}>
              <Plus className="size-4" aria-hidden="true" />
              Tambah Balasan Cepat
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="group flex items-start justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                      /{item.shortcut}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-1.5 text-[10px] font-medium",
                        QR_CATEGORY_BADGE[item.category] ?? QR_CATEGORY_BADGE.lainnya
                      )}
                    >
                      {QR_CATEGORY_LABEL[item.category] ?? item.category}
                    </Badge>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {item.content}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => openEdit(item)}
                    aria-label={`Edit balasan cepat ${item.title}`}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
                        aria-label={`Hapus balasan cepat ${item.title}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Hapus balasan cepat &quot;{item.title}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Template /{item.shortcut} akan dihapus permanen dan tidak bisa dipakai
                          lagi.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.preventDefault()
                            deleteMutation.mutate(item.id)
                          }}
                          className="bg-destructive text-white hover:bg-destructive/90"
                        >
                          Ya, Hapus
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <QuickReplyDialog
        key={editing?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Tab Jam Operasional — jadwal buka/tutup per hari                    */
/* ------------------------------------------------------------------ */

const BH_PRESETS: Array<{ id: string; label: string; icon: ReactNode; build: () => BusinessHourDTO[] }> = [
  {
    id: "24jam",
    label: "24 Jam",
    icon: <Clock className="size-3.5" aria-hidden="true" />,
    build: () => [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, isOpen: true, openMinute: 0, closeMinute: 1439 })),
  },
  {
    id: "standar",
    label: "Standar Toko",
    icon: <Store className="size-3.5" aria-hidden="true" />,
    build: () =>
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        dayOfWeek: d,
        isOpen: d !== 0, // Minggu tutup
        openMinute: 480, // 08:00
        closeMinute: 1020, // 17:00
      })),
  },
  {
    id: "harikerja",
    label: "Hari Kerja",
    icon: <BriefcaseBusiness className="size-3.5" aria-hidden="true" />,
    build: () =>
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        dayOfWeek: d,
        isOpen: d >= 1 && d <= 5, // Senin–Jumat saja
        openMinute: 480,
        closeMinute: 1020,
      })),
  },
]

function BusinessHoursTab() {
  const queryClient = useQueryClient()
  const [days, setDays] = useState<BusinessHourDTO[] | null>(null)
  const [lastSynced, setLastSynced] = useState("")

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["business-hours"],
    queryFn: async () => {
      const res = await fetch("/api/business-hours", { cache: "no-store" })
      if (!res.ok) throw new Error("Gagal memuat jam operasional")
      return res.json() as Promise<BusinessHoursResponse>
    },
    // Status buka/tutup berubah seiring waktu — segarkan berkala
    refetchInterval: 60_000,
  })

  // Sinkronkan state editor saat data query berubah (pola adjust-state-during-render)
  const dataKey = data ? JSON.stringify(data.days) : ""
  if (data && dataKey !== lastSynced) {
    setLastSynced(dataKey)
    setDays(data.days)
  }

  // Detak tiap 30 detik agar status "Buka/Tutup sekarang" selalu segar
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setNowTick((t) => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  const validDays = days ?? []
  const status = useMemo(() => {
    void nowTick // dependensi waktu — status dihitung ulang tiap detak 30 detik
    return days && days.length === 7 ? getStatusDetail(days) : null
  }, [days, nowTick])
  const summary = useMemo(
    () => (days && days.length === 7 ? describeSchedule(days) : ""),
    [days],
  )

  const dirty =
    days !== null && data !== undefined && JSON.stringify(sortDays(days)) !== JSON.stringify(sortDays(data.days))
  const invalidDay = validDays.find((d) => d.isOpen && d.openMinute >= d.closeMinute)
  const openCount = validDays.filter((d) => d.isOpen).length
  const todayDow = getNowWIB().dayOfWeek

  const updateDay = (dow: number, patch: Partial<BusinessHourDTO>) =>
    setDays((prev) => (prev ?? []).map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)))

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!days || days.length !== 7) throw new Error("Jadwal belum lengkap")
      if (invalidDay) {
        throw new Error(`Jam buka ${DAY_NAMES[invalidDay.dayOfWeek]} harus lebih awal dari jam tutup`)
      }
      const res = await fetch("/api/business-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: sortDays(days) }),
      })
      const result = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(result.error ?? "Gagal menyimpan jam operasional")
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-hours"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
      toast.success("Jam operasional tersimpan", {
        description: "Asisten AI langsung mengikuti jadwal baru ini.",
      })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-16 w-full rounded-xl" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (isError || !days) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="font-medium">Gagal memuat jam operasional</p>
            <p className="mt-1 text-sm text-muted-foreground">Coba muat ulang tab ini.</p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Coba Lagi
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-primary" aria-hidden="true" />
              Jam Operasional
            </CardTitle>
            <CardDescription>
              Jadwal buka per hari — dipakai AI saat menjelaskan jam layanan ke klien.
            </CardDescription>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty || !!invalidDay}>
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            Simpan Jadwal
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Status langsung */}
        {status && (
          <div
            className={cn(
              "relative overflow-hidden rounded-xl border p-4",
              status.open
                ? "border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent"
                : "border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent",
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="relative flex size-2.5" aria-hidden="true">
                <span
                  className={cn(
                    "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                    status.open ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex size-2.5 rounded-full",
                    status.open ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{status.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {status.detail} · waktu Indonesia Barat (WIB)
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 border-transparent",
                  status.open
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                )}
              >
                {openCount}/7 hari buka
              </Badge>
            </div>
            <p className="mt-3 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Jadwal aktif:</span> {summary}
            </p>
          </div>
        )}

        {/* Preset cepat */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Preset cepat:</span>
          {BH_PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => setDays(p.build())}
            >
              {p.icon}
              {p.label}
            </Button>
          ))}
          {dirty && (
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              Belum disimpan
            </Badge>
          )}
        </div>

        {/* Validasi */}
        {invalidDay && (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Jam buka {DAY_NAMES[invalidDay.dayOfWeek]} harus lebih awal daripada jam tutupnya.
          </p>
        )}

        {/* Daftar 7 hari */}
        <div className="space-y-2" role="list" aria-label="Jadwal per hari">
          {DISPLAY_ORDER.map((dow) => {
            const day = validDays.find((d) => d.dayOfWeek === dow)
            if (!day) return null
            const isToday = dow === todayDow
            return (
              <div
                key={dow}
                role="listitem"
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-3 transition-colors sm:flex-nowrap",
                  isToday
                    ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10"
                    : "hover:bg-muted/50",
                  !day.isOpen && "opacity-75",
                )}
              >
                <div className="flex w-28 min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{DAY_NAMES[dow]}</span>
                  {isToday && (
                    <Badge
                      variant="outline"
                      className="h-5 shrink-0 border-transparent bg-emerald-500/15 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
                    >
                      Hari ini
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id={`bh-open-${dow}`}
                    checked={day.isOpen}
                    onCheckedChange={(v) => updateDay(dow, { isOpen: v })}
                    aria-label={`${day.isOpen ? "Tutup" : "Buka"} hari ${DAY_NAMES[dow]}`}
                  />
                  <Label
                    htmlFor={`bh-open-${dow}`}
                    className={cn(
                      "cursor-pointer text-xs font-medium",
                      day.isOpen ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
                    )}
                  >
                    {day.isOpen ? "Buka" : "Tutup"}
                  </Label>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sunrise
                      className={cn("size-3.5 shrink-0", day.isOpen ? "text-amber-500" : "text-muted-foreground/50")}
                      aria-hidden="true"
                    />
                    <Input
                      type="time"
                      disabled={!day.isOpen}
                      value={minuteToHHMM(day.openMinute)}
                      onChange={(e) => {
                        const m = hhmmToMinute(e.target.value)
                        if (m >= 0) updateDay(dow, { openMinute: m })
                      }}
                      aria-label={`Jam buka ${DAY_NAMES[dow]}`}
                      className="h-9 w-[104px] tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <span className="text-muted-foreground" aria-hidden="true">
                    –
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Sunset
                      className={cn("size-3.5 shrink-0", day.isOpen ? "text-rose-400" : "text-muted-foreground/50")}
                      aria-hidden="true"
                    />
                    <Input
                      type="time"
                      disabled={!day.isOpen}
                      value={minuteToHHMM(day.closeMinute)}
                      onChange={(e) => {
                        const m = hhmmToMinute(e.target.value)
                        if (m >= 0) updateDay(dow, { closeMinute: m })
                      }}
                      aria-label={`Jam tutup ${DAY_NAMES[dow]}`}
                      className="h-9 w-[104px] tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <Separator />

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Jadwal ini memberi tahu AI kapan usaha buka — AI tetap membalas di luar jam bila opsi{" "}
          <span className="font-medium text-foreground">Balas di Luar Jam Kerja</span> diaktifkan di tab Pesan, dan
          menyebutkan jam buka berikutnya dengan sopan saat chat di luar jam.
        </p>
      </CardContent>
    </Card>
  )
}

function SettingsForm({
  settings,
  activeTab,
  onTabChange,
}: {
  settings: SettingsDTO
  activeTab: string
  onTabChange: (tab: string) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toForm(settings))

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (form.replyDelayMin < 0 || form.replyDelayMin > 60 || form.replyDelayMax < 0 || form.replyDelayMax > 60) {
        throw new Error("Jeda balas harus di rentang 0-60 detik")
      }
      if (form.replyDelayMin > form.replyDelayMax) {
        throw new Error("Jeda minimal tidak boleh lebih besar dari jeda maksimal")
      }
      if (form.contextMessages < 5 || form.contextMessages > 50) {
        throw new Error("Konteks pesan harus 5-50")
      }
      if (form.handoverMinutes < 5 || form.handoverMinutes > 240) {
        throw new Error("Durasi jeda ambil alih harus 5-240 menit")
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      // Parse SEKALI saja — body stream Response hanya bisa dibaca satu kali
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan pengaturan")
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
      queryClient.invalidateQueries({ queryKey: ["onboarding"] })
      toast.success("Pengaturan tersimpan", {
        description: "Perubahan langsung aktif untuk balasan berikutnya.",
      })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="-mx-1 w-full overflow-x-auto px-1 pb-1 scrollbar-thin sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0 sm:pb-0">
            <TabsList className="w-max">
              <TabsTrigger value="utama">Utama</TabsTrigger>
              <TabsTrigger value="pesan">Pesan</TabsTrigger>
              <TabsTrigger value="jam">Jam Operasional</TabsTrigger>
              <TabsTrigger value="fitur">Fitur Pintar</TabsTrigger>
              <TabsTrigger value="balasan">Balasan Cepat</TabsTrigger>
            </TabsList>
          </div>
          {activeTab !== "balasan" && activeTab !== "jam" && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              Simpan Pengaturan
            </Button>
          )}
        </div>

        <TabsContent value="utama" className="mt-4">
          <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Identitas &amp; Perilaku</CardTitle>
              <CardDescription>Profil usaha dan cara kerja asisten AI.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Nama Usaha</Label>
                  <Input
                    id="businessName"
                    value={form.businessName}
                    onChange={(e) => update("businessName", e.target.value)}
                    placeholder="Mukundo Teknologi Indonesia"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerName">Nama Pemilik / Admin</Label>
                  <Input
                    id="ownerName"
                    value={form.ownerName}
                    onChange={(e) => update("ownerName", e.target.value)}
                    placeholder="Admin Mukundo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assistantName">Nama Asisten AI</Label>
                  <Input
                    id="assistantName"
                    value={form.assistantName}
                    onChange={(e) => update("assistantName", e.target.value)}
                    placeholder="Rani"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contextMessages">Jumlah Konteks Pesan</Label>
                  <Input
                    id="contextMessages"
                    type="number"
                    min={5}
                    max={50}
                    value={form.contextMessages}
                    onChange={(e) => update("contextMessages", Number(e.target.value) || 0)}
                    aria-describedby="context-help"
                  />
                  <p id="context-help" className="text-[11px] text-muted-foreground">
                    5-50 pesan terakhir dipakai AI sebagai konteks.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="persona">Persona / Instruksi Tambahan</Label>
                <Textarea
                  id="persona"
                  rows={4}
                  value={form.persona}
                  onChange={(e) => update("persona", e.target.value)}
                  placeholder="Contoh: Selalu tawarkan paket cuci 3x sekaligus. Prioritaskan jadwal pagi hari."
                />
                <p className="text-[11px] text-muted-foreground">
                  Instruksi khusus untuk memodelkan gaya bicara &amp; prioritas asisten.
                </p>
              </div>

              <SwitchRow
                id="autoReplyEnabled"
                title="Balasan Otomatis"
                description="AI membalas setiap chat masuk dari klien secara otomatis."
                checked={form.autoReplyEnabled}
                onCheckedChange={(v) => update("autoReplyEnabled", v)}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="replyDelayMin">Jeda Balas Minimal (detik)</Label>
                  <Input
                    id="replyDelayMin"
                    type="number"
                    min={0}
                    max={60}
                    value={form.replyDelayMin}
                    onChange={(e) => update("replyDelayMin", Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="replyDelayMax">Jeda Balas Maksimal (detik)</Label>
                  <Input
                    id="replyDelayMax"
                    type="number"
                    min={0}
                    max={60}
                    value={form.replyDelayMax}
                    onChange={(e) => update("replyDelayMax", Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <p className="-mt-2 text-[11px] text-muted-foreground">
                Rentang 0-60 detik — jeda acak agar terasa seperti mengetik manusia.
              </p>

              <SwitchRow
                id="typingIndicator"
                title="Indikator Mengetik"
                description="Tampilkan status 'sedang mengetik…' saat AI menyusun balasan."
                checked={form.typingIndicator}
                onCheckedChange={(v) => update("typingIndicator", v)}
              />
            </CardContent>
          </Card>
          <KeamananCard />
          </div>
        </TabsContent>

        <TabsContent value="pesan" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Pesan &amp; Jam Operasional</CardTitle>
              <CardDescription>Sapaan awal, pesan di luar jam, dan jam kerja.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="greetingMessage">Pesan Sapaan Awal</Label>
                <Textarea
                  id="greetingMessage"
                  rows={3}
                  value={form.greetingMessage}
                  onChange={(e) => update("greetingMessage", e.target.value)}
                  placeholder="Halo Kak! Terima kasih sudah menghubungi Mukundo Teknologi 😊 Ada yang bisa kami bantu terkait AC atau listrik?"
                />
                <p className="text-[11px] text-muted-foreground">
                  Dipakai sebagai acuan sapaan hangat untuk pesan pertama dari klien baru.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Jam Operasional</Label>
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
                  <CalendarClock className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                    Jadwal buka kini diatur <span className="font-medium text-foreground">per hari</span> — lengkap
                    dengan preset cepat &amp; status buka langsung.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onTabChange("jam")}
                  >
                    Atur Jadwal
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <SwitchRow
                id="outsideHoursReply"
                title="Balas di Luar Jam Kerja"
                description="Jika dimatikan, chat di luar jam operasional dibalas dengan pesan di bawah."
                checked={form.outsideHoursReply}
                onCheckedChange={(v) => update("outsideHoursReply", v)}
              />

              <div className="space-y-2">
                <Label htmlFor="awayMessage">Pesan di Luar Jam</Label>
                <Textarea
                  id="awayMessage"
                  rows={3}
                  value={form.awayMessage}
                  onChange={(e) => update("awayMessage", e.target.value)}
                  placeholder="Terima kasih Kak, kami sedang di luar jam operasional. Tim kami akan membalas secepatnya pagi nanti 😊"
                />
                <p className="text-[11px] text-muted-foreground">
                  Ditampilkan otomatis saat di luar jam kerja bila balasan di luar jam dimatikan.
                </p>
              </div>

              <Separator />

              <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-muted-foreground">
                  Usaha Mukundo melayani 24 jam — bila ingin AI tetap membalas kapan pun, aktifkan preset{" "}
                  <span className="font-medium text-foreground">24 Jam</span> di tab Jam Operasional dan biarkan
                  opsi balasan di luar jam menyala.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jam" className="mt-4">
          <BusinessHoursTab />
        </TabsContent>

        <TabsContent value="fitur" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Fitur Pintar AI</CardTitle>
              <CardDescription>
                Kemampuan tambahan asisten untuk memahami pesan suara, foto, dokumen PDF, dan potensi order dari klien.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <SwitchRow
                id="transcribeVoice"
                title="Transkrip Pesan Suara"
                description="Ubah voice note klien jadi teks otomatis (AI membaca dan membalasnya)"
                icon={<AudioLines className="size-4" aria-hidden="true" />}
                checked={form.transcribeVoice}
                onCheckedChange={(v) => update("transcribeVoice", v)}
              />
              <SwitchRow
                id="visionImages"
                title="Pahami Foto Klien"
                description="Foto yang dikirim klien dianalisis AI (mis. foto unit AC) lalu dibalas"
                icon={<ImageIcon className="size-4" aria-hidden="true" />}
                checked={form.visionImages}
                onCheckedChange={(v) => update("visionImages", v)}
              />
              <SwitchRow
                id="visionDocuments"
                title="Baca Dokumen PDF Klien"
                description="Penawaran/kwitansi/nota PDF dibaca AI (maks 3 halaman pertama) lalu dibalas"
                icon={<FileText className="size-4" aria-hidden="true" />}
                checked={form.visionDocuments}
                onCheckedChange={(v) => update("visionDocuments", v)}
              />
              <SwitchRow
                id="leadDetection"
                title="Deteksi Lead Otomatis"
                description="AI menandai chat yang berpotensi jadi order (Potensial/Hot) untuk follow-up"
                icon={<Flame className="size-4" aria-hidden="true" />}
                checked={form.leadDetection}
                onCheckedChange={(v) => update("leadDetection", v)}
              />
              <SwitchRow
                id="handoverEnabled"
                title="Jeda AI saat Anda membalas manual"
                description="Saat Anda membalas chat dari HP atau dashboard, AI otomatis dijeda untuk kontak itu agar tidak menyela. AI lanjut otomatis setelah jeda berakhir."
                icon={<Hand className="size-4" aria-hidden="true" />}
                checked={form.handoverEnabled}
                onCheckedChange={(v) => update("handoverEnabled", v)}
              />
              {form.handoverEnabled && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 sm:ml-11">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-full max-w-48 space-y-1.5">
                      <Label htmlFor="handoverMinutes">Lanjut otomatis setelah (menit)</Label>
                      <Input
                        id="handoverMinutes"
                        type="number"
                        inputMode="numeric"
                        min={5}
                        max={240}
                        value={form.handoverMinutes}
                        onChange={(e) => update("handoverMinutes", Number(e.target.value) || 0)}
                        aria-describedby="handover-minutes-help"
                        className="h-9 w-28 tabular-nums"
                      />
                    </div>
                    <p id="handover-minutes-help" className="pb-2.5 text-[11px] text-muted-foreground">
                      5-240 menit — lama AI menunggu sebelum membantu kembali setelah Anda membalas manual.
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 space-y-2 text-muted-foreground">
                  <p className="text-xs font-medium text-foreground">Arti status lead klien</p>
                  <ul className="space-y-1.5">
                    {LEAD_LEGEND.map(({ status, hint }) => (
                      <li key={status} className="flex items-start gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "mt-0.5 shrink-0 rounded-full px-1.5 text-[10px] font-medium",
                            LEAD_STATUS_BADGE[status]
                          )}
                        >
                          {LEAD_STATUS_LABEL[status]}
                        </Badge>
                        <span className="text-xs leading-relaxed">{hint}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] leading-relaxed">
                    Lead terdeteksi otomatis dari isi percakapan dan tampil di kartu “Kontrol AI per
                    Percakapan” pada Dashboard.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="balasan" className="mt-4">
          <QuickReplyTab />
        </TabsContent>
      </Tabs>

      {activeTab !== "balasan" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden="true" />
          Perubahan langsung aktif untuk balasan berikutnya — tidak perlu memulai ulang apapun.
        </p>
      )}
    </div>
  )
}

export function PengaturanView() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings", { cache: "no-store" })
      if (!res.ok) throw new Error("Gagal memuat pengaturan")
      return res.json() as Promise<SettingsDTO>
    },
  })
  // Tab aktif dipegang induk — form di-remount setelah simpan (key=updatedAt), tab tidak boleh ikut reset
  const [activeTab, setActiveTab] = useState("utama")

  if (isLoading || !settings) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </CardContent>
      </Card>
    )
  }

  // key=updatedAt → form selalu sinkron dengan data terbaru setelah simpan
  // (activeTab dipegang induk sehingga remount tidak me-reset tab yang sedang dibuka)
  return (
    <SettingsForm
      key={settings.updatedAt}
      settings={settings}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  )
}
