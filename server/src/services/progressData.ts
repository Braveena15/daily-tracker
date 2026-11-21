// The weekly review and insights, shared by the progress routes and the AI weekly reflection.
import { CHECKED_IN, DailyEntryModel, isCheckedIn } from "../models/DailyEntry";
import { loadDays, loadUserContext, scoresFor, toScoreEntry } from "./dayData";
import { addDays, listDates, todayInTimezone } from "../utils/dates";
import { findInsights, type InsightDay } from "../utils/insights";
import { encouragement, summariseWeek, weekDifferences, weekRanges, type ReviewDay } from "../utils/progress";
import { mentalScore } from "../utils/scores";

const minutes = (items: { durationMin?: number | null; minutes?: number | null }[]) =>
  items.reduce((s, i) => s + (i.durationMin ?? i.minutes ?? 0), 0);

/** This week (the 7 days ending on `weekEnding`) compared with the week before. */
export async function computeWeeklyReview(userId: string | undefined, weekEnding: string) {
  const { current, previous } = weekRanges(weekEnding);
  const [ctx, { entries, mealKcal }] = await Promise.all([
    loadUserContext(userId),
    loadDays(userId, previous.from, current.to),
  ]);

  const reviewDays = (from: string, to: string): ReviewDay[] =>
    listDates(from, to).map((date) => {
      const entry = entries.get(date);
      const s = scoresFor(ctx, entry, mealKcal.get(date));
      return {
        date,
        physical: s.physical.score,
        mental: s.mental.score,
        learning: s.learning.score,
        overall: s.overall,
        mood: entry?.mood ?? null,
        sleepHours: entry?.sleepHours ?? null,
        sleepScore: entry?.sleepScoreValue ?? null,
        workouts: entry?.workouts.length ?? 0,
        workoutMinutes: entry ? minutes(entry.workouts) : 0,
        learningMinutes: entry ? minutes(entry.learnings) : 0,
        kcal: mealKcal.get(date) ?? null,
      };
    });

  const thisWeek = summariseWeek(reviewDays(current.from, current.to), current.from, current.to);
  const lastWeek = summariseWeek(reviewDays(previous.from, previous.to), previous.from, previous.to);
  const differences = weekDifferences(thisWeek, lastWeek);

  return {
    weekEnding,
    calorieTarget: ctx.summary?.calorieTarget ?? null,
    thisWeek,
    lastWeek,
    differences,
    message: encouragement(thisWeek, differences),
    // For the AI's safety check only (never sent to the AI): this week's check-ins
    entriesThisWeek: listDates(current.from, current.to).flatMap((d) => (entries.has(d) ? [toScoreEntry(entries.get(d)!)] : [])),
  };
}

const INSIGHT_DAYS = 180;

/** Up to 3 patterns from the last 180 days of check-ins. */
export async function computeInsights(userId: string | undefined) {
  const to = todayInTimezone();
  const rows = (
    await DailyEntryModel.find({ userId, date: { $gte: addDays(to, -(INSIGHT_DAYS - 1)), $lte: to }, ...CHECKED_IN }).lean()
  ).filter(isCheckedIn);

  const days: InsightDay[] = rows.map((entry) => ({
    date: entry.date,
    mood: entry.mood,
    mentalScore: mentalScore(toScoreEntry(entry)).score ?? 0,
    activities: [...entry.workouts, ...entry.mentalActivities, ...entry.outdoorActivities].map((a) => a.type),
    outdoor: entry.outdoorActivities.length > 0,
    sleepHours: entry.sleepHours ?? null,
  }));

  return { daysAnalysed: days.length, insights: findInsights(days) };
}
