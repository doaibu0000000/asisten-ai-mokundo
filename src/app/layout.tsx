import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/wa/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mukundo AI — Asisten WhatsApp",
  description:
    "Dashboard Asisten AI WhatsApp untuk Mukundo Teknologi Indonesia — jasa teknik serba bisa: AC, kelistrikan PLN, cor jalan & bangun rumah, servis HP/laptop, mesin. Kalijati, Subang. Buka 24 jam.",
  keywords: ["Mukundo Teknologi", "Asisten AI", "WhatsApp", "Servis AC", "Kelistrikan PLN", "Subang"],
  authors: [{ name: "Mukundo Teknologi Indonesia" }],
  openGraph: {
    title: "Mukundo AI — Asisten WhatsApp",
    description: "Pantau & atur asisten AI yang membalas chat WhatsApp klien secara otomatis.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#022c22" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
