// Small data migrations, run after the database connects. Each one is idempotent.
import { DailyEntryModel } from "../models/DailyEntry";
import { planIntensityMigration, planPurposesMigration } from "../utils/purposesMigration";

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

export type PurposesMigrationResult = { scanned: number; days: number; purposes: number; intentions: number; ratings: number; notes: number };

/**
 * dailyPurpose (one per day) → dailyPurposes (several, each with its own intentions and rating) +
 * dailyReflectionNote. See utils/purposesMigration.ts. Uses the raw collection, because
 * dailyPurpose is no longer in the schema. With `dryRun`, only counts.
 */
export async function migrateDailyPurposes(dryRun = false): Promise<PurposesMigrationResult> {
  const collection = DailyEntryModel.collection;
  const result: PurposesMigrationResult = { scanned: 0, days: 0, purposes: 0, intentions: 0, ratings: 0, notes: 0 };
  for await (const doc of collection.find({ dailyPurpose: { $exists: true } })) {
    result.scanned++;
    const plan = planPurposesMigration(doc as unknown as Record<string, unknown> & { date: string });
    if (!plan) continue;
    result.days++;
    result.purposes += plan.counts.purposes;
    result.intentions += plan.counts.intentions;
    result.ratings += plan.counts.ratings;
    result.notes += plan.counts.notes;
    if (dryRun) continue;
    // Only if dailyPurpose is still there, so two runs at once can't move a day twice
    await collection.updateOne(
      { _id: doc._id, dailyPurpose: { $exists: true } },
      {
        ...(Object.keys(plan.set).length > 0 && { $set: plan.set }),
        $unset: Object.fromEntries(plan.unset.map((k) => [k, ""])),
      },
    );
  }
  return result;
}

export type IntensityMigrationResult = { days: number; ratings: number };

/** Purposes' old evening ratings → legacyRating (intensity left empty). See utils/purposesMigration.ts. */
export async function migratePurposeRatings(dryRun = false): Promise<IntensityMigrationResult> {
  const collection = DailyEntryModel.collection;
  const result: IntensityMigrationResult = { days: 0, ratings: 0 };
  for await (const doc of collection.find({ "dailyPurposes.rating": { $exists: true } })) {
    const plan = planIntensityMigration(doc as unknown as Record<string, unknown>);
    if (!plan) continue;
    result.days++;
    result.ratings += plan.moved;
    if (!dryRun) await collection.updateOne({ _id: doc._id }, { $set: plan.set });
  }
  return result;
}

export async function runMigrations(): Promise<void> {
  const changed = await migrateSleepScoreField();
  if (changed > 0) console.log(`🔧 Sleep score field: migrated ${changed} entries`);
  const purposes = await migrateDailyPurposes();
  if (purposes.days > 0) {
    console.log(`🔧 Daily purposes: moved ${purposes.days} days (${purposes.purposes} purposes, ${purposes.intentions} intentions, ${purposes.ratings} ratings, ${purposes.notes} notes)`);
  }
  // After the move above, so ratings it carried over are moved too
  const ratings = await migratePurposeRatings();
  if (ratings.days > 0) console.log(`🔧 Purpose ratings → legacyRating: ${ratings.ratings} on ${ratings.days} days`);
}
