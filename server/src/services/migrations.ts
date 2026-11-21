// Small data migrations, run after the database connects. Each one is idempotent.
import { DailyEntryModel } from "../models/DailyEntry";

/**
 * appleSleepScore → sleepScoreValue + sleepScoreSource.
 * A typed-in Apple score becomes a "manual" value; days with only a calculated score get it as "auto".
 * Uses the raw collection, because appleSleepScore is no longer in the schema.
 */
export async function migrateSleepScoreField(): Promise<number> {
  const entries = DailyEntryModel.collection;
  const typed = await entries.updateMany(
    { appleSleepScore: { $ne: null }, sleepScoreValue: null },
    [{ $set: { sleepScoreValue: "$appleSleepScore", sleepScoreSource: "manual" } }, { $unset: "appleSleepScore" }],
  );
  const leftover = await entries.updateMany({ appleSleepScore: { $exists: true } }, { $unset: { appleSleepScore: "" } });
  const calculated = await entries.updateMany(
    { "sleep.score": { $ne: null }, sleepScoreValue: null },
    [{ $set: { sleepScoreValue: "$sleep.score", sleepScoreSource: "auto" } }],
  );
  return typed.modifiedCount + leftover.modifiedCount + calculated.modifiedCount;
}

export async function runMigrations(): Promise<void> {
  const changed = await migrateSleepScoreField();
  if (changed > 0) console.log(`🔧 Sleep score field: migrated ${changed} entries`);
}
