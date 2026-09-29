// Scheduler broadcast promo — memproses broadcast terjadwal dengan rate-limit aman
// (1 pesan tiap 4-7 detik) supaya nomor WhatsApp pribadi tidak ditandai spam.
import type { Server } from 'socket.io'
import pino from 'pino'
import type { Broadcast as BroadcastRow } from '@prisma/client'
import { db } from './db'

const log = pino({ level: 'info' })

export interface BroadcastDeps {
  io: Server
  /** true bila WhatsApp sedang tersambung */
  isConnected: () => boolean
  /** kirim satu pesan; resolve true bila sukses terkirim */
  sendOne: (jid: string, text: string) => Promise<boolean>
  /** catat aktivitas ke DB + emit log:new */
  log: (type: string, level: string, message: string, meta?: unknown) => void
}

export function serializeBroadcast(b: BroadcastRow) {
  return {
    id: b.id,
    name: b.name,
    message: b.message,
    status: b.status,
    audience: b.audience,
    recipients: b.recipients,
    totalCount: b.totalCount,
    sentCount: b.sentCount,
    failedCount: b.failedCount,
    scheduledAt: b.scheduledAt?.toISOString() ?? null,
    sentAt: b.sentAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Jeda acak antar pesan (4-7 detik) — rate limit wajar menyerupai manusia */
function humanDelay() {
  return sleep(4000 + Math.floor(Math.random() * 3000))
}

export function startBroadcastScheduler(deps: BroadcastDeps, intervalMs = 10_000) {
  let ticking = false

  async function emitUpdate(b: BroadcastRow) {
    try {
      deps.io.to('verified').emit('broadcast:update', { broadcast: serializeBroadcast(b) })
    } catch {
      /* abaikan */
    }
  }

  async function processBroadcast(id: string): Promise<void> {
    let b = await db.broadcast.findUnique({ where: { id } })
    if (!b || b.status !== 'terjadwal') return
    if (!deps.isConnected()) {
      // WA belum terhubung — biarkan tetap terjadwal, dicoba lagi pada tick berikutnya
      log.info(`broadcast "${b.name}" ditunda — WhatsApp belum terhubung`)
      return
    }

    let recipients: Array<{ jid: string; name: string }> = []
    try {
      recipients = JSON.parse(b.recipients || '[]')
    } catch {
      recipients = []
    }
    const doneIdx = b.sentCount + b.failedCount
    const remaining = recipients.slice(doneIdx)
    if (remaining.length === 0) {
      const fin = await db.broadcast.update({
        where: { id },
        data: { status: 'terkirim', sentAt: new Date() },
      })
      await emitUpdate(fin)
      return
    }

    b = await db.broadcast.update({ where: { id }, data: { status: 'mengirim' } })
    await emitUpdate(b)
    deps.log(
      'broadcast',
      'info',
      `Broadcast "${b.name}" mulai mengirim (${remaining.length} penerima, jeda 4-7 detik/pesan)`,
    )
    log.info(`mulai broadcast "${b.name}" → ${remaining.length} penerima`)

    let sent = b.sentCount
    let failed = b.failedCount

    for (let i = 0; i < remaining.length; i++) {
      // Cek status terbaru — bisa dibatalkan/dijeda dari dashboard
      const cur = await db.broadcast.findUnique({ where: { id }, select: { status: true } })
      if (!cur || cur.status !== 'mengirim') {
        deps.log(
          'broadcast',
          'warn',
          `Broadcast "${b.name}" dihentikan (status: ${cur?.status ?? 'terhapus'}) — ${sent} pesan sudah terkirim`,
        )
        return
      }
      if (!deps.isConnected()) {
        // Koneksi putus di tengah jalan — jadwalkan ulang otomatis (resume dari posisi terakhir)
        const r = await db.broadcast.update({
          where: { id },
          data: {
            status: 'terjadwal',
            scheduledAt: new Date(Date.now() + 60_000),
            sentCount: sent,
            failedCount: failed,
          },
        })
        await emitUpdate(r)
        deps.log(
          'broadcast',
          'warn',
          `Koneksi WhatsApp terputus — broadcast "${b.name}" dijeda, lanjut otomatis setelah tersambung kembali`,
        )
        return
      }

      const target = remaining[i]
      if (!target) continue
      let ok = false
      try {
        ok = await deps.sendOne(target.jid, b.message)
      } catch {
        ok = false
      }
      if (ok) sent++
      else failed++

      const updated = await db.broadcast.update({
        where: { id },
        data: { sentCount: sent, failedCount: failed },
      })
      await emitUpdate(updated)

      if (i < remaining.length - 1) await humanDelay()
    }

    const fin = await db.broadcast.update({
      where: { id },
      data: { status: 'terkirim', sentAt: new Date(), sentCount: sent, failedCount: failed },
    })
    await emitUpdate(fin)
    deps.log(
      'broadcast',
      sent > 0 ? 'success' : 'error',
      `Broadcast "${b.name}" selesai — ${sent} terkirim, ${failed} gagal`,
      { sent, failed, total: recipients.length },
    )
    log.info(`broadcast "${b.name}" selesai: ${sent} terkirim, ${failed} gagal`)
  }

  async function tick() {
    if (ticking) return
    ticking = true
    try {
      const due = await db.broadcast.findMany({
        where: { status: 'terjadwal', scheduledAt: { lte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
      })
      for (const b of due) await processBroadcast(b.id)
    } catch (err) {
      log.error({ err }, 'broadcast tick error')
    } finally {
      ticking = false
    }
  }

  const timer = setInterval(() => {
    void tick()
  }, intervalMs)
  // jangan menahan proses exit
  if (typeof timer.unref === 'function') timer.unref()
  log.info(`broadcast scheduler aktif (cek tiap ${intervalMs / 1000}s)`)
  void tick()

  return () => clearInterval(timer)
}
