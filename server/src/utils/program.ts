// Transformation programs: the day maths, as pure functions so the rules are easy to test.
// Every date is a "YYYY-MM-DD" calendar day in Asia/Colombo (see utils/dates.ts).
import { addDays, daysBetween } from "./dates";

export const PROGRAM_STATUSES = ["active", "completed", "ended_early", "abandoned"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];
export const PROGRAM_LENGTH = { min: 7, max: 365 } as const;
export const PROGRAM_PRESETS = [30, 60, 90, 100] as const;
/** How long "Undo ending" stays available after ending early */
export const UNDO_END_MS = 24 * 60 * 60 * 1000;

/** The last day of the program (day `lengthDays`). */
export const plannedEndDate = (startDate: string, lengthDays: number): string => addDays(startDate, lengthDays - 1);

export type ProgramClock = {
  /** 1 on the start date; 0 before it starts; never above lengthDays */
  dayNumber: number;
  /** lengthDays on day 1, 1 on the last day, 0 once it's over */
  daysLeft: number;
  /** Days until it starts (0 once it has) */
  startsIn: number;
  plannedEndDate: string;
  /** "upcoming" (starts later) · "running" · "finished" (past its last day) */
  phase: "upcoming" | "running" | "finished";
  percent: number;
};

/**
 * Where a program stands on `today`. dayNumber = days since start + 1;
 * daysLeft = lengthDays − (dayNumber − 1). Day 1 → "100 days left", the last day → "1 day left".
 */
export function programClock(startDate: string, lengthDays: number, today: string): ProgramClock {
  const elapsed = daysBetween(startDate, today) + 1;
  const end = plannedEndDate(startDate, lengthDays);
  if (elapsed < 1) {
    return { dayNumber: 0, daysLeft: lengthDays, startsIn: 1 - elapsed, plannedEndDate: end, phase: "upcoming", percent: 0 };
  }
  if (elapsed > lengthDays) {
    return { dayNumber: lengthDays, daysLeft: 0, startsIn: 0, plannedEndDate: end, phase: "finished", percent: 100 };
  }
  return {
    dayNumber: elapsed,
    daysLeft: lengthDays - (elapsed - 1),
    startsIn: 0,
    plannedEndDate: end,
    phase: "running",
    percent: Math.round(((elapsed - 1) / lengthDays) * 100),
  };
}

/** The date of day N of a program. */
export const dateOfDay = (startDate: string, day: number): string => addDays(startDate, day - 1);

type Endable = { status: ProgramStatus; startDate: string; lengthDays: number; endedOnDay?: number | null };

/**
 * The days a report covers: day 1 up to the day it ended (ended early), its last day (completed),
 * or today (a live preview of an active program). `days` is the number of days completed.
 */
export function reportRange(p: Endable, today: string): { from: string; to: string; days: number; partial: boolean } {
  const from = p.startDate;
  if (p.status === "ended_early" && p.endedOnDay) {
    return { from, to: dateOfDay(from, p.endedOnDay), days: p.endedOnDay, partial: true };
  }
  const clock = programClock(p.startDate, p.lengthDays, today);
  if (p.status === "active" && clock.phase !== "finished") {
    const days = Math.max(0, clock.dayNumber);
    return { from, to: days ? dateOfDay(from, days) : from, days, partial: true };
  }
  return { from, to: plannedEndDate(p.startDate, p.lengthDays), days: p.lengthDays, partial: false };
}

/** Days logged ÷ days completed (not ÷ the program length), 0–100. */
export function consistencyPercent(loggedDays: number, daysCompleted: number): number {
  if (daysCompleted <= 0) return 0;
  return Math.round((Math.min(loggedDays, daysCompleted) / daysCompleted) * 100);
}

export type ProgramWeek = { week: number; from: string; to: string; days: number; partial: boolean };

/** Program weeks (days 1–7, 8–14, …) up to `daysCompleted`; a last week with fewer than 7 days is partial. */
export function programWeeks(startDate: string, daysCompleted: number): ProgramWeek[] {
  const weeks: ProgramWeek[] = [];
  for (let first = 1; first <= daysCompleted; first += 7) {
    const last = Math.min(first + 6, daysCompleted);
    weeks.push({ week: weeks.length + 1, from: dateOfDay(startDate, first), to: dateOfDay(startDate, last), days: last - first + 1, partial: last - first + 1 < 7 });
  }
  return weeks;
}

/** "Week 3 of 15" for a date inside the program (null outside it). */
export function weekOfProgram(startDate: string, lengthDays: number, date: string): { week: number; of: number } | null {
  const day = daysBetween(startDate, date) + 1;
  if (day < 1 || day > lengthDays) return null;
  return { week: Math.ceil(day / 7), of: Math.ceil(lengthDays / 7) };
}

/** Which check-in is offered today: midpoint from day ⌈length/2⌉, final from the last day on. */
export function dueCheckIn(
  p: { status: ProgramStatus; startDate: string; lengthDays: number; midpointDone: boolean; finalDone: boolean },
  today: string,
): "midpoint" | "final" | null {
  if (p.status !== "active" && p.status !== "completed") return null;
  const elapsed = daysBetween(p.startDate, today) + 1;
  if (elapsed >= p.lengthDays) return p.finalDone ? null : "final";
  if (elapsed >= Math.ceil(p.lengthDays / 2) && !p.midpointDone) return "midpoint";
  return null;
}

/** "Undo ending" is offered for 24 hours after ending early. */
export function canUndoEnd(p: { status: ProgramStatus; endedAt?: Date | null }, now: Date = new Date()): boolean {
  return p.status === "ended_early" && !!p.endedAt && now.getTime() - new Date(p.endedAt).getTime() < UNDO_END_MS;
}

/**
 * How far from `start` toward `goal` the `latest` value got, 0–100 (it can't go below 0 or above
 * 100). Null when there's no goal, no change is wanted, or a value is missing.
 */
export function progressTowardGoal(start: number | null | undefined, goal: number | null | undefined, latest: number | null | undefined): number | null {
  if (start == null || goal == null || latest == null || start === goal) return null;
  const pct = ((latest - start) / (goal - start)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}

/** Rounded change from before to after (null when either is missing). */
export function change(before: number | null | undefined, after: number | null | undefined, digits = 1): number | null {
  if (before == null || after == null) return null;
  const f = 10 ** digits;
  return Math.round((after - before) * f) / f;
}
