// Ringkasan Chat AI — MIRROR dari src/lib/summary-prompt.ts di dashboard.
// Ringkasan dibuat UNTUK PEMILIK usaha (internal) — konteks cepat saat ambil alih chat.
// Jika prompt/parser berubah, ubah kedua file agar konsisten.
import ZAI from 'z-ai-web-dev-sdk'
import {
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryTranscript,
  parseSummaryResult,
  type SummaryResult,
  type SummaryTranscriptLine,
} from './summary-prompt-core'
import { AI_MODEL } from './ai'

export type { SummaryResult, SummaryTranscriptLine }

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

/** Generate ringkasan percakapan via LLM */
export async function generateChatSummary(lines: SummaryTranscriptLine[]): Promise<SummaryResult> {
  const zai = await getZAI()
  const completion = await zai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'assistant', content: SUMMARY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Berikut transkrip percakapannya (urut dari paling lama):\n\n${buildSummaryTranscript(lines)}`,
      },
    ],
    thinking: { type: 'disabled' },
  })
  const raw = completion.choices[0]?.message?.content?.trim()
  if (!raw) throw new Error('Ringkasan AI kosong')
  return parseSummaryResult(raw)
}
