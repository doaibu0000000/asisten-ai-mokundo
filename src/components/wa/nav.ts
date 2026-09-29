import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  Megaphone,
  QrCode,
  ScrollText,
  Settings,
} from "lucide-react"

export type ActiveView =
  | "dashboard"
  | "koneksi"
  | "broadcast"
  | "laporan"
  | "simulator"
  | "pengaturan"
  | "knowledge"
  | "log"

export interface NavItem {
  id: ActiveView
  label: string
  icon: LucideIcon
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Ringkasan performa asisten AI",
  },
  {
    id: "koneksi",
    label: "Koneksi WhatsApp",
    icon: QrCode,
    description: "Scan QR untuk menghubungkan nomor",
  },
  {
    id: "broadcast",
    label: "Broadcast Promo",
    icon: Megaphone,
    description: "Kirim promo massal ke klien",
  },
  {
    id: "laporan",
    label: "Laporan & Analitik",
    icon: BarChart3,
    description: "Statistik, tren & performa bisnis",
  },
  {
    id: "simulator",
    label: "Simulator",
    icon: FlaskConical,
    description: "Uji kecerdasan balasan AI",
  },
  {
    id: "knowledge",
    label: "Basis Pengetahuan",
    icon: BookOpen,
    description: "Layanan, harga, dan FAQ",
  },
  {
    id: "pengaturan",
    label: "Pengaturan",
    icon: Settings,
    description: "Konfigurasi asisten & pesan",
  },
  {
    id: "log",
    label: "Log Aktivitas",
    icon: ScrollText,
    description: "Riwayat kejadian sistem",
  },
]
