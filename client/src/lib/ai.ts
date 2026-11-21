// AI encouragement (server: /api/ai). The AI key lives only on the server.
import { api } from '@/lib/api'

export type AiMessage = {
  type: 'thought' | 'daily' | 'weekly' | 'boost'
  refId: string
  date: string
  content: string
  source: 'ai' | 'fallback'
  createdAt: string
  /** Weekly reflection only: one short focus for next week (can be saved as next week's goal) */
  focus?: string | null
}

export type AiResponse = {
  message: AiMessage | null
  /** The person's words suggested they may be struggling: show support contacts, not AI text */
  showSupport: boolean
  /** Mood is 3 or lower today: the message ends with a gentle support reminder */
  lowMood: boolean
  limitReached: boolean
  usedToday: number
  limit: number
}

export type AiStatus = {
  enabled: boolean
  configured: boolean
  userEnabled: boolean
  mode: 'minimal' | 'full'
  usedToday: number
  limit: number
}

const again = (regenerate: boolean, hasQuery = false) => (regenerate ? `${hasQuery ? '&' : '?'}regenerate=true` : '')

export const aiRequests = {
  thought: (id: string) => (regenerate: boolean) => api.post<AiResponse>(`/ai/thought/${id}${again(regenerate)}`),
  daily: (date: string) => (regenerate: boolean) => api.post<AiResponse>(`/ai/daily/${date}${again(regenerate)}`),
  weekly: (weekEnding: string) => (regenerate: boolean) =>
    api.get<AiResponse>(`/ai/weekly?weekEnding=${weekEnding}${again(regenerate, true)}`),
  boost: () => (regenerate: boolean) => api.post<AiResponse>(`/ai/boost${again(regenerate)}`),
}
