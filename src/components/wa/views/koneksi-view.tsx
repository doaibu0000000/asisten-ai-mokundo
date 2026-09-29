"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  BadgeCheck,
  CheckCircle2,
  Copy,
  Hash,
  KeyRound,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
  Server,
  Smartphone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useSocket } from "@/components/wa/socket-provider"
import { formatFull, formatUptime, initials } from "@/components/wa/format"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { Separator } from "@/components/ui/separator"

const STEPS = [
  "Buka aplikasi WhatsApp di HP Anda",
  "Masuk ke Setelan, lalu pilih Perangkat Tertaut",
  "Ketuk tombol Tautkan Perangkat",
  "Arahkan kamera HP untuk memindai QR di layar ini",
]

const PAIRING_STEPS = [
  "Masukkan nomor WhatsApp Anda (format 62…) lalu klik Minta Kode",
  "Di HP: buka WhatsApp → Setelan → Perangkat Tertaut",
  "Pilih Tautkan dengan Nomor Telepon",
  "Masukkan 8-digit kode yang muncul di layar ini",
]

function formatPairingCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`
}

function ServiceBadge({ serviceConnected }: { serviceConnected: boolean }) {
  return (
    <Badge variant={serviceConnected ? "default" : "secondary"} className="gap-1">
      <Server className="size-3" aria-hidden="true" />
      Layanan AI {serviceConnected ? "Online" : "Offline"}
    </Badge>
  )
}

function ConnectedPanel({
  ownerName,
  ownerNumber,
  ownerJid,
  connectedAt,
  uptime,
  loggingOut,
  onLogout,
}: {
  ownerName?: string
  ownerNumber?: string
  ownerJid?: string
  connectedAt?: string | null
  uptime: string | null
  loggingOut: boolean
  onLogout: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 p-8 text-center"
    >
      <CheckCircle2 className="size-14 text-emerald-600" aria-hidden="true" />
      <div>
        <p className="text-lg font-semibold tracking-tight">WhatsApp Terhubung</p>
        <p className="text-sm text-muted-foreground">{uptime ? `Aktif selama ${uptime}` : "Sesi aktif"}</p>
      </div>
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm">
        <div className="flex size-11 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
          {initials(ownerName, "WA")}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{ownerName ?? "Pengguna"}</p>
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {ownerNumber ? `+${ownerNumber.replace(/^\+/, "")}` : ownerJid ?? "-"}
          </p>
          {connectedAt && <p className="text-[11px] text-muted-foreground/70">Sejak {formatFull(connectedAt)}</p>}
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full sm:w-auto">
            <LogOut className="size-4" aria-hidden="true" />
            Putuskan &amp; Hapus Sesi
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Putuskan sesi WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Nomor Anda akan keluar dari perangkat ini dan asisten AI berhenti membalas. Anda perlu scan QR atau kode
              pairing lagi untuk menghubungkan ulang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                onLogout()
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {loggingOut ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Ya, Putuskan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

function QrPanel({
  qr,
  isScanning,
  statusText,
  requesting,
  serviceConnected,
  onRequestQr,
}: {
  qr: string | null
  isScanning: boolean
  statusText: string
  requesting: boolean
  serviceConnected: boolean
  onRequestQr: () => void
}) {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4">
      <div className="relative">
        {qr && (
          <span
            className="absolute -inset-2 animate-pulse rounded-[1.75rem] border-2 border-emerald-500/40"
            aria-hidden="true"
          />
        )}
        <div className="relative flex size-64 items-center justify-center overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-white p-3 shadow-inner">
          {qr ? (
            <motion.img
              key={qr}
              src={qr}
              alt="Kode QR untuk login WhatsApp"
              className="h-full w-full object-contain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 p-6" aria-live="polite">
              <Skeleton className="size-44 rounded-xl" />
              <p className="text-center text-xs text-zinc-500">{isScanning ? "Menyiapkan QR…" : "QR belum diminta"}</p>
            </div>
          )}
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
        {statusText}
      </p>
      <Button variant="outline" onClick={onRequestQr} disabled={requesting || !serviceConnected}>
        {requesting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        {isScanning ? "Minta QR Baru" : "Mulai Koneksi"}
      </Button>
      {!serviceConnected && (
        <p className="text-center text-xs text-muted-foreground">
          Layanan WA sedang offline — tombol aktif otomatis setelah layanan kembali.
        </p>
      )}
    </div>
  )
}

function PairingPanel({
  pairing,
  requesting,
  serviceConnected,
  onRequestPairing,
  onResetPairing,
}: {
  pairing: { code: string; number: string } | null
  requesting: boolean
  serviceConnected: boolean
  onRequestPairing: (number: string) => void
  onResetPairing: () => void
}) {
  const [number, setNumber] = useState("")

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const digits = number.replace(/\D/g, "")
    if (!digits) {
      toast.error("Nomor HP wajib diisi")
      return
    }
    if (digits.length < 9 || digits.length > 15) {
      toast.error("Nomor tidak valid — gunakan format 628xxx")
      return
    }
    onRequestPairing(digits)
  }

  const copyCode = async () => {
    if (!pairing?.code) return
    try {
      await navigator.clipboard.writeText(pairing.code)
      toast.success("Kode disalin", { description: "Tempel di HP Anda pada layar Tautkan dengan Nomor Telepon." })
    } catch {
      toast.error("Gagal menyalin — salin manual dari layar")
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      {!pairing ? (
        <form onSubmit={submit} className="w-full space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pairing-number">Nomor WhatsApp Anda</Label>
            <div className="flex items-center gap-2">
              <span
                className="flex h-10 min-w-12 items-center justify-center rounded-md border bg-muted/60 px-3 text-sm font-medium tabular-nums"
                aria-hidden="true"
              >
                +62
              </span>
              <Input
                id="pairing-number"
                inputMode="tel"
                autoComplete="tel"
                placeholder="81234567890"
                value={number.slice(2)}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 13)
                  setNumber("62" + v)
                }}
                aria-describedby="pairing-help"
                className="tabular-nums"
              />
            </div>
            <p id="pairing-help" className="text-[11px] text-muted-foreground">
              Format internasional tanpa tanda + (contoh: 6281234567890).
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={requesting || !serviceConnected}>
            {requesting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="size-4" aria-hidden="true" />
            )}
            Minta Kode Pairing
          </Button>
          {!serviceConnected && (
            <p className="text-center text-xs text-muted-foreground">
              Layanan WA sedang offline — coba lagi setelah layanan aktif.
            </p>
          )}
        </form>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full space-y-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-transparent p-6 text-center"
        >
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Hash className="size-4 text-primary" aria-hidden="true" />
            Kode untuk +{pairing.number}
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="group flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-emerald-500/40 bg-card px-4 py-5 transition-colors hover:border-emerald-500/70"
            aria-label={`Kode pairing ${formatPairingCode(pairing.code)}, klik untuk menyalin`}
          >
            <span className="text-4xl font-bold tracking-[0.2em] tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatPairingCode(pairing.code)}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              <Copy className="size-3.5" aria-hidden="true" />
              Klik untuk menyalin
            </span>
          </button>
          <p className="text-xs leading-relaxed text-muted-foreground" aria-live="polite">
            Masukkan kode ini di HP Anda dalam waktu ± 2 menit. Kode hanya berlaku sekali.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetPairing}
            disabled={requesting || !serviceConnected}
            aria-label="Hapus kode ini dan minta kode pairing baru"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Minta Kode Baru
          </Button>
        </motion.div>
      )}
    </div>
  )
}

export function KoneksiView() {
  const { status, qr, pairing, serviceConnected, requestQr, requestPairing, clearPairing, logout, refreshStatus } =
    useSocket()
  const [requesting, setRequesting] = useState(false)
  const [requestingPairing, setRequestingPairing] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])
  const uptime = formatUptime(status.connectedAt, now)

  const handleRequestQr = async () => {
    setRequesting(true)
    try {
      const res = await requestQr()
      if (res.ok) {
        toast.success("Permintaan QR dikirim", {
          description: "QR akan muncul beberapa saat, mohon tetap di halaman ini.",
        })
      } else {
        toast.error(res.error ?? "Gagal meminta QR")
      }
    } finally {
      setRequesting(false)
    }
  }

  const handleRequestPairing = async (number: string) => {
    setRequestingPairing(true)
    try {
      const res = await requestPairing(number)
      if (res.ok) {
        if (res.code) {
          toast.success("Kode pairing siap", {
            description: `Kode ${formatPairingCode(res.code)} — masukkan di HP Anda.`,
          })
        } else {
          toast.info("Menyiapkan kode…", {
            description: "Menghubungkan ke server WhatsApp — kode muncul otomatis sebentar lagi.",
          })
        }
      } else {
        toast.error(res.error ?? "Gagal meminta kode pairing")
      }
    } finally {
      setRequestingPairing(false)
    }
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const res = await logout()
      if (res.ok) {
        toast.success("Sesi WhatsApp diputus", { description: "Nomor berhasil dikeluarkan dari perangkat ini." })
        await refreshStatus()
      } else {
        toast.error(res.error ?? "Gagal memutus sesi")
      }
    } finally {
      setLoggingOut(false)
    }
  }

  const isScanning = status.status === "waiting_scan" || status.status === "connecting"
  const steps = pairing ? PAIRING_STEPS : STEPS

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Kolom kiri: metode koneksi / status */}
      <Card className="flex flex-col">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Hubungkan WhatsApp</CardTitle>
            <ServiceBadge serviceConnected={serviceConnected} />
          </div>
          <CardDescription>
            {serviceConnected
              ? "Pilih metode koneksi: pindai QR, atau masukkan kode pairing dari nomor HP."
              : "Layanan WhatsApp belum berjalan — hubungkan kembali layanan (wa-service) lalu muat ulang halaman."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-5 py-8">
          {status.status === "connected" ? (
            <ConnectedPanel
              ownerName={status.owner?.name}
              ownerNumber={status.owner?.number}
              ownerJid={status.owner?.jid}
              connectedAt={status.connectedAt}
              uptime={uptime}
              loggingOut={loggingOut}
              onLogout={handleLogout}
            />
          ) : (
            <Tabs defaultValue="qr" className="w-full">
              <TabsList className="mx-auto grid w-full max-w-xs grid-cols-2">
                <TabsTrigger value="qr" className="gap-1.5">
                  <QrCode className="size-4" aria-hidden="true" />
                  Scan QR
                </TabsTrigger>
                <TabsTrigger value="pairing" className="gap-1.5">
                  <KeyRound className="size-4" aria-hidden="true" />
                  Kode Pairing
                </TabsTrigger>
              </TabsList>
              <TabsContent value="qr" className="mt-5 flex justify-center">
                <QrPanel
                  qr={qr}
                  isScanning={isScanning}
                  statusText={
                    status.status === "waiting_scan"
                      ? "Arahkan kamera HP ke QR di atas untuk login."
                      : "Menghubungkan ke server WhatsApp…"
                  }
                  requesting={requesting}
                  serviceConnected={serviceConnected}
                  onRequestQr={handleRequestQr}
                />
              </TabsContent>
              <TabsContent value="pairing" className="mt-5 flex justify-center">
                <PairingPanel
                  pairing={pairing}
                  requesting={requestingPairing}
                  serviceConnected={serviceConnected}
                  onRequestPairing={handleRequestPairing}
                  onResetPairing={clearPairing}
                />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Kolom kanan: panduan + status */}
      <div className="space-y-6">
        {status.status !== "connected" && (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="size-4 text-primary" aria-hidden="true" />
                {pairing ? "Cara Memakai Kode Pairing" : "Cara Scan QR"}
              </CardTitle>
              <CardDescription>
                {pairing ? "Empat langkah tanpa kamera — cukup ketik kode di HP." : "Empat langkah singkat dari HP Anda."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {steps.map((step, i) => (
                  <motion.li
                    key={`${pairing ? "p" : "q"}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <p className="pt-1 text-sm leading-relaxed">{step}</p>
                  </motion.li>
                ))}
              </ol>
              <Separator className="my-4" />
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                <p className="font-medium">Tips:</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs leading-relaxed">
                  {pairing ? (
                    <>
                      <li>Kode pairing berlaku ± 2 menit dan hanya sekali pemakaian.</li>
                      <li>Pastikan nomor yang dimasukkan aktif di HP Anda.</li>
                      <li>Metode ini cocok bila kamera HP sulit memindai QR.</li>
                    </>
                  ) : (
                    <>
                      <li>QR kedaluwarsa otomatis sekitar 20 detik — QR baru muncul sendiri.</li>
                      <li>Tetap buka halaman ini selama proses scan berlangsung.</li>
                      <li>Pastikan HP Anda terhubung ke internet.</li>
                    </>
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Status Koneksi</CardTitle>
            <CardDescription>Indikator tahapan koneksi perangkat.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4" aria-label="Tahapan status koneksi">
              {[
                { key: "connecting", label: "Menghubungkan ke server WhatsApp" },
                { key: "waiting_scan", label: "Menunggu konfirmasi dari HP" },
                { key: "connected", label: "Terhubung & asisten aktif" },
              ].map((stage, i) => {
                const order = ["connecting", "waiting_scan", "connected"]
                const currentIdx = serviceConnected ? order.indexOf(status.status) : -1
                const active = currentIdx === i
                const done = currentIdx > i
                return (
                  <li key={stage.key} className="flex items-center gap-3">
                    <span className="relative flex size-3 shrink-0">
                      {active && (
                        <span
                          className={cn(
                            "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                            stage.key === "connected" ? "bg-emerald-500" : "bg-amber-500"
                          )}
                        />
                        )}
                      <span
                        className={cn(
                          "relative inline-flex size-3 rounded-full",
                          active
                            ? stage.key === "connected"
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                            : done
                              ? "bg-emerald-500"
                              : "bg-muted-foreground/30"
                        )}
                        aria-hidden="true"
                      />
                    </span>
                    <span
                      className={cn(
                        "text-sm",
                        active ? "font-medium text-foreground" : done ? "text-foreground/80" : "text-muted-foreground"
                      )}
                    >
                      {stage.label}
                    </span>
                    {active && (
                      <Badge variant="outline" className="ml-auto gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
                        Berlangsung
                      </Badge>
                    )}
                    {done && <BadgeCheck className="ml-auto size-4 text-emerald-600" aria-hidden="true" />}
                  </li>
                )
              })}
            </ul>
            {status.reason && status.status === "disconnected" && (
              <p className="mt-4 rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
                Alasan terakhir terputus: {status.reason}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
