// Loads a program's days (only day 1 → the last day its report covers) and turns them into stats.
import { fieldCrypto } from "../config/encryption";
import { DailyEntryModel, isCheckedIn } from "../models/DailyEntry";
import { openDayPurposes, type StoredDayPurposes } from "../utils/dailyPurpose";
import { MealDayModel } from "../models/MealDay";
import { ProgramModel } from "../models/Program";
import { change, dateOfDay, progressTowardGoal, reportRange, weekOfProgram } from "../utils/program";
import { programStats, targetsHit, type ProgramDayRow, type TargetKey } from "../utils/programStats";
import { dayMood } from "../utils/timeline";
import { waterTotal } from "../utils/water";
import { dayTotals, type MealItemLike } from "../utils/meals";
import { addDays, listDates, todayInTimezone } from "../utils/dates";
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

// ---------- Report ----------

const label = (key: string) =>
  ({ confidence: "Confidence", discipline: "Discipline", fitness: "Fitness", mentalWellbeing: "Mental wellbeing", focus: "Focus" })[key] ?? key;
const fmt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;

/** "37 of 100 days — what you achieved" (never "failed"). */
export function reportTitle(p: { status: string; lengthDays: number; endedOnDay?: number | null }, days: number): string {
  if (p.status === "ended_early") return `${p.endedOnDay} of ${p.lengthDays} days — what you achieved`;
  if (p.status === "active") return `Day ${days} of ${p.lengthDays} — your report so far`;
  return `${p.lengthDays} days — what you achieved`;
}

/**
 * GET /api/programs/:id/report — everything for the report, limited to day 1 → the last day it
 * covers. Text here (purposes, reflection) is decrypted for the owner only and never sent to the AI.
 */
export async function computeProgramReport(userId: string | undefined, program: ProgramLike, today: string = todayInTimezone()) {
  const p = (typeof (program as any).toObject === "function" ? (program as any).toObject() : program) as Record<string, any>;
  const progress = await computeProgramProgress(userId, p, today);
  const { range, stats } = progress;

  // What mattered most: purposes written more than once, and the values chosen most
  const entries = range.days > 0 ? await DailyEntryModel.find({ userId, date: { $gte: range.from, $lte: range.to } }).select("dailyPurposes").lean() : [];
  const texts = new Map<string, { text: string; days: number }>();
  const values = new Map<string, number>();
  for (const e of entries) {
    const { purposes } = openDayPurposes(fieldCrypto, e as StoredDayPurposes);
    for (const purpose of purposes) {
      const key = purpose.text.trim().toLowerCase();
      if (key) texts.set(key, { text: texts.get(key)?.text ?? purpose.text.trim(), days: (texts.get(key)?.days ?? 0) + 1 });
      for (const v of purpose.focusValues) values.set(v, (values.get(v) ?? 0) + 1);
    }
  }
  const recurringPurposes = [...texts.values()].filter((t) => t.days >= 2).sort((a, b) => b.days - a.days).slice(0, 5);
  const topValues = [...values.entries()].map(([value, days]) => ({ value, days })).sort((a, b) => b.days - a.days).slice(0, 5);

  // Improvements, in plain words: "−2.3 kg", "Mood +1.4", "Discipline 4 → 7"
  const improvements: string[] = [];
  if (progress.weight.change) improvements.push(`${fmt(progress.weight.change)} kg`);
  const firstWeek = stats.weeks.find((w) => w.avgMood !== null);
  const lastWeek = [...stats.weeks].reverse().find((w) => w.avgMood !== null);
  if (firstWeek && lastWeek && firstWeek !== lastWeek) {
    const moodChange = change(firstWeek.avgMood, lastWeek.avgMood);
    if (moodChange) improvements.push(`Mood ${fmt(moodChange)} (week ${firstWeek.week} → week ${lastWeek.week})`);
  }
  for (const r of progress.ratings) {
    if (r.before !== null && r.latest !== null && r.latest > r.before) improvements.push(`${label(r.label)} ${r.before} → ${r.latest}`);
  }
  for (const m of progress.measurements) {
    if (m.change) improvements.push(`${label(m.key.replace("Cm", ""))} ${fmt(m.change)} cm`.replace(/^./, (c) => c.toUpperCase()));
  }

  const open = (s: string | null | undefined) => (s ? (fieldCrypto.tryDecrypt(s) ?? "") : "");
  const final = real(p.final);
  const latestCheckIn = final ?? real(p.midpoint);
  const photos = (s: any) => ((s?.photos ?? []) as { fileId: string }[]).map((x) => x.fileId);

  return {
    ...progress,
    title: reportTitle({ status: p.status, lengthDays: p.lengthDays, endedOnDay: p.endedOnDay }, range.days),
    status: p.status,
    name: p.name,
    lengthDays: p.lengthDays,
    startDate: p.startDate,
    endedOn: p.endedOn ?? null,
    endedOnDay: p.endedOnDay ?? null,
    endReason: p.endReason ?? null,
    improvements,
    recurringPurposes,
    topValues,
    reflection: open(final?.text as string | null | undefined),
    whyText: open(p.baseline?.text),
    photos: { before: photos(p.baseline), after: photos(latestCheckIn), afterFrom: latestCheckIn ? (final ? "final" : "midpoint") : null },
  };
}

// ---------- Weekly review ----------

/**
 * The program part of the Weekly review for the 7 days ending on `weekEnding`: "Week 3 of 15",
 * this week compared with the baseline (and with week 1 for mood), and which daily-plan targets
 * were hit each day. Null when no program covers that day.
 */
export async function programWeek(userId: string | undefined, weekEnding: string) {
  const candidates = await ProgramModel.find({ userId, startDate: { $lte: weekEnding } }).sort({ startDate: -1 }).limit(5).lean();
  const program = candidates.find((p) => {
    const last = p.status === "ended_early" && p.endedOnDay ? dateOfDay(p.startDate, p.endedOnDay) : dateOfDay(p.startDate, p.lengthDays);
    return weekEnding <= last;
  });
  if (!program) return null;
  const week = weekOfProgram(program.startDate, program.lengthDays, weekEnding);
  if (!week) return null;

  const from = [addDays(weekEnding, -6), program.startDate].sort().at(-1)!;
  const [days, firstWeek] = await Promise.all([
    loadProgramDays(userId, from, weekEnding),
    loadProgramDays(userId, program.startDate, [addDays(program.startDate, 6), weekEnding].sort()[0]!),
  ]);
  const plan = program.plan ?? {};
  const weights = days.filter((d) => d.weightKg !== null);
  const avgMood = (rows: typeof days) => {
    const moods = rows.map((d) => d.avgMood).filter((m): m is number => m !== null);
    return moods.length ? Math.round((moods.reduce((s, m) => s + m, 0) / moods.length) * 10) / 10 : null;
  };
  return {
    id: String(program._id),
    name: program.name,
    week: week.week,
    of: week.of,
    baseline: {
      weightKg: program.baseline?.weightKg ?? null,
      weekWeightKg: weights.at(-1)?.weightKg ?? null,
      weightChange: change(program.baseline?.weightKg, weights.at(-1)?.weightKg),
      firstWeekMood: week.week > 1 ? avgMood(firstWeek) : null,
      weekMood: avgMood(days),
    },
    targets: (Object.keys(targetsHit(days[0] ?? ({} as ProgramDayRow), plan)) as TargetKey[]),
    days: days.map((d) => ({ date: d.date, logged: d.logged, hit: targetsHit(d, plan) })),
  };
}
