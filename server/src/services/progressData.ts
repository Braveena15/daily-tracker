// The weekly review and insights, shared by the progress routes and the AI weekly reflection.
import { CHECKED_IN, DailyEntryModel } from "../models/DailyEntry";
import { journeyStart, loadDays, loadUserContext, loadWater, scoresFor, toScoreEntry } from "./dayData";
import { clampFrom } from "../utils/journey";
import { addDays, listDates, todayInTimezone } from "../utils/dates";
import { findInsights, type InsightDay } from "../utils/insights";
import { encouragement, summariseWeek, weekDifferences, weekMetrics, weekRanges, type ReviewDay } from "../utils/progress";
import { mentalScore } from "../utils/scores";
import { clockTime, dayMood } from "../utils/timeline";
import { openMissedReason, type StoredMissedReason } from "../utils/missedReason";
import { fieldCrypto } from "../config/encryption";
import { hasDayPurposes, openDayPurposes, purposeStats, recurringPurposes } from "../utils/dailyPurpose";

const minutes = (items: { durationMin?: number | null; minutes?: number | null }[]) =>
  items.reduce((s, i) => s + (i.durationMin ?? i.minutes ?? 0), 0);

/** This week (the 7 days ending on `weekEnding`) compared with the week before. */
export async function computeWeeklyReview(userId: string | undefined, weekEnding: string) {
  const { current, previous } = weekRanges(weekEnding);
  const start = await journeyStart(userId);
  const [ctx, { entries, mealKcal, mealFiber }, water, extras] = await Promise.all([
    loadUserContext(userId),
    loadDays(userId, previous.from, current.to, start),
    // Water counts on any day (even one with nothing else logged)
    loadWater(userId, clampFrom(previous.from, start), current.to),
    // Sleep and missed-day reasons count on any day too: a night from the watch on a day with no
    // check-in is still a night with data, and a reason never makes a day logged
    DailyEntryModel.find({
      userId,
      date: { $gte: clampFrom(previous.from, start), $lte: current.to },
      $or: [{ sleepHours: { $ne: null } }, { "missedReason.category": { $exists: true } }],
    })
      .select("date sleepHours sleepScoreValue sleep.bedtime sleep.wakeTime missedReason")
      .lean(),
  ]);
  const extraByDate = new Map(extras.map((e) => [e.date, e]));

  // Only days from the journey start count; earlier days are neither logged nor "missed"
  const reviewDays = (from: string, to: string): ReviewDay[] =>
    listDates(clampFrom(from, start), to).map((date) => {
      const entry = entries.get(date);
      const extra = extraByDate.get(date);
      // Only an unlogged day shows its reason (logging the day later makes it irrelevant)
      const reason = entry ? null : openMissedReason(fieldCrypto, extra?.missedReason as StoredMissedReason);
      const s = scoresFor(ctx, entry, mealKcal.get(date));
      return {
        date,
        physical: s.physical.score,
        mental: s.mental.score,
        learning: s.learning.score,
        overall: s.overall,
        ...moodRange(entry?.moodLogs),
        goodThings: entry?.goodThings.length ?? 0,
        learnings: entry?.learnings.length ?? 0,
        presentMoments: entry?.presentMoments.length ?? 0,
        steps: entry?.steps ?? null,
        activeCalories: entry?.activeCalories ?? null,
        sleepHours: entry?.sleepHours ?? extra?.sleepHours ?? null,
        sleepScore: entry?.sleepScoreValue ?? extra?.sleepScoreValue ?? null,
        bedtime: extra?.sleep?.bedtime ?? null,
        wakeTime: extra?.sleep?.wakeTime ?? null,
        workouts: entry?.workouts.length ?? 0,
        workoutMinutes: entry ? minutes(entry.workouts) : 0,
        learningMinutes: entry ? minutes(entry.learnings) : 0,
        kcal: mealKcal.get(date) ?? null,
        fiberG: mealFiber.get(date) ?? null,
        waterMl: water.get(date) ?? 0,
        workoutItems: (entry?.workouts ?? []).map((w) => ({ type: w.type, minutes: w.durationMin ?? null })),
        learningItems: (entry?.learnings ?? []).map((l) => ({ topic: l.topic, minutes: l.minutes ?? null })),
        logged: entry !== undefined,
        missedReason: reason && { category: reason.category, note: reason.note },
      };
    });

  const days = reviewDays(current.from, current.to);
  const lastWeekDays = reviewDays(previous.from, previous.to);
  const waterGoalMl = ctx.goals.waterGoalMl;
  const thisWeek = summariseWeek(days, current.from, current.to, waterGoalMl);
  const lastWeek = summariseWeek(lastWeekDays, previous.from, previous.to, waterGoalMl);
  const differences = weekDifferences(thisWeek, lastWeek);

  return {
    weekEnding,
    calorieTarget: ctx.summary?.calorieTarget ?? null,
    waterGoalMl,
    thisWeek,
    lastWeek,
    differences,
    message: encouragement(thisWeek, differences),
    journeyStartDate: start,
    purpose: await weekPurpose(userId, clampFrom(current.from, start), current.to),
    // This week's days, oldest first, for the per-day rows, the drill-down sheets and the mood range chart
    days,
    // Every "Your week" figure with how many days it's based on (averages skip days without data)
    metrics: weekMetrics(days),
    lastWeekMetrics: weekMetrics(lastWeekDays),
    // For the AI's safety check only (never sent to the AI): this week's check-ins
    entriesThisWeek: listDates(current.from, current.to).flatMap((d) => (entries.has(d) ? [toScoreEntry(entries.get(d)!)] : [])),
  };
}

/** This week's daily purposes (decrypted, for the owner only) and their stats, oldest first. */
async function weekPurpose(userId: string | undefined, from: string, to: string) {
  const rows =
    from > to
      ? []
      : await DailyEntryModel.find({ userId, date: { $gte: from, $lte: to }, "dailyPurposes.0": { $exists: true } })
          .select("date dailyPurposes dailyReflectionNote")
          .sort({ date: 1 })
          .lean();
  const days = rows.flatMap((r) => {
    const p = openDayPurposes(fieldCrypto, r);
    return hasDayPurposes(p) ? [{ date: r.date, ...p }] : [];
  });
  // The week's most frequent purpose, when one came up on more than one day
  const top = recurringPurposes(days, to)[0];
  return { days, stats: purposeStats(days), mostFrequent: top && top.count > 1 ? { text: top.text, count: top.count, avgIntensity: top.avgIntensity } : null };
}

const INSIGHT_DAYS = 180;

/** Up to 3 patterns from the last 180 days with a mood check-in. */
export async function computeInsights(userId: string | undefined) {
  const to = todayInTimezone();
  const from = clampFrom(addDays(to, -(INSIGHT_DAYS - 1)), await journeyStart(userId));
  const rows = await DailyEntryModel.find({ userId, date: { $gte: from, $lte: to }, ...CHECKED_IN }).lean();

  const days: InsightDay[] = rows.flatMap((entry) => {
    const mood = dayMood(entry.moodLogs);
    return mood ? [{ ...insightDay(entry), mood: mood.avgMood }] : [];
  });

  return { daysAnalysed: days.length, insights: findInsights(days) };
}

function insightDay(entry: Parameters<typeof toScoreEntry>[0]): Omit<InsightDay, "mood"> {
  return {
    date: entry.date,
    mentalScore: mentalScore(toScoreEntry(entry)).score ?? 0,
    activities: [...entry.workouts, ...entry.mentalActivities, ...entry.outdoorActivities].map((a) => a.type),
    outdoor: entry.outdoorActivities.length > 0,
    sleepHours: entry.sleepHours ?? null,
  };
}

/** The day's mood as lowest – average – highest, and how many check-ins it's from. */
/** The day's mood: each day's check-ins averaged first (the week then averages these daily values). */
function moodRange(logs: { mood: number; energy: number; loggedAt?: Date | string | null }[] | undefined) {
  const m = dayMood(logs);
  return {
    mood: m?.avgMood ?? null,
    energy: m?.avgEnergy ?? null,
    moodMin: m?.minMood ?? null,
    moodMax: m?.maxMood ?? null,
    moodCount: m?.count ?? 0,
    moodCheckins: (logs ?? [])
      .map((l) => ({ time: l.loggedAt ? clockTime(l.loggedAt) : "", mood: l.mood, energy: l.energy }))
      .sort((a, b) => a.time.localeCompare(b.time)),
  };
}
