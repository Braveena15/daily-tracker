// Fills one account with ~60 days of sample data (scripts/demoData.ts), stored exactly as the API
// would store it: purpose, diary, thought-log and weekly-goal text is encrypted.
// Used by the public demo (demo/controller.ts, every document expiring with the account) and by the
// dev-only seed script (scripts/seedDemo.ts, nothing expiring).
import type { Types } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { DailyEntryModel } from "../models/DailyEntry";
import { FoodModel } from "../models/Food";
import { MealDayModel } from "../models/MealDay";
import { DiaryEntryModel, PurposeModel, ThoughtLogModel } from "../models/Mind";
import { WeeklyGoalModel } from "../models/WeeklyGoal";
import { ExpenseModel } from "../models/Expense";
import { DEMO_FOODS, DEMO_PROFILE, DEMO_PURPOSE, generateDemoData, generateDemoMind, type DemoDailyPurpose } from "../scripts/demoData";
import { addDays } from "../utils/dates";

export const DEMO_DAYS = 60;

/** Profile fields for a sample account whose data ends on `today`. */
export function sampleProfile(today: string) {
  const { entries } = generateDemoData(today, DEMO_DAYS);
  const latestWeight = [...entries].reverse().find((e) => e.weightKg !== undefined)?.weightKg ?? 84;
  return { ...DEMO_PROFILE, currentWeightKg: latestWeight, journeyStartDate: addDays(today, -(DEMO_DAYS - 1)) };
}

const encryptPurposes = (purposes: DemoDailyPurpose[]) =>
  purposes.map((p) => ({
    ...p,
    text: fieldCrypto.encrypt(p.text),
  }));

/** Inserts the sample data for `userId`. With `expiresAt`, every document gets it (the demo's TTL). */
export async function seedSampleData(userId: Types.ObjectId, today: string, expiresAt?: Date): Promise<{ days: number; mealDays: number }> {
  const expiry = expiresAt ? { expiresAt } : {};
  const owned = { userId, ...expiry };
  const { entries, mealDays } = generateDemoData(today, DEMO_DAYS);
  const { diary, thoughts, weeklyGoals } = generateDemoMind(today);

  const foods = await FoodModel.insertMany(DEMO_FOODS.map((f) => ({ ...f, ...owned })));
  const foodByName = new Map(foods.map((f) => [f.name, f]));

  await Promise.all([
    DailyEntryModel.insertMany(
      entries.map(({ dailyPurposes, dailyReflectionNote, ...e }) => ({
        ...e,
        ...owned,
        ...(dailyPurposes && { dailyPurposes: encryptPurposes(dailyPurposes) }),
        ...(dailyReflectionNote && { dailyReflectionNote: fieldCrypto.encrypt(dailyReflectionNote) }),
      })),
    ),
    MealDayModel.insertMany(
      mealDays.map((day) => ({
        ...owned,
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
            fiberG: food.fiberG ?? undefined,
          };
        }),
      })),
    ),
    PurposeModel.create({ ...owned, ...DEMO_PURPOSE }),
    DiaryEntryModel.insertMany(
      diary.map((d) => ({ ...owned, ...d, title: fieldCrypto.encrypt(d.title), body: fieldCrypto.encrypt(d.body) })),
    ),
    ThoughtLogModel.insertMany(
      thoughts.map((t) => ({
        ...owned,
        date: t.date,
        feelings: t.feelings,
        distortions: t.distortions,
        intensityAfter: t.intensityAfter,
        smallStepDone: t.smallStepDone,
        ...(t.smallStepDone && { smallStepDoneAt: new Date(`${t.date}T18:00:00+05:30`) }),
        thought: fieldCrypto.encrypt(t.thought),
        situation: fieldCrypto.encrypt(t.situation),
        evidenceFor: fieldCrypto.encrypt(t.evidenceFor),
        evidenceAgainst: fieldCrypto.encrypt(t.evidenceAgainst),
        friendAdvice: fieldCrypto.encrypt(t.friendAdvice),
        balancedThought: fieldCrypto.encrypt(t.balancedThought),
        smallStep: fieldCrypto.encrypt(t.smallStep),
      })),
    ),
    WeeklyGoalModel.insertMany(
      weeklyGoals.map((g) => ({
        ...owned,
        ...g,
        text: fieldCrypto.encrypt(g.text),
        doneAt: g.done ? new Date(`${g.weekEnd}T19:00:00+05:30`) : null,
      })),
    ),
  ]);

  // Usage counts, so "Recent" in the food picker looks real
  await FoodModel.bulkWrite(
    foods.flatMap((food) => {
      const usedOn = mealDays.filter((d) => d.items.some((i) => i.foodName === food.name)).map((d) => d.date);
      if (usedOn.length === 0) return [];
      return [
        {
          updateOne: {
            filter: { _id: food._id, userId },
            update: { $set: { timesUsed: usedOn.length, lastUsedAt: new Date(`${usedOn.at(-1)}T12:00:00Z`) } },
          },
        },
      ];
    }),
  );

  await ExpenseModel.insertMany(
    sampleExpenses(today).map((e) => ({
      ...e,
      ...owned,
      title: fieldCrypto.encrypt(e.title),
    })),
  );

  return { days: entries.length, mealDays: mealDays.length };
}

const SAMPLE_EXPENSES = [
  { title: "Lunch with a friend", category: "food", amount: 1850, paymentMethod: "card" },
  { title: "Bus to work", category: "transport", amount: 120, paymentMethod: "cash" },
  { title: "Groceries", category: "food", amount: 4320.5, paymentMethod: "card" },
  { title: "Phone bill", category: "bills", amount: 1990, paymentMethod: "online" },
  { title: "Pharmacy", category: "health", amount: 760, paymentMethod: "cash" },
  { title: "Book about habits", category: "education", amount: 2450, paymentMethod: "card" },
  { title: "Tuk-tuk home", category: "transport", amount: 450, paymentMethod: "cash" },
  { title: "Cinema", category: "entertainment", amount: 1500, paymentMethod: "card" },
] as const;

/**
 * About two weeks of made-up expenses, some with a receipt. Receipts point at "sample-…" ids: the
 * demo shows a placeholder image for them, and no file is ever stored.
 */
export function sampleExpenses(today: string) {
  const out = [];
  let n = 0;
  for (let d = 13; d >= 0; d--) {
    const date = addDays(today, -d);
    const count = (d * 7) % 3 === 0 ? 1 : (d % 4) + 1;
    for (let i = 0; i < count; i++) {
      const s = SAMPLE_EXPENSES[n % SAMPLE_EXPENSES.length]!;
      n++;
      out.push({
        date,
        amount: s.amount,
        currency: "LKR",
        category: s.category,
        title: s.title,
        paymentMethod: s.paymentMethod,
        receipts:
          n % 3 === 0
            ? [{ fileId: `sample-${n}`, filename: "sample-receipt.svg", mimeType: "image/svg+xml", size: 2400, uploadedAt: new Date(`${date}T12:00:00+05:30`) }]
            : [],
      });
    }
  }
  return out;
}
