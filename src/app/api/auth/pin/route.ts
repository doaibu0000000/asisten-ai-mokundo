import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { UNLOCK_COOKIE, UNLOCK_MAX_AGE, assertUnlocked, hashPin, isValidPin, unlockValue } from "@/lib/pin-auth"

export const runtime = "nodejs"

// Atur / ubah / nonaktifkan PIN — hanya boleh saat dashboard terbuka
export async function POST(req: NextRequest) {
  try {
    const locked = await assertUnlocked(req)
    if (locked) return locked

    const body = (await req.json().catch(() => ({}))) as { currentPin?: string; newPin?: string | null }
    const currentPin = typeof body.currentPin === "string" ? body.currentPin.trim() : ""
    const disable = body.newPin === null || body.newPin === ""

    const s = await db.aiSetting.findUnique({ where: { id: "main" }, select: { pinHash: true } })
    if (!s) return NextResponse.json({ error: "Pengaturan tidak ditemukan" }, { status: 404 })

    // Kalau sudah ada PIN, wajib masukkan PIN lama
    if (s.pinHash && hashPin(currentPin) !== s.pinHash) {
      return NextResponse.json({ error: "PIN lama salah" }, { status: 400 })
    }

    const res = NextResponse.json({ ok: true })

    if (disable) {
      await db.aiSetting.update({ where: { id: "main" }, data: { pinEnabled: false, pinHash: null } })
      await db.activityLog.create({
        data: { type: "settings", level: "warn", message: "PIN dashboard dinonaktifkan" },
      })
      res.cookies.set(UNLOCK_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 })
      return res
    }

    if (!isValidPin(body.newPin)) {
      return NextResponse.json({ error: "PIN baru harus 4-8 angka" }, { status: 400 })
    }

    const pinHash = hashPin(body.newPin)
    await db.aiSetting.update({ where: { id: "main" }, data: { pinEnabled: true, pinHash } })
    await db.activityLog.create({
      data: { type: "settings", level: "success", message: "PIN dashboard diatur/diubah — kunci aktif" },
    })
    // Sesi sekarang tetap terbuka dgn cookie baru
    res.cookies.set(UNLOCK_COOKIE, unlockValue(pinHash), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: UNLOCK_MAX_AGE,
    })
    return res
  } catch (error) {
    console.error("POST /api/auth/pin error:", error)
    return NextResponse.json({ error: "Gagal mengatur PIN" }, { status: 500 })
  }
}
