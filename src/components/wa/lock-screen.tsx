"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Delete, Loader2, Lock, LockOpen, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

const MIN_PIN = 4
const MAX_PIN = 8
const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const

interface UnlockResponse {
  ok?: boolean
  pinEnabled?: boolean
  error?: string
}

/** Tombol angka keypad — target sentuh besar, kaca + aksi tekan */
function KeypadButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-xl font-semibold text-white shadow-sm backdrop-blur-sm",
        "transition-[transform,background-color,border-color,opacity] duration-100",
        "hover:border-white/25 hover:bg-white/[0.12] active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  )
}

/**
 * Layar kunci dashboard — menggantikan seluruh shell saat PIN aktif & sesi terkunci.
 * Buka kunci via keypad layar atau keyboard fisik (angka, Backspace, Enter).
 */
export function LockScreen() {
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [shakeNonce, setShakeNonce] = useState(0)
  const [dotsRed, setDotsRed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [opening, setOpening] = useState(false)
  const reduceMotion = useReducedMotion()

  const busy = submitting || opening

  const fail = (message: string) => {
    setError(message)
    setPin("")
    setShakeNonce((n) => n + 1)
    setDotsRed(true)
    window.setTimeout(() => setDotsRed(false), 700)
  }

  const submitPin = async (value: string) => {
    if (busy) return
    if (!/^\d{4,8}$/.test(value)) {
      fail("PIN terdiri dari 4-8 angka")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      })
      const data = (await res.json().catch(() => ({}))) as UnlockResponse
      if (res.ok && (data.ok || data.pinEnabled === false)) {
        // RELOAD WAJIB — socket harus handshake ulang dengan cookie baru
        // agar bergabung ke room 'verified' dan menerima event realtime.
        setOpening(true)
        window.setTimeout(() => window.location.reload(), 450)
        return
      }
      fail(data.error ?? "PIN salah — coba lagi")
    } catch {
      fail("Tidak dapat menghubungi server — periksa koneksi lalu coba lagi")
    } finally {
      setSubmitting(false)
    }
  }

  const pressDigit = (digit: string) => {
    if (busy) return
    setError(null)
    setPin((prev) => (prev.length >= MAX_PIN ? prev : prev + digit))
  }

  const backspace = () => {
    if (busy) return
    setError(null)
    setPin((prev) => prev.slice(0, -1))
  }

  // Keyboard fisik: angka + Backspace + Enter (listener selalu segar — tanpa stale closure)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault()
        pressDigit(e.key)
      } else if (e.key === "Backspace") {
        e.preventDefault()
        backspace()
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (pin.length >= MIN_PIN) void submitPin(pin)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-950 via-green-950 to-black px-4 py-8">
      {/* Ornamen latar — lingkaran blur, cincin, dan pendar radial */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 -top-28 size-80 rounded-full bg-emerald-500/20 blur-3xl sm:size-96" />
        <div className="absolute -bottom-32 -right-24 size-96 rounded-full bg-teal-500/15 blur-3xl sm:size-[28rem]" />
        <div className="absolute -top-16 right-1/4 size-56 rounded-full bg-green-400/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/10 sm:size-[44rem]" />
        <div className="absolute left-1/2 top-1/2 size-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/5 sm:size-[31rem]" />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 55% 40% at 50% 40%, rgb(52 211 153 / 0.12), transparent 70%)" }}
        />
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-8"
      >
        {/* key berubah → elemen diganti ulang → animasi shake diputar dari awal */}
        <div key={shakeNonce} className={cn(shakeNonce > 0 && "animate-shake")}>
          <div className="flex flex-col items-center text-center">
            {/* Perisai dalam cincin gradien emerald→teal, denyut lembut */}
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 opacity-50 blur-md"
                aria-hidden="true"
              />
              <div className="animate-lock-pulse relative flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-950/60">
                <ShieldCheck className="size-8 text-white" aria-hidden="true" />
              </div>
            </div>

            <h1 className="mt-5 text-xl font-semibold tracking-tight text-white">Dashboard Terkunci</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-emerald-100/65">
              Masukkan PIN untuk membuka panel Asisten Mukundo
            </p>

            {/* Titik PIN / spinner saat memproses */}
            <div className="mt-6 flex h-7 items-center justify-center" role="status" aria-live="polite">
              {busy ? (
                <span className="flex items-center gap-2 text-sm text-emerald-200/80">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {opening ? "Membuka dashboard…" : "Memeriksa PIN…"}
                </span>
              ) : (
                <span className="flex items-center gap-2.5" aria-label={`${pin.length} dari ${MAX_PIN} angka dimasukkan`}>
                  {Array.from({ length: MAX_PIN }).map((_, i) => {
                    const filled = i < pin.length
                    return (
                      <motion.span
                        key={i}
                        initial={false}
                        animate={{ scale: filled ? 1 : 0.8 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className={cn(
                          "size-3 rounded-full border transition-colors duration-150",
                          filled
                            ? dotsRed
                              ? "border-red-400 bg-red-400 shadow-sm shadow-red-500/50"
                              : "border-emerald-400 bg-emerald-400 shadow-sm shadow-emerald-500/50"
                            : "border-white/30 bg-transparent",
                        )}
                      />
                    )
                  })}
                </span>
              )}
            </div>

            {/* Pesan galat (terisi server: PIN salah / rate limit) */}
            <p
              aria-live="polite"
              className={cn(
                "mt-1.5 min-h-5 px-2 text-xs font-medium",
                error ? "text-red-300" : "text-transparent",
              )}
            >
              {error ?? " "}
            </p>

            {/* Keypad numerik */}
            <div className="mx-auto mt-4 grid w-full max-w-xs grid-cols-3 gap-2.5 sm:gap-3">
              {KEYPAD_DIGITS.map((d) => (
                <KeypadButton key={d} label={`Angka ${d}`} onPress={() => pressDigit(d)} disabled={busy}>
                  {d}
                </KeypadButton>
              ))}
              <span aria-hidden="true" />
              <KeypadButton label="Angka 0" onPress={() => pressDigit("0")} disabled={busy}>
                0
              </KeypadButton>
              <KeypadButton label="Hapus satu angka" onPress={backspace} disabled={busy || pin.length === 0}>
                <Delete className="size-5" aria-hidden="true" />
              </KeypadButton>
            </div>

            {/* Tombol Buka — aktif setelah ≥4 angka (atau tekan Enter) */}
            <button
              type="button"
              onClick={() => void submitPin(pin)}
              disabled={busy || pin.length < MIN_PIN}
              className={cn(
                "mt-5 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-sm font-semibold text-white shadow-lg shadow-emerald-950/50",
                "transition-all duration-150 hover:from-emerald-400 hover:to-teal-400 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LockOpen className="size-4" aria-hidden="true" />
              )}
              Buka Dashboard
            </button>
          </div>
        </div>
      </motion.div>

      <p className="relative mt-6 flex items-center gap-1.5 text-center text-[11px] text-emerald-100/50">
        <Lock className="size-3 shrink-0" aria-hidden="true" />
        PIN melindungi data chat &amp; aksi WhatsApp Anda
      </p>
    </div>
  )
}
