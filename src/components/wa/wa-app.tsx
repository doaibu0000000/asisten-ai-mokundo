"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { Bot, Loader2, Lock, Menu, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AuthState, ContactDTO, LogDTO, MessageDTO } from "@/lib/wa-types"
import { useSocket } from "@/components/wa/socket-provider"
import { LockScreen } from "@/components/wa/lock-screen"
import { NAV_ITEMS, type ActiveView } from "@/components/wa/nav"
import { DashboardView } from "@/components/wa/views/dashboard-view"
import { KoneksiView } from "@/components/wa/views/koneksi-view"
import { BroadcastView } from "@/components/wa/views/broadcast-view"
import { LaporanView } from "@/components/wa/views/laporan-view"
import { SimulatorView } from "@/components/wa/views/simulator-view"
import { PengaturanView } from "@/components/wa/views/pengaturan-view"
import { KnowledgeView } from "@/components/wa/views/knowledge-view"
import { LogView } from "@/components/wa/views/log-view"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

function StatusPill({ onNavigate }: { onNavigate: (v: ActiveView) => void }) {
  const { serviceConnected, status } = useSocket()

  let dot = "bg-zinc-400"
  let label = "Layanan Offline"
  let pulse = false
  if (serviceConnected) {
    switch (status.status) {
      case "connected":
        dot = "bg-emerald-500"
        label = "Terhubung"
        pulse = true
        break
      case "waiting_scan":
        dot = "bg-amber-500"
        label = "Menunggu Scan"
        break
      case "connecting":
        dot = "bg-amber-500"
        label = "Menghubungkan…"
        pulse = true
        break
      default:
        dot = "bg-red-500"
        label = "Terputus"
    }
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate("koneksi")}
      aria-label={`Status koneksi WhatsApp: ${label}. Klik untuk membuka halaman koneksi.`}
      className="inline-flex h-9 items-center gap-2 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <span className="relative flex size-2">
        {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", dot)} />}
        <span className={cn("relative inline-flex size-2 rounded-full", dot)} />
      </span>
      {label}
    </button>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Ganti tema terang atau gelap"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-4 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-4 dark:block" aria-hidden="true" />
    </Button>
  )
}

const fetchAuthState = async (): Promise<AuthState> => {
  const res = await fetch("/api/auth/state", { cache: "no-store" })
  if (!res.ok) throw new Error("Gagal memuat status kunci")
  return res.json()
}

/** Layar sambut minimal saat status kunci belum diketahui (senada latar layar kunci) */
function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-emerald-950 via-green-950 to-black px-4">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-950/50">
        <Bot className="size-6 text-white" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-2 text-sm text-emerald-100/70">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Memuat dashboard…
      </div>
    </div>
  )
}

/** Tombol gembok header — mengunci sesi lalu memuat ulang halaman */
function LockButton() {
  const [locking, setLocking] = useState(false)
  const lockNow = async () => {
    if (locking) return
    setLocking(true)
    try {
      await fetch("/api/auth/lock", { method: "POST" })
    } catch {
      // tetap reload — status kunci dievaluasi ulang saat halaman dimuat
    }
    window.location.reload()
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Kunci dashboard"
      onClick={() => void lockNow()}
      disabled={locking}
      className="text-muted-foreground hover:text-foreground"
    >
      {locking ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Lock className="size-4" aria-hidden="true" />
      )}
    </Button>
  )
}

function NavMenu({
  activeView,
  onNavigate,
}: {
  activeView: ActiveView
  onNavigate: (v: ActiveView) => void
}) {
  return (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const active = activeView === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className={cn("size-4.5 shrink-0", active ? "opacity-100" : "opacity-70 group-hover:opacity-100")} />
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function SidebarLogo() {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-950/50">
        <Bot className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-sidebar-foreground">Mukundo AI</p>
        <p className="truncate text-xs text-sidebar-foreground/60">Asisten WhatsApp</p>
      </div>
    </div>
  )
}

export function WaApp() {
  // Status kunci (route terbuka) — layar kunci menggantikan SELURUH shell saat terkunci.
  // Setelah buka kunci halaman di-reload → query ini diambil ulang segar.
  const { data: auth, isLoading } = useQuery({
    queryKey: ["auth-state"],
    queryFn: fetchAuthState,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })

  if (isLoading) return <BootSplash />
  if (auth?.pinEnabled && !auth.unlocked) return <LockScreen />
  return <AppShell pinEnabled={auth?.pinEnabled ?? false} />
}

function AppShell({ pinEnabled }: { pinEnabled: boolean }) {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard")
  const [sheetOpen, setSheetOpen] = useState(false)
  const { on, serviceConnected, status } = useSocket()
  const queryClient = useQueryClient()

  const navigate = (v: ActiveView) => {
    setActiveView(v)
    setSheetOpen(false)
  }

  // Sinkronisasi realtime global (invalidate cache React Query dari event socket)
  useEffect(() => {
    const unsubMessage = on<{ message: MessageDTO; isNewContact?: boolean }>("message:new", (payload) => {
      const msg = payload?.message
      if (!msg) return
      queryClient.invalidateQueries({ queryKey: ["chats"] })
      queryClient.invalidateQueries({ queryKey: ["chat", msg.contactId] })
      queryClient.invalidateQueries({ queryKey: ["messages", msg.contactId] })
      queryClient.invalidateQueries({ queryKey: ["stats"] })
      queryClient.invalidateQueries({ queryKey: ["reports"] })
      queryClient.invalidateQueries({ queryKey: ["onboarding"] })
      if (!msg.fromMe) {
        toast.message("Pesan baru masuk", {
          description: msg.body.slice(0, 90) || "Pesan baru",
        })
      }
    })
    const unsubChat = on<{ contact: ContactDTO }>("chat:update", (payload) => {
      if (!payload?.contact) return
      queryClient.invalidateQueries({ queryKey: ["chats"] })
      queryClient.invalidateQueries({ queryKey: ["chat", payload.contact.id] })
    })
    const unsubLog = on<{ log: LogDTO }>("log:new", () => {
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    })
    const unsubBroadcast = on<{ log: LogDTO }>("broadcast:update", () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] })
    })
    return () => {
      unsubMessage()
      unsubChat()
      unsubLog()
      unsubBroadcast()
    }
  }, [on, queryClient])

  const currentMeta = NAV_ITEMS.find((n) => n.id === activeView) ?? NAV_ITEMS[0]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sidebar desktop (disembunyikan saat cetak laporan) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 md:flex print:hidden">
        <SidebarLogo />
        <div className="mt-6 flex-1">
          <NavMenu activeView={activeView} onNavigate={navigate} />
        </div>
        <div className="relative overflow-hidden rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-3">
          <div
            className="pointer-events-none absolute -right-8 -top-8 size-20 rounded-full bg-emerald-500/10"
            aria-hidden="true"
          />
          <div className="relative flex items-center gap-2 text-xs font-medium text-sidebar-foreground/80">
            <span className="relative flex size-2">
              {serviceConnected && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2 rounded-full",
                  serviceConnected ? "bg-emerald-400" : "bg-amber-400",
                )}
                aria-hidden="true"
              />
            </span>
            {serviceConnected ? "Layanan WA aktif" : "Layanan WA offline"}
          </div>
          <p className="relative mt-1 text-[11px] leading-relaxed text-sidebar-foreground/55">
            {status.status === "connected"
              ? `Terhubung sebagai ${status.owner?.name ?? status.owner?.number ?? "pemilik"}`
              : "Asisten siap melayani 24 jam setelah WhatsApp terhubung."}
          </p>
        </div>
        <p className="px-1 text-center text-[10px] text-sidebar-foreground/35">Mukundo AI v1.1</p>
      </aside>

      {/* Area utama */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
            {/* Mobile: hamburger */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden" aria-label="Buka menu navigasi">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-4 text-sidebar-foreground [&>button]:text-sidebar-foreground">
                <SheetHeader className="p-0 text-left">
                  <SheetTitle className="sr-only">Menu navigasi Mukundo AI</SheetTitle>
                  <SheetDescription className="sr-only">Navigasi dashboard asisten AI</SheetDescription>
                  <SidebarLogo />
                </SheetHeader>
                <div className="mt-6">
                  <NavMenu activeView={activeView} onNavigate={navigate} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{currentMeta.label}</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{currentMeta.description}</p>
            </div>

            <StatusPill onNavigate={navigate} />
            {pinEnabled && <LockButton />}
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 print:max-w-none print:px-2 print:py-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {activeView === "dashboard" && <DashboardView onNavigate={navigate} />}
              {activeView === "koneksi" && <KoneksiView />}
              {activeView === "broadcast" && <BroadcastView />}
              {activeView === "laporan" && <LaporanView onNavigate={navigate} />}
              {activeView === "simulator" && <SimulatorView />}
              {activeView === "pengaturan" && <PengaturanView />}
              {activeView === "knowledge" && <KnowledgeView />}
              {activeView === "log" && <LogView />}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="mt-auto border-t print:hidden">
          <div className="mx-auto w-full max-w-6xl px-4 py-3 text-xs text-muted-foreground md:px-6">
            <p>© 2025 Mukundo Teknologi — Asisten AI WhatsApp</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
