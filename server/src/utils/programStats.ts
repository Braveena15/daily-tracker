// Program numbers from day rows: weekly progress, daily-plan targets hit, habit consistency and
// totals. Pure, so the rules are easy to test. Only the days passed in are counted: for a program
// ended early on day N, the caller passes days 1..N only. Unlogged days are "not logged", never 0.
import { calculateStreaks } from "./streaks";
import { consistencyPercent, programWeeks } from "./program";

export type ProgramDayRow = {
  date: string;
  /** A real check-in that day (habit ticks or water alone don't count) */
  logged: boolean;
  overall: number | null;
  physical: number | null;
  mental: number | null;
  learning: number | null;
  avgMood: number | null;
  workouts: number;
  learningMinutes: number;
  waterMl: number;
  sleepHours: number | null;
  weightKg: number | null;
  eatenKcal: number | null;
  habitsDone: string[];
};

export type ProgramPlan = {
  waterMl?: number | null;
  calorieTarget?: number | null;
  sleepHours?: number | null;
  workoutsPerWeek?: number | null;
  learningMinutes?: number | null;
  customHabits?: { id: string; label: string }[];
};

export type TargetKey = "water" | "calories" | "sleep" | "workout" | "learning";

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (values: (number | null)[]): number | null => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? round1(present.reduce((s, v) => s + v, 0) / present.length) : null;
};

/**
 * Which of the daily-plan targets a day hit. A target that isn't set is left out; a day with
 * nothing logged for it hasn't hit it. Calories: meals logged and at most the target.
 * Workouts are weekly, so a day "hits" it by having a workout.
 */
export function targetsHit(day: ProgramDayRow, plan: ProgramPlan): Partial<Record<TargetKey, boolean>> {
  const hit: Partial<Record<TargetKey, boolean>> = {};
  if (plan.waterMl) hit.water = day.waterMl >= plan.waterMl;
  if (plan.calorieTarget) hit.calories = day.eatenKcal !== null && day.eatenKcal > 0 && day.eatenKcal <= plan.calorieTarget;
  if (plan.sleepHours) hit.sleep = day.sleepHours !== null && day.sleepHours >= plan.sleepHours;
  if (plan.workoutsPerWeek) hit.workout = day.workouts > 0;
  if (plan.learningMinutes) hit.learning = day.learningMinutes >= plan.learningMinutes;
  return hit;
}

export function programStats(input: { startDate: string; days: ProgramDayRow[]; plan: ProgramPlan; daysCompleted: number }) {
  const { startDate, plan, daysCompleted } = input;
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
  const logged = days.filter((d) => d.logged);

  const weeks = programWeeks(startDate, daysCompleted).map((w) => {
    const inWeek = days.filter((d) => d.date >= w.from && d.date <= w.to);
    const weekLogged = inWeek.filter((d) => d.logged);
    const weights = inWeek.filter((d) => d.weightKg !== null);
    const workouts = inWeek.reduce((s, d) => s + d.workouts, 0);
    const hits = inWeek.map((d) => targetsHit(d, plan));
    const dailyHits = hits.reduce((s, h) => s + Object.entries(h).filter(([k, v]) => k !== "workout" && v).length, 0);
    const dailyPossible = hits.reduce((s, h) => s + Object.keys(h).filter((k) => k !== "workout").length, 0);
    return {
      ...w,
      daysLogged: weekLogged.length,
      avgOverall: avg(weekLogged.map((d) => d.overall)),
      avgMood: avg(weekLogged.map((d) => d.avgMood)),
      workouts,
      workoutsTargetMet: plan.workoutsPerWeek ? workouts >= Math.ceil((plan.workoutsPerWeek * w.days) / 7) : null,
      learningMinutes: inWeek.reduce((s, d) => s + d.learningMinutes, 0),
      avgSleep: avg(inWeek.map((d) => d.sleepHours)),
      weightKg: weights.at(-1)?.weightKg ?? null,
      targetsHit: dailyHits,
      targetsPossible: dailyPossible,
    };
  });

  const habits = (plan.customHabits ?? []).map((h) => {
    const done = days.filter((d) => d.habitsDone.includes(h.id)).length;
    return { id: h.id, label: h.label, daysDone: done, percent: consistencyPercent(done, daysCompleted) };
  });

  // Best week: the highest average overall score, among weeks with at least 3 logged days
  const best = weeks.filter((w) => w.daysLogged >= 3 && w.avgOverall !== null).sort((a, b) => b.avgOverall! - a.avgOverall!)[0] ?? null;
  const lastDay = days.at(-1)?.date ?? startDate;
  const streaks = calculateStreaks(logged.map((d) => d.date), lastDay);
  const weights = days.filter((d) => d.weightKg !== null);

  return {
    daysCompleted,
    daysLogged: logged.length,
    consistency: consistencyPercent(logged.length, daysCompleted),
    totals: {
      workouts: days.reduce((s, d) => s + d.workouts, 0),
      learningHours: round1(days.reduce((s, d) => s + d.learningMinutes, 0) / 60),
      waterLitres: round1(days.reduce((s, d) => s + d.waterMl, 0) / 1000),
      avgSleep: avg(days.map((d) => d.sleepHours)),
      avgMood: avg(logged.map((d) => d.avgMood)),
      avgOverall: avg(logged.map((d) => d.overall)),
    },
    streaks: { longest: streaks.longest, current: streaks.current },
    bestWeek: best ? { week: best.week, avgOverall: best.avgOverall, partial: best.partial } : null,
    latestWeightKg: weights.at(-1)?.weightKg ?? null,
    weeks,
    habits,
    /** Per day: which daily-plan targets were hit (for the Weekly review grid) */
    targetDays: days.map((d) => ({ date: d.date, logged: d.logged, hit: targetsHit(d, plan) })),

  };
}
