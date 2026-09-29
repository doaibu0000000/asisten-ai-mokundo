"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  MessageSquare,
  QrCode,
  Rocket,
  Sparkles,
  Trophy,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { OnboardingDTO, OnboardingStepDTO, OnboardingStepId } from "@/lib/wa-types"
import { useSocket } from "@/components/wa/socket-provider"
import type { ActiveView } from "@/components/wa/nav"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const fetchOnboarding = async (): Promise<OnboardingDTO> => {
  const res = await fetch("/api/onboarding", { cache: "no-store" })
  if (!res.ok) throw new Error("Gagal memuat panduan awal")
  return res.json()
}

interface StepMeta {
  id: OnboardingStepId
  title: string
  short: string
  desc: string
  tips: [string, string, string]
  icon: typeof QrCode
  view: ActiveView
  cta: string
  tile: string
}

export const ONBOARDING_STEPS: StepMeta[] = [
  {
    id: "whatsapp",
    title: "Hubungkan WhatsApp",
    short: "Scan QR nomor pribadi Anda",
    desc: "Hubungkan nomor WhatsApp pribadi agar asisten dapat membaca dan membalas chat klien secara otomatis.",
    tips: [
      "Buka halaman Koneksi lalu scan QR dari HP",
      "Sesi tersimpan — cukup scan sekali saja",
      "Nomor Anda tetap bisa dipakai normal di HP",
    ],
    icon: QrCode,
    view: "koneksi",
    cta: "Buka Halaman Koneksi",
    tile: "from-emerald-400 to-teal-600",
  },
  {
    id: "simulator",
    title: "Uji Balasan AI",
    short: "Coba simulasi chat tanpa kirim nyata",
    desc: "Rasakan gaya balasan asisten lewat Simulator — percakapan tiruan yang tidak mengirim WhatsApp nyata.",
    tips: [
      "Ketik pesan sebagai pelanggan contoh",
      "Lihat bagaimana asisten menjawabnya",
      "Aman — tidak ada pesan yang benar-benar terkirim",
    ],
    icon: FlaskConical,
    view: "simulator",
    cta: "Buka Simulator",
    tile: "from-amber-400 to-orange-500",
  },
  {
    id: "knowledge",
    title: "Tambah Pengetahuan",
    short: "Ajari asisten soal layanan & harga",
    desc: "Masukkan informasi layanan AC, kelistrikan, dan harga agar balasan asisten akurat sesuai bisnis Anda.",
    tips: [
      "Mulai dari layanan utama dan tarif",
      "Tambahkan FAQ yang sering ditanyakan klien",
      "Item aktif otomatis dipakai oleh AI",
    ],
    icon: BookOpen,
    view: "knowledge",
    cta: "Buka Basis Pengetahuan",
    tile: "from-teal-400 to-emerald-600",
  },
  {
    id: "personalize",
    title: "Personalisasi Asisten",
    short: "Atur persona & gaya bicara",
    desc: "Tulis instruksi persona agar karakter dan aturan balasan asisten sesuai keinginan Anda.",
    tips: [
      "Contoh: selalu tawarkan jadwal survey",
      "Tentukan gaya bahasa yang diinginkan",
      "Tanpa persona, asisten memakai gaya bawaan ramah",
    ],
    icon: Sparkles,
    view: "pengaturan",
    cta: "Buka Pengaturan",
    tile: "from-rose-400 to-pink-600",
  },
  {
    id: "chat",
    title: "Terima Chat Pertama",
    short: "Asisten mulai bekerja",
    desc: "Chat klien yang masuk otomatis dibalas asisten dengan pengetahuan yang sudah Anda isi — pantau aktivitasnya di Log Aktivitas.",
    tips: [
      "Kirim pesan percobaan dari nomor lain",
      "Kontrol AI per chat dari Dashboard atau lewat titik ( . )",
      "Lead potensial terdeteksi otomatis",
    ],
    icon: MessageSquare,
    view: "log",
    cta: "Lihat Log Aktivitas",
    tile: "from-orange-500 to-rose-500",
  },
]

/** Query bersama (cache React Query dipakai kartu & wizard sekaligus) */
function useOnboardingData() {
  const { status, serviceConnected } = useSocket()
  const { data, isLoading } = useQuery({
    queryKey: ["onboarding"],
    queryFn: fetchOnboarding,
    refetchInterval: 30_000,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })

  // Langkah whatsapp dioverride realtime dari status socket (lebih segar dari DB)
  const steps = useMemo<OnboardingStepDTO[]>(() => {
    if (!data) return []
    return data.steps.map((s) =>
      s.id === "whatsapp" ? { ...s, done: serviceConnected ? status.status === "connected" : s.done } : s,
    )
  }, [data, serviceConnected, status.status])

  const total = data?.total ?? ONBOARDING_STEPS.length
  const completed = steps.filter((s) => s.done).length
  const allDone = total > 0 && completed === total
  return { data, steps, completed, total, allDone, isLoading }
}

/** Notifikasi lokal agar semua pemakai flag yang sama re-render saat salah satunya mengubah nilai */
const flagListeners = new Set<() => void>()
function notifyFlagListeners() {
  flagListeners.forEach((listener) => listener())
}

/** State persisten di localStorage via useSyncExternalStore (aman dari hydration mismatch) */
function usePersistentFlag(key: string, initial = false) {
  const subscribe = useCallback((onChange: () => void) => {
    flagListeners.add(onChange)
    window.addEventListener("storage", onChange)
    return () => {
      flagListeners.delete(onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [])

  const getSnapshot = useCallback((): boolean => {
    try {
      return window.localStorage.getItem(key) === "1"
    } catch {
      return initial
    }
  }, [key, initial])

  const getServerSnapshot = useCallback((): boolean => initial, [initial])

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const update = useCallback(
    (v: boolean) => {
      try {
        window.localStorage.setItem(key, v ? "1" : "0")
      } catch {
        /* abaikan */
      }
      notifyFlagListeners()
    },
    [key],
  )

  return [value, update] as const
}

/* ------------------------------------------------------------------ */
/* Progress ring                                                       */
/* ------------------------------------------------------------------ */

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const size = 68
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = total > 0 ? completed / total : 0
  return (
    <div
      className="relative shrink-0"
      role="img"
      aria-label={`Progres panduan: ${completed} dari ${total} langkah selesai`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="onb-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="url(#onb-ring-grad)"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-semibold leading-none tabular-nums">
          {completed}
          <span className="text-muted-foreground">/{total}</span>
        </span>
        <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">langkah</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Kartu checklist di Dashboard                                        */
/* ------------------------------------------------------------------ */


export function OnboardingChecklist({
  onNavigate,
  onOpenWizard,
}: {
  onNavigate: (v: ActiveView) => void
  onOpenWizard: () => void
}) {
  const { data, steps, completed, total, allDone, isLoading } = useOnboardingData()
  const [collapsed, setCollapsed] = usePersistentFlag("mukundo.onboarding.collapsed")
  const [dismissed, setDismissed] = usePersistentFlag("mukundo.onboarding.dismissed")

  const remaining = total - completed

  // Strip ramping untuk membuka kembali panduan yang disembunyikan
  if (dismissed) {
    if (allDone || !data) return null
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setDismissed(false)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-dashed px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50"
        aria-label={`Panduan awal disembunyikan, ${completed} dari ${total} langkah selesai. Tampilkan kembali.`}
      >
        <Rocket className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          Panduan awal disembunyikan — <span className="font-medium tabular-nums">{completed}/{total}</span> langkah
          selesai.
        </span>
        <span className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">Tampilkan</span>
      </motion.button>
    )
  }

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <Skeleton className="size-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="size-[68px] shrink-0 rounded-full" />
        </CardContent>
      </Card>
    )
  }

  // Keadaan lengkap — kartu perayaan gradient
  if (allDone) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-800 p-5 text-white shadow-lg"
      >
        <div className="absolute -right-10 -top-12 size-36 rounded-full bg-white/10" aria-hidden="true" />
        <div className="absolute -bottom-12 -left-8 size-28 rounded-full bg-black/10" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Trophy className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight">Panduan Awal Selesai</h3>
            <p className="mt-0.5 text-sm text-white/85">
              Semua langkah persiapan lengkap — asisten WhatsApp Anda siap maksimal.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="border-transparent bg-white/15 text-white hover:bg-white/25 hover:text-white"
            onClick={() => setDismissed(true)}
          >
            Sembunyikan
          </Button>
        </div>
      </motion.div>
    )
  }

  // Keadaan berjalan — kartu checklist
  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600 opacity-70"
        aria-hidden="true"
      />
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-md shadow-emerald-500/25">
            <Rocket className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight">Panduan Awal</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {remaining > 0 ? (
                <>
                  <span className="font-medium tabular-nums text-foreground">{remaining}</span> langkah lagi agar
                  asisten siap maksimal
                </>
              ) : (
                "Lengkapi langkah agar asisten siap maksimal"
              )}
            </p>
          </div>
          <ProgressRing completed={completed} total={total} />
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-8 shrink-0 text-muted-foreground sm:inline-flex"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Buka daftar langkah panduan" : "Tutup daftar langkah panduan"}
            aria-expanded={!collapsed}
          >
            <ChevronDown className={cn("size-4 transition-transform duration-200", !collapsed && "rotate-180")} />
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="onb-steps"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <ul className="mt-2 space-y-0.5" aria-label="Daftar langkah panduan awal">
                {ONBOARDING_STEPS.map((meta, i) => {
                  const done = steps.find((s) => s.id === meta.id)?.done ?? false
                  return (
                    <motion.li
                      key={meta.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.05 }}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
                        !done && "hover:bg-muted/50",
                      )}
                    >
                      {done ? (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                          <Check className="size-3.5" aria-hidden="true" />
                        </span>
                      ) : (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                      )}
                      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm", meta.tile)}>
                        <meta.icon className="size-4.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-medium", done && "text-muted-foreground")}>
                          {meta.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground/80">{meta.short}</p>
                      </div>
                      {done ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        >
                          <Check className="size-3" aria-hidden="true" />
                          Selesai
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                          onClick={() => onNavigate(meta.view)}
                          aria-label={`Kerjakan langkah: ${meta.title}`}
                        >
                          Kerjakan
                          <ArrowRight className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </motion.li>
                  )
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium tabular-nums">{completed}</span>/{total} selesai
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setDismissed(true)}>
                    Sembunyikan
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={onOpenWizard}>
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    Mulai Panduan
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Versi ringkas saat ter-collapse: chip progres */}
        {collapsed && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 sm:mt-2 sm:border-0 sm:pt-0">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium tabular-nums">{completed}</span>/{total} selesai
            </p>
            <div className="flex gap-1.5" aria-hidden="true">
              {ONBOARDING_STEPS.map((meta) => {
                const done = steps.find((s) => s.id === meta.id)?.done ?? false
                return (
                  <span
                    key={meta.id}
                    className={cn("size-1.5 rounded-full", done ? "bg-emerald-500" : "bg-muted-foreground/30")}
                  />
                )
              })}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
              onClick={onOpenWizard}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              Buka Panduan
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Overlay wizard step-by-step                                         */
/* ------------------------------------------------------------------ */

export function OnboardingWizard({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (v: ActiveView) => void
}) {
  const { data, steps, completed, total, allDone } = useOnboardingData()
  const [index, setIndex] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reset ke langkah pertama setiap kali dibuka — pola "adjust state during render"
  // (bukan useEffect) agar tidak memicu react-hooks/set-state-in-effect
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setIndex(0)
  }

  // Kunci scroll body + tutup dengan ESC + fokus dialog
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const isFinal = index >= ONBOARDING_STEPS.length
  const meta = !isFinal ? ONBOARDING_STEPS[Math.min(index, ONBOARDING_STEPS.length - 1)] : null
  const pendingSteps = ONBOARDING_STEPS.filter((m) => !(steps.find((s) => s.id === m.id)?.done ?? false))

  const goTo = (i: number) => setIndex(Math.max(0, Math.min(ONBOARDING_STEPS.length, i)))

  return (
    <AnimatePresence>
      <motion.div
        key="onb-wizard-backdrop"
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="onb-wizard-title"
          tabIndex={-1}
          className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border bg-card shadow-2xl outline-none sm:rounded-2xl"
          initial={{ opacity: 0, y: 48, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 32, scale: 0.98 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-md shadow-emerald-500/25">
              <Rocket className="size-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p id="onb-wizard-title" className="truncate text-sm font-semibold tracking-tight">
                Panduan Awal
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium tabular-nums">{completed}</span>/{total} langkah selesai
              </p>
            </div>
            <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Tutup panduan">
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Progres tersegmen */}
          <div
            className="flex gap-1.5 px-5 pt-4"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.min(index + 1, total)}
            aria-label={`Progres panduan: langkah ${Math.min(index + 1, total)} dari ${total}`}
          >
            {ONBOARDING_STEPS.map((s, i) => {
              const done = steps.find((st) => st.id === s.id)?.done ?? false
              const active = i === index
              return (
                <div key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-600"
                    initial={false}
                    animate={{ width: done || i < index ? "100%" : active ? "45%" : "0%" }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              )
            })}
          </div>

          {/* Konten */}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <AnimatePresence mode="wait">
              {isFinal ? (
                <motion.div
                  key="onb-final"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col items-center text-center"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -12 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.08 }}
                    className={cn(
                      "flex size-20 items-center justify-center rounded-full text-white shadow-lg",
                      allDone ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/30" : "bg-gradient-to-br from-emerald-400 to-teal-600 shadow-emerald-500/30",
                    )}
                  >
                    {allDone ? <Trophy className="size-9" aria-hidden="true" /> : <Rocket className="size-9" aria-hidden="true" />}
                  </motion.div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">
                    {allDone ? "Panduan Selesai!" : "Hampir Siap!"}
                  </h3>
                  <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {allDone
                      ? "Semua langkah sudah lengkap. Asisten WhatsApp Anda siap bekerja maksimal untuk Mukundo Teknologi."
                      : `${completed} dari ${total} langkah sudah selesai — sisanya bisa dikerjakan kapan saja lewat kartu Panduan Awal di Dashboard.`}
                  </p>
                  {pendingSteps.length > 0 && (
                    <div className="mt-5 w-full space-y-1.5 text-left">
                      <p className="text-xs font-medium text-muted-foreground">Langkah tersisa:</p>
                      {pendingSteps.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2"
                        >
                          <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white", p.tile)}>
                            <p.icon className="size-3.5" aria-hidden="true" />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                            onClick={() => {
                              onClose()
                              onNavigate(p.view)
                            }}
                          >
                            Kerjakan
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {allDone && data && (
                    <div className="mt-5 grid w-full grid-cols-2 gap-3">
                      <div className="rounded-xl border bg-muted/40 p-3 text-center">
                        <p className="text-lg font-semibold tabular-nums">{data.counts.knowledge}</p>
                        <p className="text-[11px] text-muted-foreground">item pengetahuan</p>
                      </div>
                      <div className="rounded-xl border bg-muted/40 p-3 text-center">
                        <p className="text-lg font-semibold tabular-nums">{data.counts.chats}</p>
                        <p className="text-[11px] text-muted-foreground">percakapan klien</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                meta && (
                  <motion.div
                    key={meta.id}
                    initial={{ opacity: 0, x: 28 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -28 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    <div className="flex flex-col items-center text-center">
                      <motion.div
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 260, damping: 18 }}
                        className={cn("flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", meta.tile)}
                      >
                        <meta.icon className="size-8" aria-hidden="true" />
                      </motion.div>
                      {steps.find((s) => s.id === meta.id)?.done ? (
                        <Badge
                          variant="outline"
                          className="mt-4 gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="size-3" aria-hidden="true" />
                          Sudah Selesai
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="mt-4 gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          <span className="size-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
                          Belum Dikerjakan
                        </Badge>
                      )}
                      <h3 className="mt-3 text-lg font-semibold tracking-tight">{meta.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{meta.desc}</p>
                    </div>
                    <ul className="mt-5 space-y-2.5 rounded-xl border bg-muted/40 p-4 text-left">
                      {meta.tips.map((tip) => (
                        <li key={tip} className="flex items-start gap-2.5 text-sm">
                          <CheckCircle2
                            className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                            aria-hidden="true"
                          />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="mt-5 w-full"
                      onClick={() => {
                        onClose()
                        onNavigate(meta.view)
                      }}
                    >
                      {meta.cta}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Button>
                  </motion.div>
                )
              )}
            </AnimatePresence>
          </div>

          {/* Navigasi */}
          <div className="flex items-center justify-between gap-2 border-t px-5 py-4">
            <Button
              variant="ghost"
              size="sm"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              aria-label="Kembali ke langkah sebelumnya"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Kembali
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {isFinal ? "Selesai" : `Langkah ${index + 1} dari ${total}`}
            </span>
            {isFinal ? (
              <Button size="sm" onClick={onClose}>
                <Check className="size-4" aria-hidden="true" />
                Mulai Pakai
              </Button>
            ) : (
              <Button size="sm" onClick={() => goTo(index + 1)} aria-label="Lanjut ke langkah berikutnya">
                {index === total - 1 ? "Selesai" : "Lanjut"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
