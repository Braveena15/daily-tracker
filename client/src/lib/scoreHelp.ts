// What each score means, in plain words — matches server/src/utils/scores.ts (keep them in step).
export type ScoreKey = 'overall' | 'physical' | 'mental' | 'learning'

export const SCORE_HELP: Record<ScoreKey, { title: string; text: string }> = {
  overall: {
    title: 'Overall score',
    text: 'The average of your physical, mental and learning scores, from 0 to 100. Weekly figures average only the days you logged — days you skipped don’t pull it down.',
  },
  physical: {
    title: 'Physical score',
    text: 'From 0 to 100: workouts toward your goal (20), steps and active calories (15), nutrition (30), sleep (20) and time outdoors (15).',
  },
  mental: {
    title: 'Mental score',
    text: 'From 0 to 100: mental-strength activities (35), good things (20), a present-moment note (15), and the mood (20) and energy (10) from your check-ins.',
  },
  learning: {
    title: 'Learning score',
    text: 'From 0 to 100: learnings logged (50), time spent learning toward your goal (30), and a few words on what you learned (20).',
  },
}
