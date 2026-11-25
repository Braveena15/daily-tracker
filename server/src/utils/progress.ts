// Pure functions for the progress pages: weight trend, journey progress and the weekly review.
import { KCAL_PER_KG, movingAverage } from "./calories";
import { addDays, daysBetween, listDates } from "./dates";
import { waterWeek, type WaterWeek } from "./water";

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Weight ----------

export type WeightPoint = { date: string; weightKg: number | null; averageKg: number | null };

/**
 * One point per day from `from` to `to`, with the day's weight (null without a weigh-in, never
 * filled from another day) and the 7-day average. The average smooths out day-to-day noise
 * (water, salt, timing); it's only given on days with a weigh-in, from at least 2 real readings
 * in that day's 7-day window, and is null on every other day.
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
 * Average change per week over about the last 4 weeks, from the 7-day average (not raw weights):
 * the latest average compared with the average from 28 days before it — or, since averages only
 * exist on weigh-in days, the latest one from 28–35 days before — per week between them.
 * Null without two such averages (so always null with fewer than 2 readings on different days).
 */
export function weeklyChangeFromAverage(series: WeightPoint[]): number | null {
  const averaged = series.filter((p): p is WeightPoint & { averageKg: number } => p.averageKg !== null);
  const last = averaged.at(-1);
  if (!last) return null;
  const latestEarlier = addDays(last.date, -28);
  const oldestEarlier = addDays(last.date, -35);
  const earlier = averaged.filter((p) => p.date <= latestEarlier && p.date >= oldestEarlier).at(-1);
  if (!earlier) return null;
  return round2((last.averageKg - earlier.averageKg) / (daysBetween(earlier.date, last.date) / 7));
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

/** One day's numbers for the review. Scores are null on days that weren't logged. */
export type ReviewDay = {
  date: string;
  physical: number | null;
  mental: number | null;
  learning: number | null;
  overall: number | null;
  /** The day's average mood over all check-ins (null without one) */
  mood: number | null;
  /** The day's average energy over all check-ins (null without one) */
  energy?: number | null;
  /** Each check-in, for the drill-down ("08:15 · mood 7 · energy 6") */
  moodCheckins?: { time: string; mood: number; energy: number }[];
  moodMin: number | null;
  moodMax: number | null;
  moodCount: number;
  goodThings: number;
  learnings: number;
  presentMoments: number;
  steps: number | null;
  activeCalories: number | null;
  sleepHours: number | null;
  /** Our calculated sleep score, when the watch synced sleep */
  sleepScore: number | null;
  workouts: number;
  workoutMinutes: number;
  learningMinutes: number;
  /** Null when no meals were logged that day */
  kcal: number | null;
  /** Null when no food that day had fibre */
  fiberG: number | null;
  /** The day's water in ml (0 without any); not part of the scores */
  waterMl: number;
  /** Drill-down details: each workout and learning, and the night's times */
  workoutItems?: { type: string; minutes: number | null }[];
  learningItems?: { topic: string; minutes: number | null }[];
  bedtime?: string | null;
  wakeTime?: string | null;
  /** True when something was logged by hand (a reason alone never counts) */
  logged?: boolean;
  /** Why the day wasn't logged, when noted (today or yesterday only) */
  missedReason?: { category: string; note: string } | null;
};

export type WeekSummary = {
  from: string;
  to: string;
  /** Days of this week since the journey started (7 for a full week; fewer in the first week) */
  daysTracked: number;
  daysLogged: number;
  avgPhysical: number | null;
  avgMental: number | null;
  avgLearning: number | null;
  avgOverall: number | null;
  avgMood: number | null;
  avgSleepHours: number | null;
  avgSleepScore: number | null;
  workouts: number;
  workoutMinutes: number;
  learningMinutes: number;
  avgKcal: number | null;
  /** Average daily fibre (g) over days with fibre logged */
  avgFiberG: number | null;
  mealDays: number;
  bestDay: { date: string; overall: number } | null;
} & WaterWeek;

function avg(values: (number | null)[], round: (n: number) => number = Math.round): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : round(present.reduce((s, v) => s + v, 0) / present.length);
}

/** Averages only count days that were logged, so a missed day doesn't look like a bad day. */
export function summariseWeek(days: ReviewDay[], from: string, to: string, waterGoalMl = 2000): WeekSummary {
  const best = days
    .filter((d): d is ReviewDay & { overall: number } => d.overall !== null)
    .sort((a, b) => b.overall - a.overall || a.date.localeCompare(b.date))[0];

  return {
    from,
    to,
    daysTracked: days.length,
    daysLogged: days.filter((d) => d.overall !== null).length,
    avgPhysical: avg(days.map((d) => d.physical)),
    avgMental: avg(days.map((d) => d.mental)),
    avgLearning: avg(days.map((d) => d.learning)),
    avgOverall: avg(days.map((d) => d.overall)),
    avgMood: avg(days.map((d) => d.mood), round1),
    avgSleepHours: avg(days.map((d) => d.sleepHours), round1),
    avgSleepScore: avg(days.map((d) => d.sleepScore)),
    workouts: days.reduce((s, d) => s + d.workouts, 0),
    workoutMinutes: days.reduce((s, d) => s + d.workoutMinutes, 0),
    learningMinutes: days.reduce((s, d) => s + d.learningMinutes, 0),
    avgKcal: avg(days.map((d) => d.kcal)),
    avgFiberG: avg(days.map((d) => d.fiberG), round1),
    mealDays: days.filter((d) => d.kcal !== null).length,
    ...waterWeek(days.map((d) => d.waterMl), waterGoalMl),
    bestDay: best ? { date: best.date, overall: best.overall } : null,
  };
}

// ---------- Per-metric figures (for the "Your week" cards and their day-by-day sheets) ----------

export type MetricKey =
  | "overall"
  | "physical"
  | "mental"
  | "learning"
  | "mood"
  | "energy"
  | "sleepHours"
  | "sleepScore"
  | "kcal"
  | "fiberG"
  | "waterMl"
  | "workouts"
  | "workoutMinutes"
  | "learnings"
  | "learningMinutes"
  | "daysLogged";

export type WeekMetric = {
  /** An average over the days with data, or a weekly total; null when no day had any */
  value: number | null;
  /** Days that had this data (a missing day is never counted as 0) */
  daysWithData: number;
  /** Days of this week so far (from the journey start) */
  daysInWeekSoFar: number;
  /** Each day's value, oldest first (null on days without it) */
  perDay: { date: string; value: number | null }[];
};

const round0 = (n: number) => Math.round(n);

/**
 * Every "Your week" figure, fairly: averages only use days that have that data (a day without a
 * mood check-in isn't a mood of 0), mood and energy are averaged per day first and then across the
 * days, and workouts and learning are weekly totals.
 */
export function weekMetrics(days: ReviewDay[]): Record<MetricKey, WeekMetric> {
  const metric = (pick: (d: ReviewDay) => number | null, kind: "average" | "total", round: (n: number) => number = round0): WeekMetric => {
    const perDay = days.map((d) => ({ date: d.date, value: pick(d) }));
    const present = perDay.map((p) => p.value).filter((v): v is number => v !== null);
    const sum = present.reduce((s, v) => s + v, 0);
    return {
      value: present.length === 0 ? null : round(kind === "average" ? sum / present.length : sum),
      daysWithData: present.length,
      daysInWeekSoFar: days.length,
      perDay,
    };
  };
  const positive = (n: number) => (n > 0 ? n : null);
  return {
    overall: metric((d) => d.overall, "average"),
    physical: metric((d) => d.physical, "average"),
    mental: metric((d) => d.mental, "average"),
    learning: metric((d) => d.learning, "average"),
    mood: metric((d) => d.mood, "average", round1),
    energy: metric((d) => d.energy ?? null, "average", round1),
    sleepHours: metric((d) => d.sleepHours, "average", round1),
    sleepScore: metric((d) => d.sleepScore, "average"),
    kcal: metric((d) => d.kcal, "average"),
    fiberG: metric((d) => d.fiberG, "average", round1),
    waterMl: metric((d) => positive(d.waterMl), "average"),
    workouts: metric((d) => positive(d.workouts), "total"),
    workoutMinutes: metric((d) => positive(d.workoutMinutes), "total"),
    learnings: metric((d) => positive(d.learnings), "total"),
    learningMinutes: metric((d) => positive(d.learningMinutes), "total"),
    daysLogged: metric((d) => ((d.logged ?? d.overall !== null) ? 1 : null), "total"),
  };
}

const COMPARED = [
  "daysLogged",
  "avgPhysical",
  "avgMental",
  "avgLearning",
  "avgOverall",
  "avgMood",
  "avgSleepHours",
  "avgSleepScore",
  "workouts",
  "workoutMinutes",
  "learningMinutes",
  "avgKcal",
  "avgFiberG",
  "avgWaterMl",
  "waterGoalDays",
] as const;
export type Compared = (typeof COMPARED)[number];

/**
 * This week minus last week for each number (null when either week has no value, and for every
 * number when last week was before the journey started).
 */
export function weekDifferences(current: WeekSummary, previous: WeekSummary): Record<Compared, number | null> {
  return Object.fromEntries(
    COMPARED.map((key) => {
      if (previous.daysTracked === 0) return [key, null];
      const a = current[key];
      const b = previous[key];
      return [key, a === null || b === null ? null : key === "avgMood" || key === "avgSleepHours" || key === "avgFiberG" ? round1(a - b) : a - b];
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

// ---------- Sleep ----------

export type SleepPoint = { date: string; hours: number | null; score: number | null };

/** One point per day from `from` to `to`: hours slept and our sleep score (null when missing). */
export function sleepSeries(
  nights: Map<string, { hours: number | null; score: number | null }>,
  from: string,
  to: string,
): SleepPoint[] {
  return listDates(from, to).map((date) => ({ date, hours: nights.get(date)?.hours ?? null, score: nights.get(date)?.score ?? null }));
}
