// The AI friend in the Thought log (server: /api/ai/friend). Nothing is sent to the AI unless the
// request says consent: true, which only happens after you tap "Talk to my AI friend".
import { api } from '@/lib/api'

export type FriendReply = {
  acknowledge: string
  perspectives: string[]
  strength: string
  smallStep: string
  closing: string
  at: string
  source: 'ai' | 'fallback'
  /** 👍 true / 👎 false, null until answered */
  helpful: boolean | null
}

export type FriendTurn = { role: 'user' | 'friend'; text: string; at: string; source?: 'ai' | 'fallback'; helpful?: boolean | null }

export type FriendConversation = { reply: FriendReply; messages: FriendTurn[]; includedContext: boolean }

export type FriendResponse = {
  conversation: FriendConversation | null
  /** Crisis words: show support contacts (the AI wasn't called) */
  showSupport: boolean
  supportMessage?: string
  limitReached: boolean
  messagesLeft: number
}

export type FriendState = { conversation: FriendConversation | null; isPrivate: boolean; messagesLeft: number }

export const friendApi = {
  get: (thoughtId: string) => api.get<FriendState>(`/ai/friend/${thoughtId}`),
  start: (thoughtId: string, includeContext: boolean) =>
    api.post<FriendResponse>(`/ai/friend/${thoughtId}`, { consent: true, includeContext }),
  send: (thoughtId: string, message: string) => api.post<FriendResponse>(`/ai/friend/${thoughtId}/messages`, { consent: true, message }),
  feedback: (thoughtId: string, target: 'reply' | number, helpful: boolean | null) =>
    api.put<{ conversation: FriendConversation; messagesLeft: number }>(`/ai/friend/${thoughtId}/feedback`, { target, helpful }),
}

// "Share this thought" in the explanation dialog is remembered on this device, so the dialog is
// only shown the first time. The small "Shares this thought with Gemini" line always stays.
const CONSENT_KEY = 'aiFriend.explained'

export function hasSeenFriendExplanation(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'yes'
  } catch {
    return false
  }
}

export function rememberFriendExplanation(): void {
  try {
    localStorage.setItem(CONSENT_KEY, 'yes')
  } catch {
    // Private browsing: the dialog simply shows again next time
  }
}

export const SUPPORT_LINE =
  "I'm really glad you wrote this down. This sounds like a lot to carry — please talk to someone right now. You deserve real support."
