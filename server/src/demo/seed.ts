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
    intentions: p.intentions.map((i) => ({ ...i, text: fieldCrypto.encrypt(i.text) })),
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

  return { days: entries.length, mealDays: mealDays.length };
}
