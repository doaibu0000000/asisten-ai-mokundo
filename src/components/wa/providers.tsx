"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import { ThemeProvider } from "next-themes"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SocketProvider } from "@/components/wa/socket-provider"
import { Toaster } from "@/components/ui/sonner"

const emptySubscribe = () => () => {}

export function AppProviders({ children }: { children: ReactNode }) {
  // Toaster dirender setelah mount — sonner menghitung offset berbasis lebar
  // layar sehingga bisa memicu hydration mismatch bila dirender saat SSR
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SocketProvider>
          {children}
          {mounted && <Toaster position="top-right" richColors closeButton />}
        </SocketProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
