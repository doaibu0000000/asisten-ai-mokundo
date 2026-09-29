"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { FlaskConical, RotateCcw, Send, Sparkles, User } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import type { SettingsDTO } from "@/lib/wa-types"
import { ChatBubble, TypingBubble } from "@/components/wa/chat-bubble"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

interface SimMessage {
  role: "user" | "assistant"
  content: string
}

const PRESETS = [
  "Halo, cuci AC berapa ya?",
  "AC saya tidak dingin parah",
  "Mau pasang CCTV toko",
  "Listrik sering mati sendiri",
  "Bisa bongkar pindah AC?",
  "Kamu bot ya?",
]

export function SimulatorView() {
  const [messages, setMessages] = useState<SimMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings", { cache: "no-store" })
      if (!res.ok) throw new Error("Gagal memuat pengaturan")
      return res.json() as Promise<SettingsDTO>
    },
  })
  const assistantName = settings?.assistantName?.trim() || "Rani"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, loading])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    const history: SimMessage[] = [...messages, { role: "user", content: trimmed }]
    setMessages(history)
    setInput("")
    setLoading(true)
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      })
      const data = (await res.json()) as { reply?: string; error?: string }
      if (!res.ok || !data.reply) {
        throw new Error(data.error ?? "Gagal menghasilkan balasan AI")
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply! }])
    } catch (err) {
      toast.error("Gagal menghasilkan balasan AI", {
        description: err instanceof Error ? err.message : "Coba lagi sebentar.",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Panel samping */}
      <Card className="h-fit">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-4 text-primary" aria-hidden="true" />
            Uji Balasan AI
          </CardTitle>
          <CardDescription>
            Uji seberapa cerdas asisten menjawab sebelum dipakai sungguhan — berperan sebagai klien yang bertanya.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Skenario cepat:</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setInput(p)}
                  className="min-h-9 rounded-full border bg-background px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setMessages([])
              setInput("")
              toast.success("Simulasi direset")
            }}
            disabled={messages.length === 0 && !input}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset Simulasi
          </Button>
          <p className="rounded-lg border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Simulasi memakai pengaturan &amp; basis pengetahuan yang sama dengan asisten sungguhan — termasuk persona dan
            instruksi tambahan Anda.
          </p>
        </CardContent>
      </Card>

      {/* Area chat simulasi */}
      <Card className="flex h-[calc(100dvh-13rem)] min-h-[480px] flex-col overflow-hidden p-0 gap-0 py-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{assistantName}</p>
            <p className="text-xs text-muted-foreground">Asisten AI Mukundo</p>
          </div>
          <Badge variant="secondary" className="gap-1">
            <FlaskConical className="size-3" aria-hidden="true" />
            Mode Simulasi
          </Badge>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin bg-muted/20 p-4" role="log" aria-label="Percakapan simulasi">
          {messages.length === 0 && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-7" aria-hidden="true" />
              </div>
              <p className="font-medium">Mulai percakapan simulasi</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Ketik pesan seolah Anda klien yang bertanya soal servis AC atau kelistrikan — lihat bagaimana{" "}
                {assistantName} menjawab.
              </p>
            </div>
          ) : (
            messages.map((m, i) => (
              <ChatBubble
                key={i}
                fromMe={m.role === "user"}
                body={m.content}
                tail
                label={
                  m.role === "assistant" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                      <Sparkles className="size-2.5" aria-hidden="true" />
                      {assistantName} • Asisten AI
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80">
                      <User className="size-2.5" aria-hidden="true" />
                      Anda
                    </span>
                  )
                }
              />
            ))
          )}
          {loading && <TypingBubble text={`${assistantName} sedang mengetik…`} />}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tulis pesan sebagai klien…"
            disabled={loading}
            aria-label="Pesan simulasi"
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Kirim pesan simulasi">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </Card>
    </div>
  )
}
