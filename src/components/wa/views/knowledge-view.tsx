"use client"

import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { BookOpen, ChevronDown, ChevronUp, DatabaseBackup, Download, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { CATEGORY_BADGE, KNOWLEDGE_CATEGORIES, type KnowledgeDTO } from "@/lib/wa-types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

interface KnowledgeForm {
  category: string
  title: string
  content: string
  keywords: string
  active: boolean
}

/** Bentuk file cadangan (hasil unduhan /api/backup) */
interface BackupFile {
  version?: number
  app?: string
  exportedAt?: string
  aiSettings?: Record<string, unknown>
  knowledgeItems?: {
    category: string
    title: string
    content: string
    keywords?: string | null
    active?: boolean
    sortOrder?: number
  }[]
  businessHours?: unknown[]
}

const EMPTY_FORM: KnowledgeForm = {
  category: "layanan",
  title: "",
  content: "",
  keywords: "",
  active: true,
}

function toForm(item: KnowledgeDTO): KnowledgeForm {
  return {
    category: item.category,
    title: item.title,
    content: item.content,
    keywords: item.keywords ?? "",
    active: item.active,
  }
}

interface DialogState {
  open: boolean
  editing: KnowledgeDTO | null
  form: KnowledgeForm
}

const CLOSED: DialogState = { open: false, editing: null, form: EMPTY_FORM }

function KnowledgeDialog({
  state,
  setState,
}: {
  state: DialogState
  setState: (s: DialogState) => void
}) {
  const queryClient = useQueryClient()
  const editing = state.editing
  const form = state.form

  const setForm = (patch: Partial<KnowledgeForm>) =>
    setState({ ...state, form: { ...form, ...patch } })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim() || !form.content.trim()) {
        throw new Error("Judul dan isi wajib diisi")
      }
      const payload = {
        category: form.category,
        title: form.title.trim(),
        content: form.content.trim(),
        keywords: form.keywords.trim(),
        active: form.active,
      }
      const res = await fetch(editing ? `/api/knowledge/${editing.id}` : "/api/knowledge", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      // Parse SEKALI saja — body stream Response hanya bisa dibaca satu kali
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan pengetahuan")
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] })
      queryClient.invalidateQueries({ queryKey: ["onboarding"] })
      toast.success(editing ? "Pengetahuan diperbarui" : "Pengetahuan ditambahkan")
      setState(CLOSED)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={state.open} onOpenChange={(v) => setState({ ...state, open: v })}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Pengetahuan" : "Tambah Pengetahuan"}</DialogTitle>
          <DialogDescription>
            Tambahkan layanan, harga, atau FAQ yang akan dipakai AI saat menjawab klien.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="knowledge-category">Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ category: v })}>
                <SelectTrigger id="knowledge-category" aria-label="Pilih kategori">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {KNOWLEDGE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge-title">Judul</Label>
              <Input
                id="knowledge-title"
                value={form.title}
                onChange={(e) => setForm({ title: e.target.value })}
                placeholder="contoh: Cuci AC 0.5 – 1 PK"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-content">Isi</Label>
            <Textarea
              id="knowledge-content"
              rows={5}
              value={form.content}
              onChange={(e) => setForm({ content: e.target.value })}
              placeholder="contoh: Rp 65.000/unit, sudah termasuk cek freon & pembersihan filter. Garansi pengerjaan 1 bulan."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-keywords">Kata Kunci (opsional)</Label>
            <Input
              id="knowledge-keywords"
              value={form.keywords}
              onChange={(e) => setForm({ keywords: e.target.value })}
              placeholder="cuci ac, service ac, bersihin ac"
            />
            <p className="text-[11px] text-muted-foreground">Pisahkan dengan koma.</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-4">
            <div>
              <Label htmlFor="knowledge-active" className="text-sm font-medium">
                Aktif
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">Pengetahuan nonaktif tidak dipakai AI.</p>
            </div>
            <Switch
              id="knowledge-active"
              checked={form.active}
              onCheckedChange={(v) => setForm({ active: v })}
              aria-label="Aktifkan pengetahuan ini"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setState(CLOSED)}>
            Batal
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {editing ? "Simpan Perubahan" : "Tambah"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KnowledgeCard({ item, index, onEdit }: { item: KnowledgeDTO; index: number; onEdit: (item: KnowledgeDTO) => void }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const toggleActive = useMutation({
    mutationFn: async (active: boolean) => {
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      })
      if (!res.ok) throw new Error("Gagal memperbarui status")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] })
      queryClient.invalidateQueries({ queryKey: ["onboarding"] })
      toast.success(item.active ? "Pengetahuan dinonaktifkan" : "Pengetahuan diaktifkan")
    },
    onError: () => toast.error("Gagal memperbarui status"),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/knowledge/${item.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Gagal menghapus pengetahuan")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] })
      queryClient.invalidateQueries({ queryKey: ["onboarding"] })
      toast.success("Pengetahuan dihapus")
    },
    onError: () => toast.error("Gagal menghapus pengetahuan"),
  })

  const keywords = (item.keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
    >
      <Card className={cn("h-full transition-shadow hover:shadow-md", !item.active && "opacity-60")}>
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                CATEGORY_BADGE[item.category] ?? CATEGORY_BADGE.lainnya
              )}
            >
              {item.category}
            </span>
            <div className="flex items-center gap-1">
              <Switch
                checked={item.active}
                onCheckedChange={(v) => toggleActive.mutate(v)}
                disabled={toggleActive.isPending}
                aria-label={`Aktifkan pengetahuan: ${item.title}`}
              />
            </div>
          </div>
          <div>
            <h3 className="font-semibold leading-snug">{item.title}</h3>
            <p className={cn("mt-1.5 text-sm leading-relaxed text-muted-foreground", !expanded && "line-clamp-3")}>
              {item.content}
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  Sedikitkan <ChevronUp className="size-3" aria-hidden="true" />
                </>
              ) : (
                <>
                  Selengkapnya <ChevronDown className="size-3" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((k) => (
                <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {k}
                </span>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center justify-end gap-1 pt-1">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Edit pengetahuan: ${item.title}`}
              onClick={() => onEdit(item)}
            >
              <Pencil className="size-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Hapus pengetahuan: ${item.title}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus pengetahuan ini?</AlertDialogTitle>
                  <AlertDialogDescription>
                    &quot;{item.title}&quot; akan dihapus permanen dan tidak lagi dipakai AI saat menjawab klien.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault()
                      remove.mutate()
                    }}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export function KnowledgeView() {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string>("semua")
  const [dialog, setDialog] = useState<DialogState>(CLOSED)
  const [restorePreview, setRestorePreview] = useState<BackupFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: items, isLoading } = useQuery({
    queryKey: ["knowledge"],
    queryFn: async () => {
      const res = await fetch("/api/knowledge", { cache: "no-store" })
      if (!res.ok) throw new Error("Gagal memuat basis pengetahuan")
      return res.json() as Promise<KnowledgeDTO[]>
    },
  })

  const downloadBackup = async () => {
    try {
      const res = await fetch("/api/backup", { cache: "no-store" })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `cadangan-mukundo-ai-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("Cadangan diunduh", {
        description: "Simpan file JSON ini di tempat aman (HP/drive) — bisa dipulihkan kapan saja dari tombol Pulihkan.",
      })
    } catch {
      toast.error("Gagal mengunduh cadangan", { description: "Coba lagi beberapa saat lagi." })
    }
  }

  const onPickRestoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // reset agar file yang sama bisa dipilih ulang
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile
      if (!Array.isArray(parsed.knowledgeItems)) throw new Error()
      setRestorePreview(parsed)
    } catch {
      toast.error("File tidak valid", {
        description: "Pastikan file yang dipilih adalah hasil unduhan cadangan (JSON) dari dashboard ini.",
      })
    }
  }

  const restoreMutation = useMutation({
    mutationFn: async (payload: BackupFile) => {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Gagal memulihkan cadangan")
      return data as { summary: { created: number; updated: number; settings: boolean; businessHours: boolean } }
    },
    onSuccess: async ({ summary }) => {
      await queryClient.invalidateQueries({ queryKey: ["knowledge"] })
      await queryClient.invalidateQueries({ queryKey: ["settings"] })
      await queryClient.invalidateQueries({ queryKey: ["business-hours"] })
      setRestorePreview(null)
      toast.success("Cadangan berhasil dipulihkan", {
        description: `${summary.created} pengetahuan baru, ${summary.updated} diperbarui${summary.settings ? " · pengaturan AI" : ""}${summary.businessHours ? " · jam operasional" : ""}`,
      })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  /** Ringkasan isi cadangan untuk dialog konfirmasi */
  const restoreCounts = useMemo(() => {
    if (!restorePreview) return null
    const titles = new Set((items ?? []).map((i) => i.title))
    const all = restorePreview.knowledgeItems ?? []
    const created = all.filter((k) => !titles.has(k.title)).length
    return {
      created,
      updated: all.length - created,
      total: all.length,
      settings: !!restorePreview.aiSettings && Object.keys(restorePreview.aiSettings).length > 0,
      hours: Array.isArray(restorePreview.businessHours) && restorePreview.businessHours.length === 7,
      exportedAt: restorePreview.exportedAt,
    }
  }, [restorePreview, items])

  const filtered = useMemo(() => {
    if (!items) return []
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchCategory = category === "semua" || item.category === category
      const matchSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        (item.keywords ?? "").toLowerCase().includes(q)
      return matchCategory && matchSearch
    })
  }, [items, search, category])

  const openNew = () => setDialog({ open: true, editing: null, form: EMPTY_FORM })
  const openEdit = (item: KnowledgeDTO) => setDialog({ open: true, editing: item, form: toForm(item) })

  return (
    <div className="space-y-5">
      {/* Header + filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari layanan, harga, atau FAQ…"
            className="pl-9"
            aria-label="Cari pengetahuan"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filter kategori">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua Kategori</SelectItem>
              {KNOWLEDGE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openNew} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            Tambah
          </Button>
        </div>
      </div>

      {/* Daftar pengetahuan */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
              <BookOpen className="size-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium">{items && items.length > 0 ? "Tidak ada hasil" : "Belum ada pengetahuan"}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {items && items.length > 0
                ? "Coba ubah kata kunci atau kategori filter."
                : "Tambahkan layanan, harga, dan FAQ agar AI bisa menjawab klien dengan akurat."}
            </p>
            {(!items || items.length === 0) && (
              <Button onClick={openNew}>
                <Plus className="size-4" aria-hidden="true" />
                Tambah Pengetahuan
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item, i) => (
            <KnowledgeCard key={item.id} item={item} index={i} onEdit={openEdit} />
          ))}
        </div>
      )}

      {/* Cadangan & pulihkan pengetahuan */}
      <Card className="border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <DatabaseBackup className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <p className="text-sm font-semibold">Cadangan Pengetahuan</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Unduh seluruh basis pengetahuan, pengaturan AI, dan jam operasional sebagai satu file JSON. Simpan di
              tempat aman — bila suatu saat pindah server atau mengunduh ulang proyek ini, cukup tekan
              &quot;Pulihkan&quot; dan semua pengetahuan AI kembali seperti sekarang. PIN dashboard dan data chat klien
              tidak ikut disertai (tetap privat).
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={downloadBackup} className="gap-2">
              <Download className="size-4" aria-hidden="true" />
              Unduh
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
              disabled={restoreMutation.isPending}
            >
              <Upload className="size-4" aria-hidden="true" />
              Pulihkan
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={onPickRestoreFile}
              aria-label="Pilih file cadangan JSON"
            />
          </div>
        </CardContent>
      </Card>

      {/* Dialog konfirmasi pemulihan */}
      <AlertDialog open={!!restorePreview} onOpenChange={(o) => !o && !restoreMutation.isPending && setRestorePreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pulihkan cadangan ini?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span className="space-y-2 text-left">
                {restoreCounts && (
                  <>
                    <span className="block">
                      Cadangan berisi <strong>{restoreCounts.total} item pengetahuan</strong> ({restoreCounts.created}{" "}
                      baru, {restoreCounts.updated} akan diperbarui)
                      {restoreCounts.settings ? ", pengaturan AI" : ""}
                      {restoreCounts.hours ? ", dan jam operasional" : ""}.
                    </span>
                    {restoreCounts.exportedAt && (
                      <span className="block">
                        Dibuat:{" "}
                        {new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Jakarta",
                        }).format(new Date(restoreCounts.exportedAt))}{" "}
                        WIB
                      </span>
                    )}
                    <span className="block text-muted-foreground">
                      Pengetahuan lama yang tidak ada di file cadangan tidak akan dihapus — hanya digabung dan
                      diperbarui.
                    </span>
                  </>
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (restorePreview) restoreMutation.mutate(restorePreview)
              }}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
              {restoreMutation.isPending ? "Memulihkan…" : "Ya, Pulihkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KnowledgeDialog state={dialog} setState={setDialog} />
    </div>
  )
}
