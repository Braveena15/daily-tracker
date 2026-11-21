// The rules for weekly goals, as pure functions (tested in weeklyGoals.test.ts).
import { addDays } from "./dates";

export type GoalWeek = { weekStart: string; weekEnd: string };

/** The week after a review week: a review ending E covers E-6..E, so "next week" is E+1..E+7. */
export function nextGoalWeek(weekEnding: string): GoalWeek {
  return { weekStart: addDays(weekEnding, 1), weekEnd: addDays(weekEnding, 7) };
}

/** Whether two weeks share at least one day. */
export function overlaps(a: GoalWeek, b: GoalWeek): boolean {
  return a.weekStart <= b.weekEnd && b.weekStart <= a.weekEnd;
}

/**
 * Why a goal can't be set for the week after `weekEnding`, or null if it can:
 * the reviewed week must have started on or after the journey start (or contain it), and the goal
 * week must not be over already.
 */
export function goalWeekProblem(weekEnding: string, journeyStart: string, today: string): string | null {
  if (weekEnding < journeyStart) return "That week was before your journey started.";
  if (weekEnding > today) return "That week hasn't happened yet.";
  if (nextGoalWeek(weekEnding).weekEnd < today) return "That week is already over — set a goal from a more recent review.";
  return null;
}
