// Where the user's journey starts (see utils/journey.ts), and clean-up of data from before it.
import { AiMessageModel } from "../models/Ai";
import { CHECKED_IN, DailyEntryModel } from "../models/DailyEntry";
import { MealDayModel } from "../models/MealDay";
import { DiaryEntryModel, ThoughtLogModel } from "../models/Mind";
import { UserModel } from "../models/User";
import { todayInTimezone } from "../utils/dates";
import { earliestDate, resolveJourneyStart } from "../utils/journey";
import { WeeklyGoalModel } from "../models/WeeklyGoal";

/** The date of the user's first real entry: a logged day, a meal, a diary entry or a thought log. */
export async function firstEntryDate(userId: string | undefined): Promise<string | null> {
  const first = (query: Promise<{ date: string } | null>) => query.then((d) => d?.date ?? null);
  const dates = await Promise.all([
    // Logged days only: a day with just Apple Health data doesn't start the journey
    first(DailyEntryModel.findOne({ userId, ...CHECKED_IN }).sort({ date: 1 }).select("date").lean()),
    first(MealDayModel.findOne({ userId, "items.0": { $exists: true } }).sort({ date: 1 }).select("date").lean()),
    first(DiaryEntryModel.findOne({ userId }).sort({ date: 1 }).select("date").lean()),
    first(ThoughtLogModel.findOne({ userId }).sort({ date: 1 }).select("date").lean()),
  ]);
  return earliestDate(dates);
}

/** The journey start: the date the user chose, else their first real entry, else today. */
export async function journeyStart(userId: string | undefined, user?: { journeyStartDate?: string | null } | null): Promise<string> {
  const chosen = user !== undefined ? user?.journeyStartDate : (await UserModel.findById(userId).select("journeyStartDate").lean())?.journeyStartDate;
  // Only look up the first entry when the user hasn't picked a date
  return resolveJourneyStart(chosen, chosen ? null : await firstEntryDate(userId), todayInTimezone());
}

// ---------- Clean-up ----------

/** Everything of this user's dated before `start`. Every query is limited to the user's own id. */
function beforeStart(userId: string | undefined, start: string) {
  const filter = { userId, date: { $lt: start } };
  return [
    { key: "days", model: DailyEntryModel, filter },
    { key: "mealDays", model: MealDayModel, filter },
    { key: "diaryEntries", model: DiaryEntryModel, filter },
    { key: "thoughtLogs", model: ThoughtLogModel, filter },
    { key: "aiMessages", model: AiMessageModel, filter },
    // Weekly goals have no single date: those whose whole week ended before the start
    { key: "weeklyGoals", model: WeeklyGoalModel, filter: { userId, weekEnd: { $lt: start } } },
  ] as const;
}

export type CleanupCounts = Record<ReturnType<typeof beforeStart>[number]["key"], number>;

export async function countBeforeStart(userId: string | undefined, start: string): Promise<CleanupCounts> {
  const parts = beforeStart(userId, start);
  const counts = await Promise.all(parts.map((p) => (p.model as typeof DailyEntryModel).countDocuments(p.filter)));
  return Object.fromEntries(parts.map((p, i) => [p.key, counts[i]])) as CleanupCounts;
}

export async function deleteBeforeStart(userId: string | undefined, start: string): Promise<CleanupCounts> {
  if (!userId) throw new Error("A user id is required");
  const parts = beforeStart(userId, start);
  const results = await Promise.all(parts.map((p) => (p.model as typeof DailyEntryModel).deleteMany(p.filter)));
  return Object.fromEntries(parts.map((p, i) => [p.key, results[i]!.deletedCount])) as CleanupCounts;
}
