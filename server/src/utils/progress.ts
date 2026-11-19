// Pure functions for the progress pages: weight trend, journey progress and the weekly review.
import { KCAL_PER_KG, movingAverage } from "./calories";
import { addDays, daysBetween, listDates } from "./dates";

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Weight ----------

export type WeightPoint = { date: string; weightKg: number | null; averageKg: number | null };

/**
 * One point per day from `from` to `to`, with the day's weight (or null) and the 7-day
 * moving average. The average smooths out day-to-day noise (water, salt, timing) so the
 * real trend is easier to see; it skips days with no weigh-in.
 */
export function weightSeries(weights: Map<string, number>, from: string, to: string): WeightPoint[] {
  const dates = listDates(from, to);
  const values = dates.map((d) => weights.get(d) ?? null);
  const averages = movingAverage(values, 7);
  return dates.map((date, i) => ({
    date,
    weightKg: values[i] ?? null,
    averageKg: averages[i] == null ? null : round2(averages[i]!),
  }));
}

/**
 * Average change per week over the last 4 weeks, from the moving average (not raw weights):
 * (latest average − average 28 days earlier) ÷ 4. Null if either end has no average.
 */
export function weeklyChangeFromAverage(series: WeightPoint[]): number | null {
  const last = [...series].reverse().find((p) => p.averageKg !== null);
  if (!last) return null;
  const earlierDate = addDays(last.date, -28);
  const earlier = series.find((p) => p.date === earlierDate);
  if (!earlier || earlier.averageKg === null) return null;
  return round2((last.averageKg! - earlier.averageKg) / 4);
}

/** Latest weight minus the first weight on or after the journey start. Null without both. */
export function changeSinceStart(weights: { date: string; weightKg: number }[], journeyStart: string): number | null {
  const sorted = [...weights].filter((w) => w.date >= journeyStart).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  return round1(sorted[sorted.length - 1]!.weightKg - sorted[0]!.weightKg);
}

/**
 * Expected weekly change from the calorie plan: eating (target − TDEE) kcal a day for a week,
 * at about 7700 kcal per kg. Negative means losing. Uses the real target, which may have been
 * raised to the safe minimum, so it can be gentler than the chosen weekly goal.
 */
export function expectedWeeklyChange(calorieTarget: number, tdee: number): number {
  return round2(((calorieTarget - tdee) * 7) / KCAL_PER_KG);
}

// ---------- Journey ----------

export type JourneyProgress = {
  startDate: string;
  endDate: string;
  dayNumber: number;
  totalDays: number;
  daysLogged: number;
  percentComplete: number;
  complete: boolean;
};

/** "Day X of 100": today's day number in the journey and how many of those days were logged. */
export function journeyProgress(input: {
  startDate: string;
  lengthDays: number;
  today: string;
  loggedDates: string[];
}): JourneyProgress {
  const { startDate, lengthDays, today, loggedDates } = input;
  const endDate = addDays(startDate, lengthDays - 1);
  const elapsed = daysBetween(startDate, today) + 1; // day 1 is the start date
  const dayNumber = Math.min(Math.max(elapsed, 0), lengthDays);
  const daysLogged = new Set(loggedDates.filter((d) => d >= startDate && d <= today && d <= endDate)).size;

  return {
    startDate,
    endDate,
    dayNumber,
    totalDays: lengthDays,
    daysLogged,
    percentComplete: Math.round((dayNumber / lengthDays) * 100),
    complete: elapsed > lengthDays,
  };
}

// ---------- Weekly review ----------

/** One day's numbers for the review. Scores are null on days without a check-in. */
export type ReviewDay = {
  date: string;
  physical: number | null;
  mental: number | null;
  learning: number | null;
  overall: number | null;
  mood: number | null;
  workouts: number;
  workoutMinutes: number;
  learningMinutes: number;
  /** Null when no meals were logged that day */
  kcal: number | null;
};

export type WeekSummary = {
  from: string;
  to: string;
  daysLogged: number;
  avgPhysical: number | null;
  avgMental: number | null;
  avgLearning: number | null;
  avgOverall: number | null;
  avgMood: number | null;
  workouts: number;
  workoutMinutes: number;
  learningMinutes: number;
  avgKcal: number | null;
  mealDays: number;
  bestDay: { date: string; overall: number } | null;
};

function avg(values: (number | null)[], round: (n: number) => number = Math.round): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : round(present.reduce((s, v) => s + v, 0) / present.length);
}

/** Averages only count days that were logged, so a missed day doesn't look like a bad day. */
export function summariseWeek(days: ReviewDay[], from: string, to: string): WeekSummary {
  const best = days
    .filter((d): d is ReviewDay & { overall: number } => d.overall !== null)
    .sort((a, b) => b.overall - a.overall || a.date.localeCompare(b.date))[0];

  return {
    from,
    to,
    daysLogged: days.filter((d) => d.overall !== null).length,
    avgPhysical: avg(days.map((d) => d.physical)),
    avgMental: avg(days.map((d) => d.mental)),
    avgLearning: avg(days.map((d) => d.learning)),
    avgOverall: avg(days.map((d) => d.overall)),
    avgMood: avg(days.map((d) => d.mood), round1),
    workouts: days.reduce((s, d) => s + d.workouts, 0),
    workoutMinutes: days.reduce((s, d) => s + d.workoutMinutes, 0),
    learningMinutes: days.reduce((s, d) => s + d.learningMinutes, 0),
    avgKcal: avg(days.map((d) => d.kcal)),
    mealDays: days.filter((d) => d.kcal !== null).length,
    bestDay: best ? { date: best.date, overall: best.overall } : null,
  };
}

const COMPARED = [
  "daysLogged",
  "avgPhysical",
  "avgMental",
  "avgLearning",
  "avgOverall",
  "avgMood",
  "workouts",
  "workoutMinutes",
  "learningMinutes",
  "avgKcal",
] as const;
export type Compared = (typeof COMPARED)[number];

/** This week minus last week for each number (null when either week has no value). */
export function weekDifferences(current: WeekSummary, previous: WeekSummary): Record<Compared, number | null> {
  return Object.fromEntries(
    COMPARED.map((key) => {
      const a = current[key];
      const b = previous[key];
      return [key, a === null || b === null ? null : key === "avgMood" ? round1(a - b) : a - b];
    }),
  ) as Record<Compared, number | null>;
}

/**
 * One encouraging sentence picked from the week's data, most noteworthy first.
 * Never critical: when nothing went up, it finds something to appreciate instead.
 */
export function encouragement(current: WeekSummary, diff: Record<Compared, number | null>): string {
  if (current.daysLogged === 0) return "A fresh week is a fresh start — log a day and watch it grow 🌱";
  if ((diff.workoutMinutes ?? 0) >= 15) return "You moved more than last week — keep it going! 💪";
  if ((diff.learningMinutes ?? 0) >= 15) return "You spent more time learning than last week — lovely curiosity 📚";
  if ((diff.avgMood ?? 0) >= 0.5) return "Your mood was brighter than last week 🌤️";
  if ((diff.avgOverall ?? 0) >= 3) return "Your overall score went up this week — nice work!";
  if ((diff.daysLogged ?? 0) > 0) return "You checked in more often than last week — consistency builds everything.";
  if (current.daysLogged >= 5) return `You showed up ${current.daysLogged} days this week — that consistency matters.`;
  if (current.workouts > 0) return `${current.workouts} workout${current.workouts === 1 ? "" : "s"} this week — every one counts.`;
  return "Every day you log is a step forward. Be kind to yourself this week 💚";
}

/** The 7 days ending on `weekEnding`, and the 7 days before them. */
export function weekRanges(weekEnding: string) {
  const from = addDays(weekEnding, -6);
  return {
    current: { from, to: weekEnding },
    previous: { from: addDays(from, -7), to: addDays(from, -1) },
  };
}
