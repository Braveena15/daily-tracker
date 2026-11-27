// One-time move from the old journey settings (User.journeyStartDate / journeyLengthDays) to a
// Program. Runs at startup with the other migrations; safe to run any number of times: a user who
// already has any program (or was migrated before) is skipped.
//
// Who: users who chose a journey start date, or who have any real entry (their journey started on
// their first entry). Users with no data get no program; they're offered "Start a program".
// - startDate: the chosen date, else the first entry. lengthDays: journeyLengthDays (7–365).
// - status: "active" while it's still running. Past its last day: "completed" if they were still
//   logging in its last 7 days, else "abandoned" (an unfinished journey).
// - baseline: the first weight logged on or after the start (else the profile's), profile habits none.
// - goals: the profile's goal weight. plan: the user's water and learning goals and calorie target.
import { CHECKED_IN, DailyEntryModel } from "../models/DailyEntry";
import { ProgramModel } from "../models/Program";
import { UserModel } from "../models/User";
import { addDays, todayInTimezone } from "../utils/dates";
import { PROGRAM_LENGTH, plannedEndDate } from "../utils/program";
import { firstEntryDate } from "./journey";
import { buildSummary } from "./profileSummary";

export type ProgramMigrationResult = { users: number; created: number };

const clampLength = (n: number | null | undefined) => Math.min(PROGRAM_LENGTH.max, Math.max(PROGRAM_LENGTH.min, Math.round(n ?? 100)));

/** Creates the program for one user, or returns null when there's nothing to migrate. */
export async function migrateUserJourney(userId: string, today: string = todayInTimezone()): Promise<string | null> {
  if (await ProgramModel.exists({ userId })) return null;
  const user = await UserModel.findById(userId).lean();
  if (!user) return null;

  const chosen = user.journeyStartDate && user.journeyStartDate <= today ? user.journeyStartDate : null;
  const startDate = chosen ?? (await firstEntryDate(userId));
  if (!startDate) return null;

  const lengthDays = clampLength(user.journeyLengthDays);
  const end = plannedEndDate(startDate, lengthDays);
  let status: "active" | "completed" | "abandoned" = "active";
  if (today > end) {
    const lateLog = await DailyEntryModel.exists({ userId, date: { $gte: addDays(end, -6), $lte: end }, ...CHECKED_IN });
    status = lateLog ? "completed" : "abandoned";
  }

  const firstWeight = await DailyEntryModel.findOne({ userId, date: { $gte: startDate }, weightKg: { $ne: null } })
    .sort({ date: 1 })
    .select("date weightKg")
    .lean();

  try {
    const created = await ProgramModel.create({
      userId,
      name: `${lengthDays}-day transformation`,
      lengthDays,
      startDate,
      status,
      migrated: true,
      baseline: { date: startDate, weightKg: firstWeight?.weightKg ?? user.currentWeightKg ?? undefined },
      goals: { goalWeightKg: user.goalWeightKg ?? undefined },
      plan: {
        waterMl: user.waterGoalMl ?? undefined,
        calorieTarget: buildSummary(user)?.calorieTarget,
        learningMinutes: user.learningMinutesGoal ?? undefined,
      },
    });
    return String(created._id);
  } catch (err) {
    // Another server created it at the same moment (the one-active-program index): nothing to do
    if ((err as { code?: number }).code === 11000) return null;
    throw err;
  }
}

export async function migrateJourneysToPrograms(today: string = todayInTimezone()): Promise<ProgramMigrationResult> {
  const result: ProgramMigrationResult = { users: 0, created: 0 };
  const migrated = new Set((await ProgramModel.distinct("userId")).map(String));
  for await (const user of UserModel.find({ isDemo: { $ne: true } }).select("_id").lean().cursor()) {
    result.users++;
    if (migrated.has(String(user._id))) continue;
    if (await migrateUserJourney(String(user._id), today)) result.created++;
  }
  return result;
}
