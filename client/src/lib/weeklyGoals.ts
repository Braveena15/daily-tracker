// Weekly goals (server: /api/weekly-goals). "Next week" follows the Weekly review's weeks: the goal
// saved from the review ending on day E covers E+1..E+7. The text is encrypted on the server and
// never sent to the AI.
import { api } from '@/lib/api'

export type WeeklyGoal = {
  id: string
  weekStart: string
  weekEnd: string
  text: string
  source: 'ai' | 'edited' | 'typed'
  done: boolean
  doneAt: string | null
}

export type WeeklyGoalsResponse = {
  /** The goal for the review week ending on `weekEnding` (running on its last day) */
  current: WeeklyGoal | null
  /** The goal for the week after it */
  next: WeeklyGoal | null
  nextWeek: { weekStart: string; weekEnd: string }
  /** Why next week's goal can't be set from this review, or null */
  nextProblem: string | null
}

export const GOAL_TEXT_MAX = 200

export const goalsApi = {
  get: (weekEnding: string) => api.get<WeeklyGoalsResponse>(`/weekly-goals?weekEnding=${weekEnding}`),
  save: (body: { weekEnding: string; text: string; source: WeeklyGoal['source']; replace: boolean }) =>
    api.put<{ goal: WeeklyGoal }>('/weekly-goals', body),
  setDone: (id: string, done: boolean) => api.patch<{ goal: WeeklyGoal }>(`/weekly-goals/${id}`, { done }),
}
