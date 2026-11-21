// The milestone notes the Dashboard can show (calm, one at a time). Only these ids can be stored
// as dismissed. The client decides which are reached; the server only remembers which were closed.
export const MILESTONE_IDS = [
  "logged-7",
  "logged-30",
  "logged-60",
  "streak-7",
  "streak-14",
  "streak-30",
  "journey-half",
  "journey-complete",
] as const;

export type MilestoneId = (typeof MILESTONE_IDS)[number];
