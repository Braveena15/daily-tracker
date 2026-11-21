// Which calm milestone notes have been reached (shown by components/progress/MilestoneNote.tsx).
import type { StreakResponse } from '@/lib/entries'
import type { JourneyResponse } from '@/lib/progress'

export type Milestone = { id: string; title: string; text: string }

/** Every reached milestone, most meaningful first (ids match server/src/utils/milestones.ts). */
export function reachedMilestones(journey: JourneyResponse, streak: StreakResponse): Milestone[] {
  const all: (Milestone & { reached: boolean })[] = [
    { id: 'journey-complete', reached: journey.complete, title: 'You completed your journey', text: `${journey.totalDays} days of looking after yourself. Take a moment to notice how far you've come.` },
    { id: 'journey-half', reached: journey.dayNumber * 2 >= journey.totalDays, title: 'Halfway through your journey', text: 'Half the journey done. Whatever the days looked like, you kept coming back.' },
    { id: 'streak-30', reached: streak.current >= 30, title: '30 days in a row', text: 'A month of steady check-ins. That rhythm is yours now.' },
    { id: 'logged-60', reached: journey.daysLogged >= 60, title: '60 days logged', text: 'Sixty days of noticing how you are. That takes real care.' },
    { id: 'streak-14', reached: streak.current >= 14, title: 'Two weeks in a row', text: 'Fourteen days without a gap. Rest days are still allowed — be kind to yourself.' },
    { id: 'logged-30', reached: journey.daysLogged >= 30, title: '30 days logged', text: 'A month of check-ins. Small, regular steps really add up.' },
    { id: 'streak-7', reached: streak.current >= 7, title: 'A week in a row', text: 'Seven days of checking in. A gentle habit is forming.' },
    { id: 'logged-7', reached: journey.daysLogged >= 7, title: 'Your first full week', text: "You've logged seven days. That's a lovely start." },
  ]
  return all.filter((m) => m.reached).map(({ id, title, text }) => ({ id, title, text }))
}
