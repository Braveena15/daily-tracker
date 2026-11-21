// Dev-only: creates (or recreates) a demo account with 60 days of data, so the charts have
// something to show.
//
//   npm run seed:demo         create or refresh demo@example.com / demo-password-123
//   npm run seed:demo:clear   delete the demo account and all its data
//
// Safety: refuses to run when NODE_ENV=production, and only ever touches the account with
// the demo email and documents whose userId is that account's id. No other user is read or changed.

// Same DNS fix as src/index.ts, so mongodb+srv:// works on networks that block SRV lookups
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { env } from "../config/env";
import { seedSampleData, sampleProfile, DEMO_DAYS } from "../demo/seed";
import { AiMessageModel, AiUsageModel } from "../models/Ai";
import { DailyEntryModel } from "../models/DailyEntry";
import { FoodModel } from "../models/Food";
import { MealDayModel } from "../models/MealDay";
import { DiaryEntryModel, PurposeModel, QuoteModel, ThoughtLogModel, VideoModel } from "../models/Mind";
import { UserModel } from "../models/User";
import { WeeklyGoalModel } from "../models/WeeklyGoal";
import { todayInTimezone } from "../utils/dates";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password-123";

async function clearDemo(): Promise<boolean> {
  const user = await UserModel.findOne({ email: DEMO_EMAIL }).select("_id");
  if (!user) return false;
  // Every delete is limited to the demo user's id
  const mine = { userId: user._id };
  await Promise.all(
    [DailyEntryModel, MealDayModel, FoodModel, DiaryEntryModel, ThoughtLogModel, PurposeModel, QuoteModel, VideoModel, WeeklyGoalModel, AiMessageModel, AiUsageModel].map(
      (model) => (model as typeof FoodModel).deleteMany(mine),
    ),
  );
  await UserModel.deleteOne({ _id: user._id, email: DEMO_EMAIL });
  return true;
}

async function seedDemo(): Promise<void> {
  await clearDemo();

  const today = todayInTimezone();
  const user = await UserModel.create({
    ...sampleProfile(today),
    email: DEMO_EMAIL,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
  });
  const { days, mealDays } = await seedSampleData(user._id, today);

  console.log(`✅ Demo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   ${days} logged days and ${mealDays} days of meals over the last ${DEMO_DAYS} days.`);
}

async function main(): Promise<void> {
  if (env.isProduction || process.env.NODE_ENV === "production") {
    console.error("❌ Refusing to run the demo seed with NODE_ENV=production.");
    process.exit(1);
  }

  const clearOnly = process.argv.includes("--clear");
  await mongoose.connect(env.MONGODB_URI);
  try {
    if (clearOnly) {
      console.log((await clearDemo()) ? `🧹 Removed the demo account (${DEMO_EMAIL}) and its data.` : "Nothing to clear.");
    } else {
      await seedDemo();
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("❌ Demo seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
