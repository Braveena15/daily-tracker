import { DailyEntryModel } from "../models/DailyEntry";
import { UserModel } from "../models/User";

/**
 * If `date` is the most recent day with a weight, that weight becomes the profile's current weight.
 * Returns true when the profile was updated.
 */
export async function updateProfileWeightIfLatest(userId: string | undefined, date: string, weightKg: number): Promise<boolean> {
  const latest = await DailyEntryModel.findOne({ userId, weightKg: { $ne: null } })
    .sort({ date: -1 })
    .select("date")
    .lean();
  if (latest?.date !== date) return false;
  await UserModel.updateOne({ _id: userId }, { $set: { currentWeightKg: weightKg } });
  return true;
}
