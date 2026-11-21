// One-time migration to the timeline data model (timestamped multi-entries).
//
//   npm run migrate:timeline              convert
//   npm run migrate:timeline -- --dry-run  only count what would change
//
// Converts every DailyEntry still in the old "one form per day" shape (see utils/timelineMigration.ts):
// mood/energy → one mood check-in, good things and present moment → timestamped entries, and an
// _id + loggedAt for every workout, activity and learning. Safe to run twice: days that are already
// converted are left alone. Nothing is written to disk; it only logs counts.

// Same DNS fix as src/index.ts, so mongodb+srv:// works on networks that block SRV lookups
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import mongoose from "mongoose";
import { env } from "../config/env";
import { DailyEntryModel } from "../models/DailyEntry";
import { migrateSleepScoreField } from "../services/migrations";
import { planTimelineMigration } from "../utils/timelineMigration";

const BATCH = 500;

async function migrate(dryRun: boolean): Promise<void> {
  // The raw collection: old fields like "mood" and "presentMoment" are no longer in the schema
  const collection = DailyEntryModel.collection;
  let scanned = 0;
  let updated = 0;
  let stamped = 0;
  let ops: Parameters<typeof collection.bulkWrite>[0][number][] = [];

  const flush = async () => {
    if (ops.length === 0 || dryRun) return void (ops = []);
    await collection.bulkWrite(ops, { ordered: false });
    ops = [];
  };

  for await (const doc of collection.find({})) {
    scanned++;
    const plan = planTimelineMigration(doc as unknown as Record<string, unknown> & { date: string });
    if (!plan) continue;
    updated++;
    stamped += plan.stamped;
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          ...(Object.keys(plan.set).length > 0 && { $set: plan.set }),
          ...(plan.unset.length > 0 && { $unset: Object.fromEntries(plan.unset.map((k) => [k, ""])) }),
        },
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();

  const sleepScores = dryRun ? 0 : await migrateSleepScoreField();

  if (dryRun) console.log("Dry run: nothing was written.");
  console.log(`Days scanned:            ${scanned}`);
  console.log(`Days converted:          ${updated}`);
  console.log(`Entries created/stamped: ${stamped}`);
  console.log(`Sleep score fields:      ${sleepScores}`);
  if (updated === 0) console.log("Nothing to do: everything is already in the timeline format ✓");
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(env.MONGODB_URI);
  // Host and database name only (never the connection string), so it's clear which database this is
  console.log(`Database: ${mongoose.connection.name} on ${mongoose.connection.host}`);
  try {
    await migrate(dryRun);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
