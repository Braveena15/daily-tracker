// Loads a program's days (only day 1 → the last day its report covers) and turns them into stats.
import { DailyEntryModel, isCheckedIn } from "../models/DailyEntry";
import { MealDayModel } from "../models/MealDay";
import { ProgramModel } from "../models/Program";
import { change, progressTowardGoal, reportRange } from "../utils/program";
import { programStats, type ProgramDayRow } from "../utils/programStats";
import { dayMood } from "../utils/timeline";
import { waterTotal } from "../utils/water";
import { dayTotals, type MealItemLike } from "../utils/meals";
import { listDates, todayInTimezone } from "../utils/dates";
import { loadUserContext, scoresFor } from "./dayData";

type ProgramLike = NonNullable<Awaited<ReturnType<typeof ProgramModel.findOne>>> | Record<string, any>;

/** One row per day from `from` to `to` (days without anything stored are "not logged"). */
export async function loadProgramDays(userId: string | undefined, from: string, to: string): Promise<ProgramDayRow[]> {
  if (to < from) return [];
  const [ctx, entries, mealDays] = await Promise.all([
    loadUserContext(userId),
    DailyEntryModel.find({ userId, date: { $gte: from, $lte: to } }).lean(),
    MealDayModel.find({ userId, date: { $gte: from, $lte: to }, "items.0": { $exists: true } }).lean(),
  ]);
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const kcal = new Map(mealDays.map((m) => [m.date, dayTotals(m.items as MealItemLike[]).kcal]));

  return listDates(from, to).map((date) => {
    const e = byDate.get(date);
    const logged = !!e && isCheckedIn(e);
    const scores = logged ? scoresFor(ctx, e, kcal.get(date)) : null;
    return {
      date,
      logged,
      overall: scores?.overall ?? null,
      physical: scores?.physical.score ?? null,
      mental: scores?.mental.score ?? null,
      learning: scores?.learning.score ?? null,
      avgMood: logged ? (dayMood(e.moodLogs)?.avgMood ?? null) : null,
      workouts: e?.workouts.length ?? 0,
      learningMinutes: (e?.learnings ?? []).reduce((s, l) => s + (l.minutes ?? 0), 0),
      waterMl: waterTotal(e?.waterLogs),
      sleepHours: e?.sleepHours ?? null,
      weightKg: e?.weightKg ?? null,
      eatenKcal: kcal.get(date) ?? null,
      habitsDone: e?.programHabitsDone ?? [],
    };
  });
}

const RATING_KEYS = ["confidence", "discipline", "fitness", "mentalWellbeing", "focus"] as const;
type SnapshotLike = { skipped?: boolean | null; weightKg?: number | null; ratings?: Record<string, any> | null; [k: string]: unknown } | null | undefined;
const real = (s: SnapshotLike) => (s && !s.skipped ? s : null);

/**
 * The program's numbers up to the last day its report covers: stats, the latest values (final
 * check-in, else midpoint, else the most recent entries) and progress toward each goal.
 */
export async function computeProgramProgress(userId: string | undefined, program: ProgramLike, today: string = todayInTimezone()) {
  const p = (typeof (program as any).toObject === "function" ? (program as any).toObject() : program) as Record<string, any>;
  const range = reportRange({ status: p.status, startDate: p.startDate, lengthDays: p.lengthDays, endedOnDay: p.endedOnDay }, today);
  const rows = range.days > 0 ? await loadProgramDays(userId, range.from, range.to) : [];
  const stats = programStats({ startDate: p.startDate, days: rows, plan: p.plan ?? {}, daysCompleted: range.days });

  const baseline = p.baseline ?? {};
  const checkIn = real(p.final) ?? real(p.midpoint);
  const latestWeight = checkIn?.weightKg ?? stats.latestWeightKg ?? null;
  const ratingRows = [
    ...RATING_KEYS.map((key) => ({ key, label: key, before: baseline.ratings?.[key] ?? null, goal: p.goals?.ratings?.[key] ?? null, latest: checkIn?.ratings?.[key] ?? null })),
    ...((baseline.ratings?.custom ?? []) as { label: string; value: number | null }[]).map((c) => ({
      key: `custom:${c.label}`,
      label: c.label,
      before: c.value,
      goal: ((p.goals?.ratings?.custom ?? []) as { label: string; value: number | null }[]).find((g) => g.label === c.label)?.value ?? null,
      latest: ((checkIn?.ratings?.custom ?? []) as { label: string; value: number | null }[]).find((g) => g.label === c.label)?.value ?? null,
    })),
  ].map((r) => ({ ...r, change: change(r.before, r.latest), progress: progressTowardGoal(r.before, r.goal, r.latest) }));

  const measurements = (["waistCm", "chestCm", "hipsCm", "armCm"] as const).map((key) => ({
    key,
    before: baseline[key] ?? null,
    latest: (checkIn?.[key] as number | null | undefined) ?? null,
    change: change(baseline[key], checkIn?.[key] as number | null | undefined),
  }));

  return {
    range,
    stats,
    latest: { weightKg: latestWeight, source: checkIn ? (real(p.final) ? "final" : "midpoint") : latestWeight !== null ? "entries" : null },
    weight: {
      before: baseline.weightKg ?? null,
      goal: p.goals?.goalWeightKg ?? null,
      latest: latestWeight,
      change: change(baseline.weightKg, latestWeight),
      progress: progressTowardGoal(baseline.weightKg, p.goals?.goalWeightKg, latestWeight),
    },
    ratings: ratingRows,
    measurements,
  };
}
