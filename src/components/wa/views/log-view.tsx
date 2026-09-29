"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  AlertTriangle,
  BookOpen,
  FlaskConical,
  Loader2,
  MessageSquare,
  Plug,
  ScrollText,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { LOG_LEVELS, LOG_TYPES, type LogDTO } from "@/lib/wa-types"
import { formatFull } from "@/components/wa/format"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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

const TYPE_ICON: Record<string, typeof Plug> = {
  connection: Plug,
  ai_reply: Sparkles,
  message: MessageSquare,
  error: AlertTriangle,
  settings: Settings2,
  knowledge: BookOpen,
  simulate: FlaskConical,
}

const TYPE_LABEL: Record<string, string> = {
  connection: "Koneksi",
  ai_reply: "Balasan AI",
  message: "Pesan",
  error: "Error",
  settings: "Pengaturan",
  knowledge: "Pengetahuan",
  simulate: "Simulasi",
}

const LEVEL_DOT: Record<string, string> = {
  info: "bg-zinc-400",
  success: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
}

const LEVEL_TEXT: Record<string, string> = {
  info: "text-zinc-500 dark:text-zinc-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
}

function prettyMeta(meta: string | null | undefined): string | null {
  if (!meta) return null
  try {
    return JSON.stringify(JSON.parse(meta), null, 2)
  } catch {
    return meta
  }
}

export function LogView() {
  const [level, setLevel] = useState<string>("semua")
  const [type, setType] = useState<string>("semua")
  const queryClient = useQueryClient()

  const { data: logs, isLoading } = useQuery({
    queryKey: ["logs", level, type],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" })
      if (level !== "semua") params.set("level", level)
      if (type !== "semua") params.set("type", type)
      const res = await fetch(`/api/logs?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Gagal memuat log")
      return res.json() as Promise<LogDTO[]>
    },
    refetchInterval: 15000,
  })

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/logs", { method: "DELETE" })
      if (!res.ok) throw new Error("Gagal membersihkan log")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logs"] })
      toast.success("Log dibersihkan")
    },
    onError: () => toast.error("Gagal membersihkan log"),
  })

  return (
    <div className="space-y-5">
      {/* Filter */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter level log">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Level:</span>
          {["semua", ...LOG_LEVELS].map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-medium capitalize transition-colors",
                level === l
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {l === "semua" ? "Semua" : l === "warn" ? "Warning" : l}
            </button>
          ))}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={clearMutation.isPending}>
              {clearMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Bersihkan Log
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bersihkan semua log?</AlertDialogTitle>
              <AlertDialogDescription>
                Seluruh riwayat aktivitas akan dihapus permanen. Koneksi WhatsApp dan data percakapan tidak terpengaruh.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  clearMutation.mutate()
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Bersihkan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter tipe log">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Tipe:</span>
        {["semua", ...LOG_TYPES].map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
              type === t
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {t === "semua" ? "Semua" : TYPE_LABEL[t] ?? t}
          </button>
        ))}
      </div>

      {/* Daftar log */}
      {isLoading ? (
        <Card>
          <CardContent className="space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : !logs || logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
              <ScrollText className="size-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium">Belum ada aktivitas</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Log kejadian sistem akan muncul di sini — koneksi, balasan AI, pengaturan, dan lainnya.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[65dvh] overflow-y-auto scrollbar-thin p-4 sm:p-5" role="log" aria-label="Riwayat aktivitas">
              <ol className="relative space-y-5 border-l border-border/70 pl-5">
                {logs.map((log, i) => {
                  const Icon = TYPE_ICON[log.type] ?? ScrollText
                  const meta = prettyMeta(log.meta)
                  return (
                    <motion.li
                      key={log.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.25) }}
                      className="relative"
                    >
                      <span
                        className={cn(
                          "absolute -left-[27px] top-1.5 size-2.5 rounded-full ring-4 ring-card",
                          LEVEL_DOT[log.level] ?? LEVEL_DOT.info
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Icon className="size-3.5" aria-hidden="true" />
                        </span>
                        <p className="min-w-0 flex-1 text-sm leading-snug">{log.message}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 pl-9">
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {TYPE_LABEL[log.type] ?? log.type}
                        </Badge>
                        <span className={cn("text-[11px] font-medium capitalize", LEVEL_TEXT[log.level] ?? LEVEL_TEXT.info)}>
                          {log.level}
                        </span>
                        <span className="text-[11px] text-muted-foreground/70">{formatFull(log.createdAt)}</span>
                      </div>
                      {meta && (
                        <pre className="ml-9 mt-1.5 max-w-full overflow-x-auto rounded-lg border bg-muted/50 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                          {meta}
                        </pre>
                      )}
                    </motion.li>
                  )
                })}
              </ol>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
