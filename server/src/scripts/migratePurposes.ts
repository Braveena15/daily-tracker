// Moves every day's single purpose into the list of purposes (several a day, each with its own
// intentions and rating) and its reflection note into the day's evening note.
//
//   npm run migrate:purposes              move
//   npm run migrate:purposes -- --dry-run  only count what would change
//
// Safe to run twice: days already moved are left alone. Text stays encrypted (it's moved, never
// decrypted). The server also runs this on start-up (services/migrations.ts). It only logs counts.

// Same DNS fix as src/index.ts, so mongodb+srv:// works on networks that block SRV lookups
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import mongoose from "mongoose";
import { env } from "../config/env";
import { migrateDailyPurposes } from "../services/migrations";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(env.MONGODB_URI);
  // Host and database name only (never the connection string), so it's clear which database this is
  console.log(`Database: ${mongoose.connection.name} on ${mongoose.connection.host}`);
  try {
    const r = await migrateDailyPurposes(dryRun);
    if (dryRun) console.log("Dry run: nothing was written.");
    console.log(`Days with an old purpose: ${r.scanned}`);
    console.log(`Days moved:               ${r.days}`);
    console.log(`Purposes:                 ${r.purposes}`);
    console.log(`Intentions carried:       ${r.intentions}`);
    console.log(`Ratings carried:          ${r.ratings}`);
    console.log(`Evening notes moved:      ${r.notes}`);
    if (r.scanned === 0) console.log("Nothing to do: every day already uses the list of purposes ✓");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
