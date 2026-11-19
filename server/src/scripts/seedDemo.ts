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
import { DailyEntryModel } from "../models/DailyEntry";
import { FoodModel } from "../models/Food";
import { MealDayModel } from "../models/MealDay";
import { UserModel } from "../models/User";
import { addDays, todayInTimezone } from "../utils/dates";
import { DEMO_FOODS, DEMO_PROFILE, generateDemoData } from "./demoData";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password-123";
const DAYS = 60;

async function clearDemo(): Promise<boolean> {
  const user = await UserModel.findOne({ email: DEMO_EMAIL }).select("_id");
  if (!user) return false;
  // Every delete is limited to the demo user's id
  await Promise.all([
    DailyEntryModel.deleteMany({ userId: user._id }),
    MealDayModel.deleteMany({ userId: user._id }),
    FoodModel.deleteMany({ userId: user._id }),
  ]);
  await UserModel.deleteOne({ _id: user._id, email: DEMO_EMAIL });
  return true;
}

async function seedDemo(): Promise<void> {
  await clearDemo();

  const today = todayInTimezone();
  const { entries, mealDays } = generateDemoData(today, DAYS);
  const latestWeight = [...entries].reverse().find((e) => e.weightKg !== undefined)?.weightKg ?? 84;

  const user = await UserModel.create({
    ...DEMO_PROFILE,
    email: DEMO_EMAIL,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
    currentWeightKg: latestWeight,
    journeyStartDate: addDays(today, -(DAYS - 1)),
  });

  const foods = await FoodModel.insertMany(DEMO_FOODS.map((f) => ({ ...f, userId: user._id })));
  const foodByName = new Map(foods.map((f) => [f.name, f]));

  await DailyEntryModel.insertMany(entries.map((e) => ({ ...e, userId: user._id })));
  await MealDayModel.insertMany(
    mealDays.map((day) => ({
      userId: user._id,
      date: day.date,
      items: day.items.map(({ mealType, foodName, servings }) => {
        const food = foodByName.get(foodName)!;
        return {
          mealType,
          foodId: food._id,
          name: food.name,
          servingDescription: food.servingDescription,
          servings,
          kcalPerServing: food.kcalPerServing,
          proteinG: food.proteinG ?? undefined,
          carbsG: food.carbsG ?? undefined,
          fatG: food.fatG ?? undefined,
        };
      }),
    })),
  );

  // Usage counts, so "Recent" in the food picker looks real
  for (const food of foods) {
    const usedOn = mealDays.filter((d) => d.items.some((i) => i.foodName === food.name)).map((d) => d.date);
    if (usedOn.length === 0) continue;
    await FoodModel.updateOne(
      { _id: food._id, userId: user._id },
      { $set: { timesUsed: usedOn.length, lastUsedAt: new Date(`${usedOn.at(-1)}T12:00:00Z`) } },
    );
  }

  console.log(`✅ Demo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   ${entries.length} check-ins and ${mealDays.length} days of meals over the last ${DAYS} days.`);
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
