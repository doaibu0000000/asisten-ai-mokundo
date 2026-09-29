"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { FileSearch, FileText, Image as ImageIcon, Megaphone, Mic, Sparkles, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const MSG_TYPE_LABEL: Record<string, string> = {
  image: "🖼️ Gambar",
  audio: "🎙️ Pesan suara",
  video: "🎬 Video",
  sticker: "Stiker",
  document: "📄 Dokumen",
  location: "📍 Lokasi",
  contact: "👤 Kontak",
  unknown: "Pesan tidak didukung",
}

// ---------------------------------------------------------------------------
// Parser isi pesan dokumen — format yang ditulis wa-service:
//   "📎 nama-file.pdf · 2 hal.\n[caption]\n(📄 AI membaca dokumen: <deskripsi>)"
// Baris 📎 & blok AI selalu ada bila dokumen diproses; parser toleran utk baris lama.
// ---------------------------------------------------------------------------
interface ParsedDocumentBody {
  fileName: string
  pages: number | null
  ext: string
  caption: string
  aiDesc: string | null
}

function parseDocumentBody(body: string): ParsedDocumentBody {
  const lines = body.split("\n")
  let fileName = ""
  let pages: number | null = null
  let rest = body
  const head = /^📎 (.+?)(?:\s·\s(\d+) hal\.)?$/.exec((lines[0] ?? "").trim())
  if (head) {
    fileName = (head[1] ?? "").trim()
    pages = head[2] ? Number(head[2]) : null
    rest = lines.slice(1).join("\n")
  }
  let aiDesc: string | null = null
  const dm = /\(📄 AI membaca dokumen:\s*([\s\S]*?)\)\s*$/.exec(rest)
  if (dm) {
    aiDesc = (dm[1] ?? "").trim()
    rest = rest.slice(0, dm.index)
  }
  const extMatch = /\.([a-z0-9]{1,5})$/i.exec(fileName)
  return {
    fileName,
    pages,
    ext: extMatch ? (extMatch[1] ?? "").toUpperCase() : "FILE",
    caption: rest.trim(),
    aiDesc,
  }
}

/** Isi bubble pesan dokumen — kartu file + caption + blok "Dibaca AI" */
function DocumentBubbleBody({ body, fromMe }: { body: string; fromMe: boolean }) {
  const { fileName, pages, ext, caption, aiDesc } = parseDocumentBody(body)
  return (
    <div className="flex min-w-52 flex-col gap-2 sm:min-w-64">
      <div
        className={cn("flex items-center gap-2.5 rounded-xl p-2.5", fromMe ? "bg-white/15" : "bg-black/5 dark:bg-white/10")}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            fromMe
              ? "bg-white/20 text-primary-foreground"
              : "bg-orange-500/15 text-orange-600 dark:bg-orange-400/20 dark:text-orange-400",
          )}
        >
          <FileText className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug">{fileName || "Dokumen"}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-none opacity-75">
            <span
              className={cn(
                "rounded px-1 py-px text-[9px] font-bold tracking-wider",
                fromMe
                  ? "bg-white/25 text-primary-foreground"
                  : "bg-orange-500/15 text-orange-600 dark:bg-orange-400/25 dark:text-orange-400",
              )}
            >
              {ext}
            </span>
            {pages ? <span className="tabular-nums">{pages} halaman</span> : <span>Dokumen</span>}
          </p>
        </div>
      </div>
      {caption ? <p className="text-sm">{caption}</p> : null}
      {aiDesc ? (
        <div className={cn("rounded-lg p-2", fromMe ? "bg-white/15" : "bg-black/5 dark:bg-white/10")}>
          <div className="mb-1 flex items-center gap-1.5">
            <FileSearch className="size-3 shrink-0 opacity-70" aria-hidden="true" />
            <span className="whitespace-nowrap text-[10px] font-medium opacity-70">Dibaca AI</span>
          </div>
          <p className="text-[13px] leading-relaxed">{aiDesc}</p>
        </div>
      ) : null}
    </div>
  )
}

// Tinggi bar dekoratif "waveform" voice note (px) — variasi acak yang menyerupai gelombang suara
const WAVE_HEIGHTS = [4, 8, 12, 7, 14, 10, 16, 9, 13, 6, 11, 15, 8, 5, 10, 12]

/** Baris label kecil di atas transkrip/deskripsi — ikon di chip warna accent per jenis media */
function MediaHeaderRow({ icon, label, chipClass }: { icon: ReactNode; label: string; chipClass?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn("flex size-5 items-center justify-center rounded-md", chipClass ?? "bg-current/10 opacity-90")}
      >
        {icon}
      </span>
      <span className="whitespace-nowrap text-[10px] font-medium opacity-75">{label}</span>
    </div>
  )
}

/** Waveform dekoratif voice note — bar memanjang saat muncul (aria-hidden) */
function VoiceWaveform() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {WAVE_HEIGHTS.map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-current"
          style={{ height: `${h}px`, transformOrigin: "bottom" }}
          initial={{ scaleY: 0.3, opacity: 0.35 }}
          animate={{ scaleY: 1, opacity: 0.6 }}
          transition={{ duration: 0.35, delay: 0.05 + i * 0.02, ease: "easeOut" }}
        />
      ))}
    </span>
  )
}

/** Label sumber pesan WhatsApp (untuk inbox) */
export function SourceLabel({ source }: { source: string }) {
  if (source === "ai") {
    return (
      <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary">
        <Sparkles className="size-2.5" aria-hidden="true" />
        AI
      </Badge>
    )
  }
  if (source === "broadcast") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-700 dark:text-amber-300"
      >
        <Megaphone className="size-2.5" aria-hidden="true" />
        Broadcast
      </Badge>
    )
  }
  if (source === "manual") return <span className="text-[10px] font-medium text-muted-foreground/80">Manual</span>
  if (source === "owner") return <span className="text-[10px] font-medium text-muted-foreground/80">Anda</span>
  return null
}

interface ChatBubbleProps {
  fromMe: boolean
  body: string
  msgType?: string
  label?: ReactNode
  time?: string
  tail?: boolean
  delay?: number
}

/** Bubble chat gaya WhatsApp — klien di kiri (bg-muted), dari kita di kanan (bg-primary) */
export function ChatBubble({ fromMe, body, msgType = "text", label, time, tail = true, delay = 0 }: ChatBubbleProps) {
  const isText = msgType === "text" || msgType === "conversation" || msgType === "extendedText"
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay, ease: "easeOut" }}
      className={cn("flex w-full", fromMe ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]", fromMe ? "items-end" : "items-start")}>
        <div
          className={cn(
            "relative whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-xs",
            tail && (fromMe ? "chat-tail-right" : "chat-tail-left"),
            fromMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          )}
        >
          {isText ? (
            body || <span className="italic opacity-70">(pesan kosong)</span>
          ) : msgType === "document" ? (
            <DocumentBubbleBody body={body} fromMe={fromMe} />
          ) : msgType === "audio" && body ? (
            <div className="flex flex-col gap-1.5">
              <MediaHeaderRow
                icon={<Mic className="size-3" aria-hidden="true" />}
                label="Transkrip otomatis"
                chipClass="bg-teal-500/15 text-teal-600 dark:text-teal-400"
              />
              <VoiceWaveform />
              <p className="text-sm">{body}</p>
            </div>
          ) : msgType === "video" && body ? (
            <div className="flex flex-col gap-1.5">
              <MediaHeaderRow
                icon={<Video className="size-3" aria-hidden="true" />}
                label="Transkrip video otomatis"
                chipClass="bg-rose-500/15 text-rose-600 dark:text-rose-400"
              />
              <VoiceWaveform />
              <p className="text-sm">{body}</p>
            </div>
          ) : msgType === "image" && body ? (
            <div className="flex flex-col gap-1.5">
              <MediaHeaderRow
                icon={<ImageIcon className="size-3" aria-hidden="true" />}
                label="Foto dianalisis AI"
                chipClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              />
              <p className="text-sm">{body}</p>
            </div>
          ) : (
            <span className="italic opacity-80">{MSG_TYPE_LABEL[msgType] ?? "Pesan tidak didukung"}</span>
          )}
        </div>
        {(label || time) && (
          <div className={cn("flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground", fromMe ? "flex-row-reverse" : "")}>
            {label}
            {time ? <span>{time}</span> : null}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/** Indikator "sedang mengetik" dengan titik animasi */
export function TypingBubble({ text = "sedang mengetik…" }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 pl-1">
      <div className="flex items-center gap-1 rounded-2xl bg-muted px-3.5 py-2.5 shadow-xs" aria-label={text}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: "1s" }}
          />
        ))}
      </div>
      <span className="text-[11px] italic text-muted-foreground">{text}</span>
    </div>
  )
}
