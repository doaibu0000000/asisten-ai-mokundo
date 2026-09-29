"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import { io, type Socket } from "socket.io-client"
import type { BroadcastDTO, MessageDTO, StatusObj, WaStatus } from "@/lib/wa-types"

interface AckResult {
  ok: boolean
  message?: MessageDTO
  error?: string
}

interface SocketContextValue {
  socket: Socket | null
  serviceConnected: boolean
  status: StatusObj
  qr: string | null
  pairing: { code: string; number: string } | null
  typingJids: Record<string, boolean>
  on: <T>(event: string, handler: (data: T) => void) => () => void
  refreshStatus: () => Promise<void>
  requestQr: () => Promise<AckResult>
  requestPairing: (number: string) => Promise<AckResult & { code?: string }>
  clearPairing: () => void
  logout: () => Promise<AckResult>
  sendMessage: (jid: string, text: string) => Promise<AckResult>
  /** Batalkan jeda AI (ambil alih manual) untuk sebuah kontak — ack {ok} | {ok:false,error} */
  resumeAi: (jid: string) => Promise<AckResult>
  /** Jeda AI manual utk sebuah kontak (ambil alih tanpa membalas dulu) — ack {ok,minutes?} | {ok:false,error} */
  pauseAi: (jid: string, minutes?: number) => Promise<AckResult & { minutes?: number }>
}

const SocketContext = createContext<SocketContextValue | null>(null)

const DEFAULT_STATUS: StatusObj = { status: "disconnected" }

// Singleton koneksi socket.io — via gateway Caddy (tanpa port di host)
let globalSocket: Socket | null = null

function getSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io("/?XTransformPort=3003", {
      // Polling dulu — websocket upgrade belum didukung runtime Bun di sisi service
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 10000,
    })
  }
  return globalSocket
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // Aman untuk SSR: koneksi hanya dibuat di browser
  const [socket] = useState<Socket | null>(() => {
    if (typeof window === "undefined") return null
    return getSocket()
  })
  const [serviceConnected, setServiceConnected] = useState(false)
  const [status, setStatus] = useState<StatusObj>(DEFAULT_STATUS)
  const [qr, setQr] = useState<string | null>(null)
  const [pairing, setPairing] = useState<{ code: string; number: string } | null>(null)
  const [typingJids, setTypingJids] = useState<Record<string, boolean>>({})

  // Listener event socket (setState hanya di callback event — pola subscribe)
  useEffect(() => {
    if (!socket) return

    const applyStatus = (st: Partial<StatusObj>) => {
      if (!st || typeof st.status !== "string") return
      const next: StatusObj = {
        status: st.status as WaStatus,
        owner: st.owner,
        connectedAt: st.connectedAt,
        reason: st.reason,
      }
      setStatus(next)
      if (next.status === "connected") {
        setQr(null)
        setPairing(null)
      } else if (next.status !== "waiting_scan" && next.status !== "connecting") {
        setQr(null)
      }
    }

    const handleConnect = () => {
      setServiceConnected(true)
      socket.timeout(8000).emit("get-status", (err: unknown, res: StatusObj) => {
        if (!err && res) applyStatus(res)
      })
      // QR aktif saat ini bisa terlewat saat listener belum terpasang — ambil ulang
      socket.timeout(8000).emit("get-qr", (err: unknown, res: { qrDataUrl?: string } | null) => {
        if (!err && res?.qrDataUrl) setQr(res.qrDataUrl)
      })
      socket.timeout(8000).emit("get-pairing", (err: unknown, res: { code: string; number: string } | null) => {
        if (!err && res?.code) setPairing(res)
      })
    }

    const handleDisconnect = () => {
      setServiceConnected(false)
    }

    const handleStatus = (st: StatusObj) => applyStatus(st)

    const handleQr = (payload: { qrDataUrl: string }) => {
      if (payload?.qrDataUrl) setQr(payload.qrDataUrl)
    }

    const handlePairing = (payload: { code: string; number: string }) => {
      if (payload?.code) setPairing({ code: payload.code, number: payload.number })
    }

    const handleTyping = (payload: { jid: string; typing: boolean }) => {
      if (!payload?.jid) return
      setTypingJids((prev) => {
        const next = { ...prev }
        if (payload.typing) next[payload.jid] = true
        else delete next[payload.jid]
        return next
      })
    }

    // Pesan masuk diperkaya beberapa detik kemudian (transkrip ASR / deskripsi foto VLM):
    // perbarui cache pesan di tempat + invalidasi daftar chat (teks preview berubah)
    const handleMessageUpdate = (payload: { message: MessageDTO }) => {
      const msg = payload?.message
      if (!msg?.id || !msg.contactId) return
      queryClient.setQueriesData<MessageDTO[]>(
        { queryKey: ["messages", msg.contactId] },
        (old) => (old ? old.map((m) => (m.id === msg.id ? msg : m)) : old)
      )
      queryClient.invalidateQueries({ queryKey: ["chats"] })
    }

    // Progres broadcast berubah (terkirim/gagal per pesan): perbarui cache di tempat —
    // update item yang sudah ada atau prepend broadcast baru, lalu segarkan log
    const handleBroadcastUpdate = (payload: { broadcast: BroadcastDTO }) => {
      const b = payload?.broadcast
      if (!b?.id) return
      queryClient.setQueriesData<BroadcastDTO[]>(
        { queryKey: ["broadcasts"] },
        (old) => {
          if (!old) return [b]
          const idx = old.findIndex((x) => x.id === b.id)
          if (idx === -1) return [b, ...old]
          const next = [...old]
          next[idx] = b
          return next
        }
      )
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    }

    socket.on("connect", handleConnect)
    socket.on("disconnect", handleDisconnect)
    socket.on("status", handleStatus)
    socket.on("qr", handleQr)
    socket.on("pairing", handlePairing)
    socket.on("ai:typing", handleTyping)
    socket.on("message:update", handleMessageUpdate)
    socket.on("broadcast:update", handleBroadcastUpdate)

    // Socket singleton bisa sudah terhubung SEBELUM listener terpasang (race) —
    // sinkronkan state awal secara manual
    if (socket.connected) handleConnect()

    return () => {
      socket.off("connect", handleConnect)
      socket.off("disconnect", handleDisconnect)
      socket.off("status", handleStatus)
      socket.off("qr", handleQr)
      socket.off("pairing", handlePairing)
      socket.off("ai:typing", handleTyping)
      socket.off("message:update", handleMessageUpdate)
      socket.off("broadcast:update", handleBroadcastUpdate)
    }
  }, [socket, queryClient])

  // Fallback saat layanan socket belum tersedia: ambil status dari DB via API
  useEffect(() => {
    if (serviceConnected) return
    let cancelled = false
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          status: WaStatus
          owner: { name?: string; number?: string; jid?: string } | null
          connectedAt: string | null
        }
        if (!cancelled) {
          setStatus({
            status: data.status,
            owner: data.owner ?? undefined,
            connectedAt: data.connectedAt ?? undefined,
          })
        }
      } catch {
        // abaikan — layanan mungkin belum berjalan
      }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [serviceConnected])

  // Subscribe helper generik (untuk message:new, chat:update, log:new, message:update, dll.)
  const on = useCallback(
    <T,>(event: string, handler: (data: T) => void) => {
      if (!socket) return () => {}
      socket.on(event, handler as never)
      return () => {
        socket.off(event, handler as never)
      }
    },
    [socket]
  )

  const refreshStatus = useCallback(async () => {
    if (socket?.connected) {
      await new Promise<void>((resolve) => {
        socket.timeout(8000).emit("get-status", (err: unknown, res: StatusObj) => {
          if (!err && res && typeof res.status === "string") {
            setStatus(res)
            if (res.status !== "waiting_scan" && res.status !== "connecting") setQr(null)
          }
          resolve()
        })
      })
      return
    }
    try {
      const res = await fetch("/api/status", { cache: "no-store" })
      if (res.ok) {
        const data = (await res.json()) as {
          status: WaStatus
          owner: { name?: string; number?: string; jid?: string } | null
          connectedAt: string | null
        }
        setStatus({
          status: data.status,
          owner: data.owner ?? undefined,
          connectedAt: data.connectedAt ?? undefined,
        })
      }
    } catch {
      // abaikan
    }
  }, [socket])

  const requestQr = useCallback(
    () =>
      new Promise<AckResult>((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: "Layanan WhatsApp sedang offline" })
          return
        }
        setStatus((prev) => ({ ...prev, status: "connecting" }))
        setPairing(null)
        socket.timeout(15000).emit("request-qr", (err: unknown, res: AckResult) => {
          if (err) resolve({ ok: false, error: "Permintaan QR timeout" })
          else resolve(res ?? { ok: true })
        })
      }),
    [socket]
  )

  const requestPairing = useCallback(
    (number: string) =>
      new Promise<AckResult & { code?: string }>((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: "Layanan WhatsApp sedang offline" })
          return
        }
        setPairing(null)
        socket
          .timeout(20000)
          .emit("request-pairing", { number }, (err: unknown, res: AckResult & { code?: string }) => {
            if (err) resolve({ ok: false, error: "Permintaan kode timeout — coba lagi" })
            else resolve(res ?? { ok: true })
          })
      }),
    [socket]
  )

  const clearPairing = useCallback(() => {
    setPairing(null)
    if (socket?.connected) {
      socket.timeout(5000).emit("clear-pairing", () => {})
    }
  }, [socket])

  const logout = useCallback(
    () =>
      new Promise<AckResult>((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: "Layanan WhatsApp sedang offline" })
          return
        }
        socket.timeout(15000).emit("logout", (err: unknown, res: AckResult) => {
          if (err) resolve({ ok: false, error: "Permintaan logout timeout" })
          else resolve(res ?? { ok: true })
        })
      }),
    [socket]
  )

  const sendMessage = useCallback(
    (jid: string, text: string) =>
      new Promise<AckResult>((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: "Layanan WhatsApp sedang offline" })
          return
        }
        socket.timeout(20000).emit("send-message", { jid, text }, (err: unknown, res: AckResult) => {
          if (err) resolve({ ok: false, error: "Pengiriman timeout" })
          else resolve(res ?? { ok: true })
        })
      }),
    [socket]
  )

  // Batalkan jeda AI (ambil alih manual): emit 'resume-ai' {jid} → ack {ok:true} | {ok:false,error}
  const resumeAi = useCallback(
    (jid: string) =>
      new Promise<AckResult>((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: "Layanan WhatsApp sedang offline" })
          return
        }
        socket.timeout(10000).emit("resume-ai", { jid }, (err: unknown, res: AckResult) => {
          if (err) resolve({ ok: false, error: "Permintaan timeout — coba lagi" })
          else resolve(res ?? { ok: true })
        })
      }),
    [socket]
  )

  const pauseAi = useCallback(
    (jid: string, minutes?: number) =>
      new Promise<AckResult & { minutes?: number }>((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: "Layanan WhatsApp sedang offline" })
          return
        }
        socket
          .timeout(10000)
          .emit("pause-ai", { jid, minutes }, (err: unknown, res: AckResult & { minutes?: number }) => {
            if (err) resolve({ ok: false, error: "Permintaan timeout — coba lagi" })
            else resolve(res ?? { ok: true })
          })
      }),
    [socket]
  )

  const value = useMemo<SocketContextValue>(
    () => ({
      socket,
      serviceConnected,
      status,
      qr,
      pairing,
      typingJids,
      on,
      refreshStatus,
      requestQr,
      requestPairing,
      clearPairing,
      logout,
      sendMessage,
      resumeAi,
      pauseAi,
    }),
    [socket, serviceConnected, status, qr, pairing, typingJids, on, refreshStatus, requestQr, requestPairing, clearPairing, logout, sendMessage, resumeAi, pauseAi]
  )

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error("useSocket harus dipakai di dalam <SocketProvider>")
  return ctx
}
