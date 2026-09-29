// Manajer koneksi WhatsApp (Baileys) — QR login, reconnect, kirim pesan, presence
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  isJidGroup,
  type WASocket,
  type WAMessage,
  type Contact,
  type BaileysEventMap,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import pino from 'pino'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, 'auth')
const logger = pino({ level: 'silent' })

export type WaStatus = 'disconnected' | 'connecting' | 'waiting_scan' | 'connected'

export interface OwnerInfo {
  name: string
  number: string
  jid: string
}

export interface StatusObj {
  status: WaStatus
  owner: OwnerInfo | null
  connectedAt: string | null
  reason: string | null
}

export interface MessageEvent {
  waMsg: WAMessage
  upsertType: string
}

export interface WaHandlers {
  onStatus: (s: StatusObj) => void
  onQr: (qrDataUrl: string, attempt: number) => void
  onMessage: (ev: MessageEvent) => void
  onReconnecting: (info: string) => void
  onPairingCode: (code: string, number: string) => void
}

const RECONNECT_DELAYS = [1500, 3000, 6000, 12000, 30000]

export class WaManager {
  private sock: WASocket | null = null
  private _status: WaStatus = 'disconnected'
  private _owner: OwnerInfo | null = null
  private _connectedAt: Date | null = null
  private _reason: string | null = null
  private _starting = false
  private _stopped = true
  private _logoutRequested = false
  private _restarting = false
  private _reconnectAttempts = 0
  private _qrCount = 0
  private _reconnectTimer: NodeJS.Timeout | null = null
  private _pairingRequested: string | null = null // nomor HP yang menunggu kode pairing
  private _pairingCodeSent = false

  latestQr: string | null = null
  latestPairing: { code: string; number: string } | null = null

  constructor(private handlers: WaHandlers) {}

  getStatus(): StatusObj {
    return {
      status: this._status,
      owner: this._owner,
      connectedAt: this._connectedAt ? this._connectedAt.toISOString() : null,
      reason: this._reason,
    }
  }

  isReady(): boolean {
    return this._status === 'connected' && this.sock !== null
  }

  getSock(): WASocket | null {
    return this.sock
  }

  private setStatus(s: WaStatus, reason: string | null = null) {
    this._status = s
    this._reason = reason
    this.handlers.onStatus(this.getStatus())
  }

  hasSession(): boolean {
    try {
      return fs.existsSync(path.join(AUTH_DIR, 'creds.json'))
    } catch {
      return false
    }
  }

  async start(): Promise<void> {
    if (this._starting || this.isReady()) return
    this._starting = true
    this._stopped = false
    this._logoutRequested = false
    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
      let version: Uint8Array | undefined
      try {
        const v = await fetchLatestBaileysVersion()
        // WAVersion [number, number, number] kompatibel dengan Uint8Array pada runtime
        version = v.version as unknown as Uint8Array
      } catch {
        // fallback: pakai default bawaan baileys
      }
      const sock = makeWASocket({
        version: version as unknown as [number, number, number] | undefined,
        auth: state,
        logger,
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        browser: ['Mukundo AI', 'Chrome', '1.0.0'],
      })
      this.sock = sock
      sock.ev.on('creds.update', saveCreds)
      sock.ev.on('connection.update', (u) => this.handleConnectionUpdate(u))
      sock.ev.on('messages.upsert', (u: BaileysEventMap['messages.upsert']) => {
        if (u.type !== 'notify' && u.type !== 'append') return
        for (const m of u.messages) {
          try {
            this.handlers.onMessage({ waMsg: m, upsertType: u.type })
          } catch (err) {
            logger.error({ err }, 'handler pesan error')
          }
        }
      })
      if (this._status !== 'waiting_scan') {
        this.setStatus('connecting', this.hasSession() ? 'Menyambungkan ulang sesi WhatsApp...' : 'Menyiapkan QR...')
      }
    } catch (err) {
      this._starting = false
      logger.error({ err }, 'gagal start')
      this.scheduleReconnect(String((err as Error)?.message || err))
    } finally {
      this._starting = false
    }
  }

  /** Paksa mulai ulang koneksi (mis. minta QR baru dari dashboard) */
  async restart(): Promise<void> {
    if (this._restarting) return
    this._restarting = true
    this.latestQr = null
    this.latestPairing = null
    this._pairingCodeSent = false
    this._stopped = false
    this._logoutRequested = false
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    try {
      this.sock?.end?.(new Error('restart diminta'))
    } catch {
      /* abaikan */
    }
    this.sock = null
    this._owner = null
    this.setStatus('connecting', 'Meminta QR baru...')
    await new Promise((r) => setTimeout(r, 600))
    this._restarting = false
    await this.start()
  }

  /** Logout: putuskan & hapus sesi tersimpan */
  async logout(): Promise<void> {
    this._logoutRequested = true
    this._stopped = true
    this._pairingRequested = null
    this._pairingCodeSent = false
    this.latestPairing = null
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    try {
      await this.sock?.logout()
    } catch {
      // sudah tertutup — lanjut bersihkan auth
    }
    this.sock = null
    this.clearAuth()
    this.latestQr = null
    this._owner = null
    this._connectedAt = null
    this._qrCount = 0
    this.setStatus('disconnected', 'Logout berhasil. Sesi dihapus, silakan scan QR baru.')
  }

  /** Minta kode pairing (login via nomor HP tanpa scan QR) */
  async requestPairing(number: string): Promise<{ ok: boolean; code?: string; error?: string }> {
    try {
      if (this.isReady()) {
        return { ok: false, error: 'WhatsApp sudah terhubung — tidak perlu kode pairing' }
      }
      // Socket aktif & sudah handshake (QR pernah muncul) → langsung minta kode
      if (this.sock && this.latestQr) {
        const code = await this.sock.requestPairingCode(number)
        this.latestPairing = { code, number }
        this.handlers.onPairingCode(code, number)
        return { ok: true, code }
      }
      // Socket belum siap → simpan permintaan, kode diminta otomatis saat socket open (event QR)
      this._pairingRequested = number
      this._pairingCodeSent = false
      if (!this._starting && !this.sock) {
        await this.restart()
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error)?.message ?? 'Gagal meminta kode pairing' }
    }
  }

  /** Hapus kode pairing aktif (dashboard minta kode baru) */
  clearPairing(): void {
    this.latestPairing = null
    this._pairingRequested = null
    this._pairingCodeSent = false
  }

  /** Dipanggil internal saat socket siap (QR event) → penuhi permintaan pairing tertunda */
  private async fulfillPairingRequest(): Promise<void> {
    if (!this._pairingRequested || this._pairingCodeSent || !this.sock) return
    this._pairingCodeSent = true
    try {
      const code = await this.sock.requestPairingCode(this._pairingRequested)
      this.latestPairing = { code, number: this._pairingRequested }
      this.handlers.onPairingCode(code, this._pairingRequested)
    } catch (err) {
      logger.error({ err }, 'gagal meminta kode pairing')
      this._pairingCodeSent = false // izinkan retry saat QR berikutnya
    }
  }

  async sendMessage(jid: string, text: string): Promise<string | null> {
    if (!this.isReady() || !this.sock) {
      throw new Error('WhatsApp belum terhubung')
    }
    const sent = await this.sock.sendMessage(jid, { text })
    return sent?.key?.id ?? null
  }

  async sendTyping(jid: string, typing: boolean): Promise<void> {
    try {
      if (isJidGroup(jid)) return
      await this.sock?.sendPresenceUpdate(typing ? 'composing' : 'paused', jid)
    } catch {
      /* abaikan */
    }
  }

  private clearAuth() {
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true })
    } catch {
      /* abaikan */
    }
  }

  private scheduleReconnect(reason: string) {
    if (this._stopped || this._logoutRequested || this._restarting) return
    const delay = RECONNECT_DELAYS[Math.min(this._reconnectAttempts, RECONNECT_DELAYS.length - 1)] ?? 30_000
    this._reconnectAttempts++
    this.handlers.onReconnecting(`${reason} Menyambung ulang dalam ${Math.round(delay / 1000)}s...`)
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer)
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null
      this.start()
    }, delay)
  }

  private handleConnectionUpdate(
    u: Partial<{
      connection: 'connecting' | 'open' | 'close' | undefined
      qr: string | undefined
      lastDisconnect: { error: unknown } | undefined
      receivedPendingNotifications: boolean | undefined
    }>,
  ) {
    const { connection, qr, lastDisconnect } = u

    if (qr) {
      this._qrCount++
      // Socket sudah handshake → penuhi permintaan kode pairing yang tertunda
      void this.fulfillPairingRequest()
      QRCode.toDataURL(qr, {
        margin: 2,
        width: 512,
        color: { dark: '#052e23', light: '#ffffff' },
      })
        .then((url) => {
          this.latestQr = url
          if (this._status !== 'connected') this.setStatus('waiting_scan', 'Menunggu scan QR...')
          this.handlers.onQr(url, this._qrCount)
        })
        .catch(() => {
          /* abaikan */
        })
      return
    }

    if (connection === 'open') {
      this.latestQr = null
      this.latestPairing = null
      this._pairingRequested = null
      this._pairingCodeSent = false
      this._qrCount = 0
      this._reconnectAttempts = 0
      this._connectedAt = new Date()
      const user = (this.sock as unknown as { user?: Contact })?.user
      this._owner = user
        ? {
            jid: String(user.id ?? ''),
            name: user.name || user.verifiedName || 'Pemilik',
            number: ((String(user.id ?? '').split(':')[0] ?? '').split('@')[0] ?? ''),
          }
        : null
      this.setStatus('connected', null)
      return
    }

    if (connection === 'connecting') {
      if (this._status !== 'waiting_scan' && this._status !== 'connected') {
        this.setStatus('connecting', 'Menyambungkan...')
      }
      return
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
      // restart oleh sendiri (tombol request-qr)
      if (this._restarting) return
      this.sock = null
      this._owner = null

      if (this._logoutRequested || this._stopped) {
        this.setStatus('disconnected', 'Koneksi ditutup.')
        return
      }

      if (code === DisconnectReason.loggedOut || code === 440) {
        this.clearAuth()
        this.latestQr = null
        this._qrCount = 0
        this._connectedAt = null
        this.setStatus(
          'disconnected',
          code === 440
            ? 'Sesi digantikan (perangkat lain login). Silakan mulai koneksi & scan ulang QR.'
            : 'Anda keluar dari WhatsApp di HP / perangkat ditautkan di tempat lain. Silakan scan QR ulang.',
        )
        return
      }

      // QR kedaluwarsa (515) → reconnect cepat untuk QR baru
      this.latestQr = null
      this._connectedAt = null
      this.scheduleReconnect(
        code === DisconnectReason.restartRequired ? 'QR kedaluwarsa.' : `Koneksi terputus (kode ${code ?? '-'}).`,
      )
    }
  }
}
