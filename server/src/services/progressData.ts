// The weekly review and insights, shared by the progress routes and the AI weekly reflection.
import { CHECKED_IN, DailyEntryModel } from "../models/DailyEntry";
import { journeyStart, loadDays, loadUserContext, loadWater, scoresFor, toScoreEntry } from "./dayData";
import { clampFrom } from "../utils/journey";
import { addDays, listDates, todayInTimezone } from "../utils/dates";
import { findInsights, type InsightDay } from "../utils/insights";
import { encouragement, summariseWeek, weekDifferences, weekRanges, type ReviewDay } from "../utils/progress";
import { mentalScore } from "../utils/scores";
import { dayMood } from "../utils/timeline";
import { fieldCrypto } from "../config/encryption";
import { hasDailyPurpose, openDailyPurpose, purposeStats, type StoredDailyPurpose } from "../utils/dailyPurpose";

const minutes = (items: { durationMin?: number | null; minutes?: number | null }[]) =>
  items.reduce((s, i) => s + (i.durationMin ?? i.minutes ?? 0), 0);

/** This week (the 7 days ending on `weekEnding`) compared with the week before. */
export async function computeWeeklyReview(userId: string | undefined, weekEnding: string) {
  const { current, previous } = weekRanges(weekEnding);
  const start = await journeyStart(userId);
  const [ctx, { entries, mealKcal, mealFiber }, water] = await Promise.all([
    loadUserContext(userId),
    loadDays(userId, previous.from, current.to, start),
    // Water counts on any day (even one with nothing else logged)
    loadWater(userId, clampFrom(previous.from, start), current.to),
  ]);

  // Only days from the journey start count; earlier days are neither logged nor "missed"
  const reviewDays = (from: string, to: string): ReviewDay[] =>
    listDates(clampFrom(from, start), to).map((date) => {
      const entry = entries.get(date);
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
        sleepHours: entry?.sleepHours ?? null,
        sleepScore: entry?.sleepScoreValue ?? null,
        workouts: entry?.workouts.length ?? 0,
        workoutMinutes: entry ? minutes(entry.workouts) : 0,
        learningMinutes: entry ? minutes(entry.learnings) : 0,
        kcal: mealKcal.get(date) ?? null,
        fiberG: mealFiber.get(date) ?? null,
        waterMl: water.get(date) ?? 0,
      };
    });

  const days = reviewDays(current.from, current.to);
  const waterGoalMl = ctx.goals.waterGoalMl;
  const thisWeek = summariseWeek(days, current.from, current.to, waterGoalMl);
  const lastWeek = summariseWeek(reviewDays(previous.from, previous.to), previous.from, previous.to, waterGoalMl);
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
    // This week's days, oldest first, for the per-day rows and the mood range chart
    days,
    // For the AI's safety check only (never sent to the AI): this week's check-ins
    entriesThisWeek: listDates(current.from, current.to).flatMap((d) => (entries.has(d) ? [toScoreEntry(entries.get(d)!)] : [])),
  };
}

/** This week's daily purposes (decrypted, for the owner only) and their stats, oldest first. */
async function weekPurpose(userId: string | undefined, from: string, to: string) {
  const rows =
    from > to
      ? []
      : await DailyEntryModel.find({ userId, date: { $gte: from, $lte: to }, dailyPurpose: { $exists: true } })
          .select("date dailyPurpose")
          .sort({ date: 1 })
          .lean();
  const days = rows.flatMap((r) => {
    const p = openDailyPurpose(fieldCrypto, r.dailyPurpose as StoredDailyPurpose);
    return hasDailyPurpose(p) ? [{ date: r.date, ...p }] : [];
  });
  return { days, stats: purposeStats(days) };
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
function moodRange(logs: { mood: number; energy: number }[] | undefined) {
  const m = dayMood(logs);
  return { mood: m?.avgMood ?? null, moodMin: m?.minMood ?? null, moodMax: m?.maxMood ?? null, moodCount: m?.count ?? 0 };
}
