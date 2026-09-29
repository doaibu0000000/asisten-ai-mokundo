// WA Service — WhatsApp AI Assistant untuk Mukundo Teknologi
// Port 3003, socket.io path '/' (diteruskan Caddy via ?XTransformPort=3003)
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import pino from 'pino'
import { isJidGroup } from '@whiskeysockets/baileys'
import type { WAMessage } from '@whiskeysockets/baileys'
import type { Contact as ContactRow, Message as MessageRow } from '@prisma/client'
import { db } from './db'
import { generateAiReply, splitReply } from './ai'
import { normalizeSchedule, isOpenNow } from './business-hours'
import { generateChatSummary, type SummaryTranscriptLine } from './summary'
import { transcribeVoiceNote, transcribeVideoNote, describeImage, describeDocument, getDocumentMeta, classifyLead } from './media'
import { WaManager, type StatusObj, type MessageEvent } from './wa'
import { startBroadcastScheduler } from './broadcast'
import { socketUnlocked } from './pin-socket'

const log = pino({ level: 'info' })
const PORT = 3003

// ---------------------------------------------------------------------------
// HTTP + Socket.IO
// ---------------------------------------------------------------------------
const httpServer = createServer()
const io = new Server(httpServer, {
  // JANGAN ubah path — dipakai Caddy untuk forwarding
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
})

// ---------------------------------------------------------------------------
// Serializers (DTO ke dashboard)
// ---------------------------------------------------------------------------
function serializeMessage(m: MessageRow) {
  return {
    id: m.id,
    contactId: m.contactId,
    jid: m.jid,
    fromMe: m.fromMe,
    body: m.body,
    msgType: m.msgType,
    source: m.source,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  }
}

function serializeContact(c: ContactRow) {
  return {
    id: c.id,
    jid: c.jid,
    name: c.name,
    number: c.number,
    isGroup: c.isGroup,
    aiEnabled: c.aiEnabled,
    aiPausedUntil: c.aiPausedUntil ? c.aiPausedUntil.toISOString() : null,
    aiSummary: c.aiSummary,
    aiSummaryAt: c.aiSummaryAt ? c.aiSummaryAt.toISOString() : null,
    leadStatus: c.leadStatus,
    leadManual: c.leadManual,
    notes: c.notes,
    unread: c.unread,
    lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    lastMessageText: c.lastMessageText,
    lastMessageFromMe: c.lastMessageFromMe,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

function serializeLog(l: {
  id: string
  type: string
  level: string
  message: string
  meta: string | null
  createdAt: Date
}) {
  return {
    id: l.id,
    type: l.type,
    level: l.level,
    message: l.message,
    meta: l.meta,
    createdAt: l.createdAt.toISOString(),
  }
}

async function logActivity(type: string, level: string, message: string, meta?: unknown) {
  try {
    const row = await db.activityLog.create({
      data: { type, level, message, meta: meta === undefined ? null : JSON.stringify(meta) },
    })
    io.to('verified').emit('log:new', { log: serializeLog(row) })
  } catch (err) {
    log.error({ err }, 'logActivity gagal')
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// WhatsApp manager
// ---------------------------------------------------------------------------
let lastLoggedStatus = ''

const wa = new WaManager({
  onStatus: (s: StatusObj) => {
    io.to('verified').emit('status', s)
    void (async () => {
      try {
        const data: Record<string, unknown> = {
          status: s.status,
          ownerJid: s.owner?.jid ?? null,
          ownerName: s.owner?.name ?? null,
          ownerNumber: s.owner?.number ?? null,
          connectedAt: s.connectedAt ? new Date(s.connectedAt) : null,
        }
        if (s.status !== 'waiting_scan') data.qrCode = null
        await db.waSession.upsert({
          where: { id: 'main' },
          update: data,
          create: { id: 'main', ...data },
        })
      } catch (err) {
        log.error({ err }, 'gagal simpan WaSession')
      }
    })()
    if (s.status === 'connected') {
      if (lastLoggedStatus !== 'connected') {
        lastLoggedStatus = 'connected'
        void logActivity(
          'connection',
          'success',
          `WhatsApp terhubung sebagai ${s.owner?.name ?? 'Pemilik'} (+${s.owner?.number ?? '-'}). Asisten AI siap membalas chat.`,
        )
      }
    } else if (s.status === 'disconnected' && s.reason && lastLoggedStatus !== 'disconnected') {
      lastLoggedStatus = 'disconnected'
      void logActivity('connection', 'warn', s.reason)
    }
  },
  onQr: (qrDataUrl: string, attempt: number) => {
    io.to('verified').emit('qr', { qrDataUrl })
    void (async () => {
      try {
        await db.waSession.upsert({
          where: { id: 'main' },
          update: { qrCode: qrDataUrl, qrAt: new Date(), status: 'waiting_scan' },
          create: { id: 'main', qrCode: qrDataUrl, qrAt: new Date(), status: 'waiting_scan' },
        })
      } catch {
        /* abaikan */
      }
    })()
    if (attempt === 1) {
      void logActivity('connection', 'info', 'QR login baru tersedia. Menunggu scan dari HP — QR akan diperbarui otomatis.')
    }
  },
  onMessage: (ev: MessageEvent) => {
    void handleMessage(ev.waMsg, ev.upsertType)
  },
  onReconnecting: (info: string) => {
    io.to('verified').emit('status', { ...wa.getStatus(), status: 'connecting', reason: info })
  },
  onPairingCode: (code: string, number: string) => {
    io.to('verified').emit('pairing', { code, number })
    void logActivity(
      'connection',
      'info',
      `Kode pairing untuk +${number}: ${code.slice(0, 4)}-${code.slice(4)} — masukkan di HP (Perangkat Tertaut > Tautkan dengan Nomor Telepon).`,
      { number },
    )
  },
})

// ---------------------------------------------------------------------------
// Ekstraksi isi pesan
// ---------------------------------------------------------------------------
interface MsgInfo {
  jid: string
  text: string
  msgType: string
  fromMe: boolean
  waMsgId: string | null
  ts: number
  pushName: string | null
}

function extractMessageInfo(m: WAMessage): MsgInfo | null {
  const jid = m.key.remoteJid
  if (!jid || jid === 'status@broadcast') return null
  // Pesan WA bisa terbungkus lapisan protokol (disappearing message / view once) — buka dulu sampai isi asli
  const raw = (m.message ?? {}) as Record<string, any>
  if (raw.protocolMessage || raw.reactionMessage || raw.messageReactionMessage || raw.ephemeralMessage?.protocolMessage)
    return null
  let msg = raw
  for (const wrapper of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
    const inner = msg[wrapper]?.message
    if (inner && typeof inner === 'object') msg = inner
  }
  if (msg.protocolMessage || msg.reactionMessage) return null
  if (msg.protocolMessage || msg.reactionMessage || msg.messageReactionMessage || msg.ephemeralMessage?.protocolMessage)
    return null
  let text = ''
  let msgType = 'unknown'
  const pick = (
    type: string,
    value: { text?: string; caption?: string; name?: string; address?: string; displayName?: string } | null | undefined,
  ) => {
    msgType = type
    text = String(value?.text ?? value?.caption ?? value?.name ?? value?.address ?? value?.displayName ?? '')
  }
  if (msg.conversation) pick('text', { text: msg.conversation })
  else if (msg.extendedTextMessage) pick('text', { text: msg.extendedTextMessage.text })
  else if (msg.imageMessage) pick('image', msg.imageMessage)
  else if (msg.videoMessage) pick('video', msg.videoMessage)
  else if (msg.audioMessage) pick('audio', null)
  else if (msg.stickerMessage) pick('sticker', null)
  else if (msg.documentMessage) {
    // Dokumen: baris pertama terstruktur "📎 nama-file · N hal." + caption — dipakai UI file-card & konteks AI
    msgType = 'document'
    const doc = msg.documentMessage as Record<string, any>
    const fn = String(doc?.fileName ?? '').trim()
    const cap = String(doc?.caption ?? '').trim()
    const pc = Number(doc?.pageCount)
    const head = `📎 ${fn || 'Dokumen'}${Number.isFinite(pc) && pc > 0 ? ` · ${Math.min(Math.floor(pc), 999)} hal.` : ''}`
    text = [head, cap].filter((s) => s.length > 0).join('\n')
  }
  else if (msg.locationMessage) pick('location', msg.locationMessage)
  else if (msg.liveLocationMessage) pick('location', msg.liveLocationMessage)
  else if (msg.contactMessage) pick('contact', msg.contactMessage)
  else if (msg.contactsArrayMessage) pick('contact', msg.contactsArrayMessage)
  else if (msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3) pick('poll', null)
  else if (msg.viewOnceMessage) {
    const inner = msg.viewOnceMessage.message ?? {}
    if (inner.imageMessage) pick('image', inner.imageMessage)
    else if (inner.videoMessage) pick('video', inner.videoMessage)
    else return null
  }
  const ts = m.messageTimestamp ? Number(m.messageTimestamp) * 1000 : Date.now()
  return {
    jid,
    text,
    msgType,
    fromMe: !!m.key.fromMe,
    waMsgId: m.key.id ?? null,
    ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
    pushName: m.pushName || null,
  }
}

// ---------------------------------------------------------------------------
// Kontak & penyimpanan pesan
// ---------------------------------------------------------------------------
const sentIds = new Set<string>() // id pesan WhatsApp yang dikirim service ini (ai/manual)
const groupNames = new Map<string, string>()
const CONTACT_NUMBER_RE = /^(\d{8,16})@/

async function upsertContact(
  jid: string,
  isGroup: boolean | undefined,
  name: string | null,
): Promise<{ contact: ContactRow; isNew: boolean }> {
  const existing = await db.contact.findUnique({ where: { jid } })
  if (existing) {
    if (name && existing.name !== name) {
      const updated = await db.contact.update({ where: { id: existing.id }, data: { name } })
      return { contact: updated, isNew: false }
    }
    return { contact: existing, isNew: false }
  }
  const number = CONTACT_NUMBER_RE.exec(jid)?.[1] ?? jid.split('@')[0] ?? jid
  const contact = await db.contact.create({ data: { jid, number, isGroup, name: name ?? null } })
  return { contact, isNew: true }
}

async function saveMessageRow(
  contact: ContactRow,
  info: MsgInfo,
  source: 'client' | 'ai' | 'manual' | 'owner' | 'broadcast',
  status: 'received' | 'sent' | 'failed' = 'received',
): Promise<MessageRow | null> {
  try {
    const saved = await db.message.create({
      data: {
        contactId: contact.id,
        jid: info.jid,
        waMsgId: info.waMsgId,
        fromMe: info.fromMe,
        body: info.text,
        msgType: info.msgType,
        source,
        status,
        createdAt: new Date(info.ts),
      },
    })
    return saved
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === 'P2002') return null // duplikat (sudah pernah tersimpan)
    throw err
  }
}

async function updateContactAggregates(
  contactId: string,
  info: MsgInfo,
  fromMe: boolean,
): Promise<ContactRow | null> {
  const preview = info.text ? info.text.slice(0, 160) : `[${info.msgType}]`
  try {
    return await db.contact.update({
      where: { id: contactId },
      data: {
        lastMessageAt: new Date(info.ts),
        lastMessageText: preview,
        lastMessageFromMe: fromMe,
        ...(fromMe ? {} : { unread: { increment: 1 } }),
      },
    })
  } catch {
    return null
  }
}

/** Perbarui isi pesan (mis. hasil transkrip/deskripsi media) tanpa menambah unread */
async function updateMessageBody(id: string, body: string): Promise<MessageRow | null> {
  try {
    return await db.message.update({ where: { id }, data: { body } })
  } catch {
    return null
  }
}

/** Perbarui preview kontak setelah media diperkaya (tanpa menambah unread) */
async function updateContactPreview(
  contactId: string,
  text: string,
  ts: number,
): Promise<ContactRow | null> {
  try {
    return await db.contact.update({
      where: { id: contactId },
      data: {
        lastMessageAt: new Date(ts),
        lastMessageText: text.slice(0, 160),
        lastMessageFromMe: false,
      },
    })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Saklar titik ( . ) — kendali AI per chat langsung dari HP pemilik
// ---------------------------------------------------------------------------
/** true bila pesan ini sinyal saklar: titik tunggal yang dikirim PEMILIK di chat pribadi */
function isDotSignal(info: MsgInfo, isGroup: boolean | undefined): boolean {
  return (
    info.fromMe &&
    !isGroup &&
    !info.jid.includes('@newsletter') &&
    info.msgType === 'text' &&
    info.text.trim() === '.'
  )
}

/**
 * Terapkan sinyal titik: toggle aiEnabled kontak tsb.
 * - Saat MENGHIDUPKAN: jeda ambil alih manual ikut dibatalkan, dan AI TIDAK
 *   membalas riwayat lama — hanya pesan klien yang masuk SETELAH ini yang dibalas.
 * - Pesan titik tidak disimpan ke riwayat (sinyal kontrol, bukan chat).
 */
async function applyDotSignal(jid: string): Promise<void> {
  const contact = await db.contact.findUnique({ where: { jid } })
  if (!contact) return
  const enable = !contact.aiEnabled
  const updated = await db.contact.update({
    where: { id: contact.id },
    data: { aiEnabled: enable, ...(enable ? { aiPausedUntil: null } : {}) },
  })
  io.to('verified').emit('chat:update', { contact: serializeContact(updated) })
  const label = updated.name || '+' + updated.number
  if (enable) {
    await logActivity(
      'ai_reply',
      'success',
      `🤖 AI aktif utk ${label} — menunggu chat baru masuk (riwayat sebelumnya tidak dibalas). Kirim "." lagi untuk mematikan.`,
      { jid },
    )
  } else {
    await logActivity(
      'settings',
      'info',
      `⏸️ AI dimatikan utk ${label} — kirim "." untuk mengaktifkan lagi.`,
      { jid },
    )
  }
}

/** Log terbatas (maks 1x / 15 menit per kontak) saat pesan klien datang tapi AI nonaktif */
const aiDisabledLogAt = new Map<string, number>()
async function logAiDisabledSkip(jid: string, number: string): Promise<void> {
  const now = Date.now()
  const last = aiDisabledLogAt.get(jid) ?? 0
  if (now - last < 15 * 60_000) return
  aiDisabledLogAt.set(jid, now)
  await logActivity(
    'message',
    'info',
    `💤 AI nonaktif utk +${number} — pesan masuk tidak dibalas. Kirim "." di chat itu untuk mengaktifkan AI.`,
    { jid },
  )
}

// ---------------------------------------------------------------------------
// Handler pesan masuk/keluar
// ---------------------------------------------------------------------------
async function handleMessage(m: WAMessage, _upsertType: string): Promise<void> {
  try {
    const info = extractMessageInfo(m)
    if (!info) return
    const isGroup = isJidGroup(info.jid)

    if (info.fromMe) {
      // Pesan yang dikirim service ini sendiri sudah tersimpan saat dikirim
      if (info.waMsgId && sentIds.has(info.waMsgId)) return
      // Saklar titik ( . ) — kendali AI dari HP pemilik. Sinyal kontrol:
      // tidak disimpan sebagai pesan & tidak memicu jeda ambil alih manual.
      if (isDotSignal(info, isGroup)) {
        await applyDotSignal(info.jid)
        return
      }
      // Pesan yang diketik pemilik langsung dari HP
      const { contact } = await upsertContact(info.jid, isGroup, null)
      const saved = await saveMessageRow(contact, info, 'owner')
      if (!saved) return
      await updateContactAggregates(contact.id, info, true)
      io.to('verified').emit('message:new', { message: serializeMessage(saved), isNewContact: false })
      // Deteksi ambil alih manual: pemilik membalas dari HP → jeda AI utk kontak ini
      await pauseAiForHandover(info.jid, contact.id, 'pemilik membalas dari HP')
      return
    }

    // Pesan masuk dari klien
    let name = info.pushName
    if (isGroup) {
      name = groupNames.get(info.jid) ?? null
      if (!name) {
        try {
          const meta = await wa.getSock()?.groupMetadata(info.jid)
          if (meta?.subject) {
            groupNames.set(info.jid, meta.subject)
            name = meta.subject
          }
        } catch {
          /* abaikan */
        }
      }
    }
    const { contact, isNew } = await upsertContact(info.jid, isGroup, name)
    const saved = await saveMessageRow(contact, info, 'client')
    if (!saved) return
    const updated = await updateContactAggregates(contact.id, info, false)
    io.to('verified').emit('message:new', { message: serializeMessage(saved), isNewContact: isNew })
    if (updated) io.to('verified').emit('chat:update', { contact: serializeContact(updated) })
    if (isNew) {
      await logActivity('message', 'info', `Percakapan baru dari ${contact.name || '+' + contact.number}`, {
        jid: contact.jid,
      })
    }

    // Media intelligence: transkrip suara/video (ASR), deskripsi foto (VLM), baca dokumen PDF (VLM)
    if (!isGroup && ['audio', 'image', 'video', 'document'].includes(info.msgType)) {
      const enrichedText = await enrichMediaMessage(saved, contact, info, m)
      if (enrichedText) info.text = enrichedText
    }

    // Pemicu balasan AI: hanya chat pribadi & ada konten yang bisa dijawab
    const aiTriggerable =
      !isGroup &&
      (info.text.trim().length > 0 || ['image', 'document', 'location', 'contact'].includes(info.msgType))
    if (aiTriggerable) {
      scheduleAiReply(info.jid)
    }
  } catch (err) {
    log.error({ err }, 'handleMessage gagal')
    await logActivity('error', 'error', `Gagal memproses pesan masuk: ${(err as Error)?.message ?? String(err)}`)
  }
}

/**
 * Perkaya pesan media (audio → transkrip ASR, image → deskripsi VLM).
 * Perbarui body pesan + preview kontak, emit 'message:update' ke dashboard.
 * Mengembalikan teks hasil (null bila gagal / fitur dimatikan).
 */
async function enrichMediaMessage(
  saved: MessageRow,
  contact: ContactRow,
  info: MsgInfo,
  waMsg: WAMessage,
): Promise<string | null> {
  try {
    const settings = await db.aiSetting.findUnique({ where: { id: 'main' } })
    if (!settings) return null
    const sock = wa.getSock()

    let enriched: string | null = null
    if (info.msgType === 'audio' && settings.transcribeVoice) {
      enriched = await transcribeVoiceNote(waMsg, sock)
      if (enriched) {
        await logActivity(
          'message',
          'info',
          `🎙️ Transkrip pesan suara dari ${contact.name || '+' + contact.number}: "${enriched.slice(0, 120)}"`,
          { jid: contact.jid },
        )
      } else {
        await logActivity(
          'message',
          'warn',
          `Pesan suara dari ${contact.name || '+' + contact.number} gagal ditranskrip — AI tidak membalas pesan ini.`,
          { jid: contact.jid },
        )
      }
    } else if (info.msgType === 'video' && settings.transcribeVoice) {
      // Video / video note dari klien → ekstrak audio → transkrip ASR
      enriched = await transcribeVideoNote(waMsg, sock)
      if (enriched) {
        await logActivity(
          'message',
          'info',
          `🎬 Transkrip video dari ${contact.name || '+' + contact.number}: "${enriched.slice(0, 120)}"`,
          { jid: contact.jid },
        )
      } else {
        await logActivity(
          'message',
          'warn',
          `Video dari ${contact.name || '+' + contact.number} gagal ditranskrip — AI tidak membalas pesan ini.`,
          { jid: contact.jid },
        )
      }
    } else if (info.msgType === 'image' && settings.visionImages) {
      enriched = await describeImage(waMsg, sock, info.text)
      if (enriched) {
        const body = info.text.trim() ? `${info.text.trim()}\n(📷 AI melihat: ${enriched})` : `(📷 AI melihat: ${enriched})`
        enriched = body
        await logActivity(
          'message',
          'info',
          `📷 Foto dari ${contact.name || '+' + contact.number} dianalisis: "${enriched.slice(0, 120)}"`,
          { jid: contact.jid },
        )
      }
    } else if (info.msgType === 'document' && settings.visionDocuments) {
      // Dokumen PDF dari klien → raster halaman → VLM → deskripsi (penawaran/kwitansi/nota)
      const meta = getDocumentMeta(waMsg)
      const isPdf = meta?.mimetype === 'application/pdf'
      const label = contact.name || '+' + contact.number
      if (isPdf) {
        const doc = await describeDocument(waMsg, sock)
        if (doc) {
          const head = `📎 ${doc.fileName || 'Dokumen'}${doc.pageCount ? ` · ${doc.pageCount} hal.` : ''}`
          enriched = [head, doc.caption ?? '', `(📄 AI membaca dokumen: ${doc.description})`]
            .filter((s) => s.trim().length > 0)
            .join('\n')
          await logActivity(
            'message',
            'info',
            `📄 Dokumen PDF dari ${label} dibaca: "${doc.description.slice(0, 120)}"`,
            { jid: contact.jid },
          )
        } else {
          await logActivity(
            'message',
            'warn',
            `Dokumen PDF dari ${label} gagal dibaca AI — AI membalas tanpa isi dokumen.`,
            { jid: contact.jid },
          )
        }
      } else {
        await logActivity(
          'message',
          'info',
          `📎 ${label} mengirim dokumen non-PDF${meta?.fileName ? ` (${meta.fileName})` : ''} — hanya PDF yang dapat dibaca AI.`,
          { jid: contact.jid },
        )
      }
    }
    if (!enriched) return null

    const updatedMsg = await updateMessageBody(saved.id, enriched)
    if (updatedMsg) io.to('verified').emit('message:update', { message: serializeMessage(updatedMsg) })
    const updatedContact = await updateContactPreview(contact.id, enriched, info.ts)
    if (updatedContact) io.to('verified').emit('chat:update', { contact: serializeContact(updatedContact) })
    return enriched
  } catch (err) {
    log.error({ err }, 'enrichMediaMessage gagal')
    return null
  }
}

// ---------------------------------------------------------------------------
// Kirim & simpan pesan keluar (AI / manual dari dashboard)
// ---------------------------------------------------------------------------
async function sendAndSave(
  jid: string,
  text: string,
  source: 'ai' | 'manual' | 'broadcast',
): Promise<{ saved: MessageRow; contact: ContactRow; isNewContact: boolean } | null> {
  const isGroup = isJidGroup(jid) ?? false
  const { contact, isNew } = await upsertContact(jid, isGroup, null)
  const waMsgId = await wa.sendMessage(jid, text)
  if (waMsgId) sentIds.add(waMsgId)
  const saved = await saveMessageRow(
    contact,
    { jid, text, msgType: 'text', fromMe: true, waMsgId, ts: Date.now(), pushName: null },
    source,
    'sent',
  )
  if (!saved) {
    // sudah pernah tersimpan (race) — cukup kirim ulang referensi
    return null
  }
  const updated = await updateContactAggregates(contact.id, {
    jid,
    text,
    msgType: 'text',
    fromMe: true,
    waMsgId,
    ts: Date.now(),
    pushName: null,
  }, true)
  io.to('verified').emit('message:new', { message: serializeMessage(saved), isNewContact: isNew })
  if (updated) io.to('verified').emit('chat:update', { contact: serializeContact(updated) })
  // Balasan manual dari dashboard = pemilik mengambil alih → jeda AI utk kontak ini
  if (source === 'manual' && !isGroup) {
    await pauseAiForHandover(jid, contact.id, 'balasan manual dari dashboard')
  }
  return { saved, contact: updated ?? contact, isNewContact: isNew }
}

// ---------------------------------------------------------------------------
// Engine balasan otomatis AI
// ---------------------------------------------------------------------------
interface AiQueueItem {
  timer: NodeJS.Timeout | null
  processing: boolean
  pending: boolean
}
const aiQueue = new Map<string, AiQueueItem>()

// Kontak yang barusan di-skip karena jeda ambil-alih (anti-spam log)
const handoverSkipLogged = new Map<string, number>()

/**
 * Deteksi ambil alih manual (human handover): saat pemilik membalas manual
 * (dari HP atau dashboard), AI dijeda utk kontak tsb selama settings.handoverMinutes.
 * Broadcast TIDAK memicu jeda (bukan percakapan personal).
 */
async function pauseAiForHandover(jid: string, contactId: string, via: string): Promise<void> {
  try {
    if (isJidGroup(jid)) return
    const settings = await db.aiSetting.findUnique({
      where: { id: 'main' },
      select: { handoverEnabled: true, handoverMinutes: true },
    })
    if (!settings?.handoverEnabled) return
    const minutes = Math.max(5, Math.min(240, settings.handoverMinutes))
    const until = new Date(Date.now() + minutes * 60_000)
    const updated = await db.contact.update({
      where: { id: contactId },
      data: { aiPausedUntil: until },
    })
    io.to('verified').emit('chat:update', { contact: serializeContact(updated) })
    // Log hanya bila sebelumnya aktif (bukan setiap huruf yang diketik pemilik)
    await logActivity(
      'ai_reply',
      'info',
      `⏸️ AI dijeda utk +${updated.number} (${via}) — lanjut otomatis ${minutes} menit lagi atau tekan "Lanjutkan AI"`,
      { jid },
    )
    // Ringkasan AI otomatis di latar belakang — konteks cepat utk pemilik yang mengambil alih
    void generateAndSaveSummary(contactId, { force: false })
  } catch (err) {
    log.error({ err }, 'pauseAiForHandover gagal')
  }
}

/**
 * Generate ringkasan percakapan via LLM lalu simpan ke Contact.aiSummary.
 * Throttle 10 menit (kecuali force) — pemilik yang mengetik banyak pesan berurutan
 * tidak memicu regenerasi berulang.
 */
async function generateAndSaveSummary(
  contactId: string,
  opts: { force: boolean },
): Promise<boolean> {
  try {
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      select: { id: true, jid: true, number: true, aiSummaryAt: true },
    })
    if (!contact) return false
    if (!opts.force && contact.aiSummaryAt && Date.now() - contact.aiSummaryAt.getTime() < 10 * 60_000) {
      return false // masih segar — jangan regenerate
    }
    // 60 pesan TERBARU (desc lalu dibalik) — ringkasan harus mencerminkan posisi percakapan sekarang
    const rows = await db.message.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      select: { fromMe: true, source: true, body: true },
      take: 60,
    })
    const messages = rows.reverse()
    const lines: SummaryTranscriptLine[] = []
    for (const m of messages) {
      const text = (m.body ?? '').trim()
      if (!text) continue
      if (!m.fromMe) {
        lines.push({ role: 'klien', text })
      } else if (m.source === 'ai') {
        lines.push({ role: 'ai', text })
      } else if (m.source === 'manual' || m.source === 'owner') {
        lines.push({ role: 'pemilik', text })
      } // broadcast dilewati
    }
    if (!lines.some((l) => l.role === 'klien')) return false // tak ada pesan klien utk diringkas
    const result = await generateChatSummary(lines)
    const updated = await db.contact.update({
      where: { id: contactId },
      data: { aiSummary: JSON.stringify(result), aiSummaryAt: new Date() },
    })
    io.to('verified').emit('chat:update', { contact: serializeContact(updated) })
    await logActivity(
      'ai_reply',
      'success',
      `🧠 Ringkasan AI dibuat utk +${updated.number} — konteks pengambilalihan siap`,
      { jid: updated.jid },
    )
    return true
  } catch (err) {
    log.error({ err }, 'generateAndSaveSummary gagal')
    return false
  }
}

/** true bila AI masih dijeda utk jid ini (masa berlaku belum lewat) */
async function isAiPaused(contact: { aiPausedUntil: Date | null }): Promise<boolean> {
  return !!contact.aiPausedUntil && contact.aiPausedUntil.getTime() > Date.now()
}

/** Log skip krn jeda ambil alih — maks 1x per kontak per 5 menit (anti-spam log) */
async function logHandoverSkip(jid: string, number: string): Promise<void> {
  const last = handoverSkipLogged.get(jid) ?? 0
  if (Date.now() - last < 5 * 60_000) return
  handoverSkipLogged.set(jid, Date.now())
  await logActivity(
    'ai_reply',
    'info',
    `⏸️ AI melewati pesan dari +${number} — pemilik sedang menangani chat ini (jeda ambil alih)`,
    { jid },
  )
}

function scheduleAiReply(jid: string) {
  const q = aiQueue.get(jid) ?? { timer: null, processing: false, pending: false }
  aiQueue.set(jid, q)
  if (q.processing) {
    // AI sedang memproses — tandai supaya dijalankan ulang setelah selesai
    q.pending = true
    return
  }
  if (q.timer) clearTimeout(q.timer)
  q.timer = setTimeout(() => {
    q.timer = null
    runAiReply(jid)
      .catch(() => {})
      .finally(() => {
        if (q.pending) {
          q.pending = false
          scheduleAiReply(jid)
        }
      })
  }, 1600)
}

// ---------------------------------------------------------------------------
// Deteksi lead (potensi order) dari isi percakapan
// ---------------------------------------------------------------------------
const leadClassifiedAt = new Map<string, number>()
const LEAD_CLASSIFY_COOLDOWN_MS = 5 * 60 * 1000
const LEAD_LABEL: Record<string, string> = {
  baru: 'Baru',
  potensial: 'Potensial',
  hot: 'HOT 🔥',
  selesai: 'Selesai',
}

async function classifyContactLead(jid: string): Promise<void> {
  try {
    const contact = await db.contact.findUnique({ where: { jid } })
    if (!contact || contact.isGroup) return
    if (contact.leadManual) return // status diatur manual pemilik — jangan diubah otomatis
    if (contact.leadStatus === 'selesai') return // status final — jangan diturunkan
    const last = leadClassifiedAt.get(jid) ?? 0
    if (Date.now() - last < LEAD_CLASSIFY_COOLDOWN_MS) return
    leadClassifiedAt.set(jid, Date.now())

    const historyRows = await db.message.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'desc' },
      take: 24,
    })
    const history = historyRows.reverse().map((m) => ({
      role: (m.fromMe ? 'assistant' : 'user') as 'assistant' | 'user',
      content: m.body?.trim() ? m.body : `[mengirim ${m.msgType}]`,
    }))
    const lead = await classifyLead(history)
    if (!lead || lead === contact.leadStatus) return

    const updated = await db.contact.update({ where: { id: contact.id }, data: { leadStatus: lead } })
    io.to('verified').emit('chat:update', { contact: serializeContact(updated) })
    const label = contact.name || '+' + contact.number
    if (lead === 'hot') {
      await logActivity('message', 'success', `🔥 Lead HOT: ${label} terindikasi mau pesan — segera follow-up!`, {
        jid,
      })
    } else if (lead === 'potensial' || lead === 'selesai') {
      await logActivity(
        'message',
        'info',
        `Lead ${label} menjadi ${LEAD_LABEL[lead] ?? lead}.`,
        { jid },
      )
    }
  } catch {
    /* abaikan — klasifikasi lead bersifat best-effort */
  }
}

function setAiTyping(jid: string, typing: boolean) {
  io.to('verified').emit('ai:typing', { jid, typing })
  void wa.sendTyping(jid, typing)
}

async function runAiReply(jid: string): Promise<void> {
  const q = aiQueue.get(jid)
  if (q) q.processing = true
  try {
    const contact = await db.contact.findUnique({ where: { jid } })
    if (!contact || contact.isGroup) return
    if (!contact.aiEnabled) {
      // AI sengaja dimatikan pemilik (saklar titik) — cukup log terbatas agar pemilik paham kenapa tak dibalas
      await logAiDisabledSkip(jid, contact.number)
      return
    }
    // Jeda ambil alih manual — pemilik sedang menangani chat ini sendiri
    if (await isAiPaused(contact)) {
      await logHandoverSkip(jid, contact.number)
      return
    }
    const settings = await db.aiSetting.findUnique({ where: { id: 'main' } })
    if (!settings || !settings.autoReplyEnabled) return
    if (!wa.isReady()) return

    // Jadwal jam operasional per-hari (0=Minggu..6=Sabtu) — sumber kebenaran tunggal
    const hoursRows = await db.businessHour.findMany()
    const schedule = normalizeSchedule(hoursRows)

    // Di luar jam operasional & mode balasan di luar jam dimatikan → kirim away message saja
    if (!isOpenNow(schedule) && !settings.outsideHoursReply) {
      const away = settings.awayMessage?.trim()
      if (away) {
        const result = await sendAndSave(jid, away, 'ai')
        if (result) {
          await logActivity('ai_reply', 'info', `Pesan otomatis di luar jam kerja dikirim ke +${contact.number}`)
        }
      }
      return
    }

    if (settings.typingIndicator) setAiTyping(jid, true)
    const delaySec =
      settings.replyDelayMin + Math.random() * Math.max(0, settings.replyDelayMax - settings.replyDelayMin)
    await sleep(delaySec * 1000)

    // Cek ulang setelah jeda mengetik — pemilik bisa saja membalas manual di tengah jeda
    const contactNow = await db.contact.findUnique({ where: { jid }, select: { aiPausedUntil: true, number: true } })
    if (contactNow && (await isAiPaused(contactNow))) {
      setAiTyping(jid, false)
      await logHandoverSkip(jid, contactNow.number)
      return
    }

    const historyRows = await db.message.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'desc' },
      take: Math.max(4, Math.min(50, settings.contextMessages)),
    })
    const history = historyRows
      .reverse()
      .map((m) => ({
        role: (m.fromMe ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.body?.trim() ? m.body : `[mengirim ${m.msgType}]`,
      }))

    const knowledge = await db.knowledgeItem.findMany({ where: { active: true } })
    const reply = await generateAiReply(settings, knowledge, history, schedule)
    const chunks = splitReply(reply)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      if (chunk === undefined) continue
      if (settings.typingIndicator) setAiTyping(jid, true)
      const ok = await sendAndSave(jid, chunk, 'ai')
      if (!ok) break
      if (i < chunks.length - 1) await sleep(700 + Math.random() * 600)
    }
    await logActivity(
      'ai_reply',
      'success',
      `AI membalas +${contact.number}: ${(chunks[0] ?? '').slice(0, 100)}`,
      { jid, chunks: chunks.length },
    )

    // Deteksi lead (potensi order) di latar belakang — tidak memblokir balasan
    if (settings.leadDetection) {
      void classifyContactLead(jid)
    }
  } catch (err) {
    const message = (err as Error)?.message ?? String(err)
    log.error({ err }, 'AI gagal membalas')
    await logActivity('error', 'error', `AI gagal membalas: ${message}`)
  } finally {
    setAiTyping(jid, false)
    const q2 = aiQueue.get(jid)
    if (q2) q2.processing = false
  }
}

// ---------------------------------------------------------------------------
// Normalisasi nomor → jid
// ---------------------------------------------------------------------------
function normalizeToJid(input: string): string | null {
  let digits = String(input || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) digits = '62' + digits.slice(1)
  else if (digits.startsWith('8')) digits = '62' + digits
  if (digits.length < 9 || digits.length > 15) return null
  return `${digits}@s.whatsapp.net`
}

function safeCb(cb: ((data: unknown) => void) | undefined | null, data: unknown) {
  try {
    cb?.(data)
  } catch {
    /* abaikan */
  }
}

// ---------------------------------------------------------------------------
// Socket.IO handlers
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  log.info({ id: socket.id }, 'dashboard terhubung')

  // Verifikasi kunci PIN di handshake — socket valid digabung ke room 'verified'
  // supaya hanya dashboard yang sudah dibuka kuncinya yang menerima event privat.
  void (async () => {
    if (await socketUnlocked(socket)) {
      socket.join('verified')
      socket.emit('status', wa.getStatus())
      if (wa.latestQr) socket.emit('qr', { qrDataUrl: wa.latestQr })
      if (wa.latestPairing) socket.emit('pairing', wa.latestPairing)
    } else {
      log.warn({ id: socket.id }, 'socket TIDAK diverifikasi (dashboard terkunci) — akses dibatasi')
    }
  })()

  socket.on('get-status', (cb) => {
    safeCb(cb, wa.getStatus())
  })

  socket.on('get-qr', async (cb) => {
    if (!(await socketUnlocked(socket))) return safeCb(cb, null)
    safeCb(cb, wa.latestQr ? { qrDataUrl: wa.latestQr } : null)
  })

  socket.on('get-pairing', async (cb) => {
    if (!(await socketUnlocked(socket))) return safeCb(cb, null)
    safeCb(cb, wa.latestPairing)
  })

  socket.on('clear-pairing', async (cb) => {
    if (!(await socketUnlocked(socket))) {
      return safeCb(cb, { ok: false, error: 'Dashboard terkunci — buka kunci dulu' })
    }
    wa.clearPairing()
    safeCb(cb, { ok: true })
  })

  socket.on('request-pairing', async (payload: { number?: string } | null, cb) => {
    try {
      if (!(await socketUnlocked(socket))) {
        return safeCb(cb, { ok: false, error: 'Dashboard terkunci — buka kunci dulu' })
      }
      const number = String(payload?.number ?? '').replace(/\D/g, '')
      if (!number) return safeCb(cb, { ok: false, error: 'Nomor HP wajib diisi' })
      if (number.length < 9 || number.length > 15) {
        return safeCb(cb, { ok: false, error: 'Nomor HP tidak valid (format: 628xxx)' })
      }
      const res = await wa.requestPairing(number)
      safeCb(cb, res)
    } catch (err) {
      safeCb(cb, { ok: false, error: (err as Error)?.message ?? 'Gagal meminta kode pairing' })
    }
  })

  socket.on('request-qr', async (cb) => {
    try {
      if (!(await socketUnlocked(socket))) {
        return safeCb(cb, { ok: false, error: 'Dashboard terkunci — buka kunci dulu' })
      }
      if (wa.isReady()) {
        safeCb(cb, { ok: false, error: 'WhatsApp sudah terhubung' })
        return
      }
      await wa.restart()
      safeCb(cb, { ok: true })
    } catch (err) {
      safeCb(cb, { ok: false, error: (err as Error)?.message ?? 'Gagal meminta QR' })
    }
  })

  socket.on('logout', async (cb) => {
    try {
      if (!(await socketUnlocked(socket))) {
        return safeCb(cb, { ok: false, error: 'Dashboard terkunci — buka kunci dulu' })
      }
      await wa.logout()
      await logActivity('connection', 'warn', 'Logout sesi WhatsApp dari dashboard.')
      safeCb(cb, { ok: true })
    } catch (err) {
      safeCb(cb, { ok: false, error: (err as Error)?.message ?? 'Gagal logout' })
    }
  })

  socket.on('send-message', async (payload: { jid?: string; number?: string; text?: string } | null, cb) => {
    try {
      if (!(await socketUnlocked(socket))) {
        return safeCb(cb, { ok: false, error: 'Dashboard terkunci — buka kunci dulu' })
      }
      const jid = payload?.jid || (payload?.number ? normalizeToJid(payload.number) : null)
      const text = String(payload?.text ?? '').trim()
      if (!text) return safeCb(cb, { ok: false, error: 'Pesan kosong' })
      if (!wa.isReady()) return safeCb(cb, { ok: false, error: 'WhatsApp belum terhubung' })
      if (!jid) return safeCb(cb, { ok: false, error: 'Nomor tujuan tidak valid' })
      const result = await sendAndSave(jid, text, 'manual')
      if (!result) return safeCb(cb, { ok: false, error: 'Pesan terkirim namun gagal disimpan' })
      safeCb(cb, { ok: true, message: serializeMessage(result.saved) })
    } catch (err) {
      safeCb(cb, { ok: false, error: (err as Error)?.message ?? 'Gagal mengirim pesan' })
    }
  })

  socket.on('resume-ai', async (payload: { jid?: string } | null, cb) => {
    try {
      if (!(await socketUnlocked(socket))) {
        return safeCb(cb, { ok: false, error: 'Dashboard terkunci — buka kunci dulu' })
      }
      const jid = String(payload?.jid ?? '')
      if (!jid) return safeCb(cb, { ok: false, error: 'JID tidak valid' })
      const contact = await db.contact.findUnique({ where: { jid } })
      if (!contact) return safeCb(cb, { ok: false, error: 'Kontak tidak ditemukan' })
      const updated = await db.contact.update({ where: { id: contact.id }, data: { aiPausedUntil: null } })
      io.to('verified').emit('chat:update', { contact: serializeContact(updated) })
      await logActivity('ai_reply', 'success', `▶️ AI dilanjutkan utk +${updated.number} — jeda ambil alih dibatalkan`, { jid })
      safeCb(cb, { ok: true })
    } catch (err) {
      safeCb(cb, { ok: false, error: (err as Error)?.message ?? 'Gagal melanjutkan AI' })
    }
  })

  // Jeda AI manual dari dashboard (tanpa harus membalas manual dulu)
  socket.on(
    'pause-ai',
    async (payload: { jid?: string; minutes?: number } | null, cb) => {
      try {
        if (!(await socketUnlocked(socket))) {
          return safeCb(cb, { ok: false, error: 'Dashboard terkunci — buka kunci dulu' })
        }
        const jid = String(payload?.jid ?? '')
        if (!jid) return safeCb(cb, { ok: false, error: 'JID tidak valid' })
        if (isJidGroup(jid)) return safeCb(cb, { ok: false, error: 'AI tidak membalas di grup' })
        const settings = await db.aiSetting.findUnique({
          where: { id: 'main' },
          select: { handoverMinutes: true },
        })
        const fallback = settings?.handoverMinutes ?? 30
        const minutes = Math.max(5, Math.min(240, Math.round(Number(payload?.minutes) || fallback)))
        const contact = await db.contact.findUnique({ where: { jid } })
        if (!contact) return safeCb(cb, { ok: false, error: 'Kontak tidak ditemukan' })
        const until = new Date(Date.now() + minutes * 60_000)
        const updated = await db.contact.update({ where: { id: contact.id }, data: { aiPausedUntil: until } })
        io.to('verified').emit('chat:update', { contact: serializeContact(updated) })
        await logActivity(
          'ai_reply',
          'info',
          `⏸️ AI dijeda manual utk +${updated.number} — lanjut otomatis ${minutes} menit lagi`,
          { jid },
        )
        // Ringkasan otomatis juga dibuat saat jeda manual (konteks utk pemilik)
        void generateAndSaveSummary(contact.id, { force: false })
        safeCb(cb, { ok: true, minutes })
      } catch (err) {
        safeCb(cb, { ok: false, error: (err as Error)?.message ?? 'Gagal menjeda AI' })
      }
    },
  )

  socket.on('disconnect', () => {
    log.info({ id: socket.id }, 'dashboard terputus')
  })
})

// ---------------------------------------------------------------------------
// Scheduler broadcast promo
// ---------------------------------------------------------------------------
const g = globalThis as unknown as { __waServiceBooted?: boolean; __broadcastStop?: () => void }

function startBroadcast() {
  if (g.__broadcastStop) g.__broadcastStop()
  g.__broadcastStop = startBroadcastScheduler({
    io,
    isConnected: () => wa.isReady(),
    sendOne: async (jid, text) => {
      const result = await sendAndSave(jid, text, 'broadcast')
      return result !== null
    },
    log: (type, level, message, meta) => {
      void logActivity(type, level, message, meta)
    },
  })
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
if (!g.__waServiceBooted) {
  g.__waServiceBooted = true
  httpServer.listen(PORT, () => {
    log.info(`WA service berjalan di port ${PORT}`)
  })
  wa.start().catch((err) => {
    log.error({ err }, 'gagal start WhatsApp')
  })
  startBroadcast()
} else {
  // hot-reload (bun --watch) — pasang ulang scheduler tanpa dobel interval
  startBroadcast()
}

export { io, wa }
