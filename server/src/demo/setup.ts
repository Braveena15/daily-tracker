// Demo only (DEMO_MODE=true), run once the database is connected:
// 1. A TTL index on `expiresAt` in every collection that holds a user's data, so MongoDB itself
//    deletes demo accounts and everything in them once they expire, even while the server sleeps.
// 2. Delete anything already expired now (the TTL monitor runs about once a minute, and could be
//    behind after a long sleep).
// Never runs outside the demo, so a personal deployment gets no TTL index and nothing is deleted.
import type { Collection } from "mongoose";
import { AiMessageModel, AiUsageModel } from "../models/Ai";
import { DailyEntryModel } from "../models/DailyEntry";
import { FoodModel } from "../models/Food";
import { MealDayModel } from "../models/MealDay";
import { DiaryEntryModel, PurposeModel, QuoteModel, ThoughtLogModel, VideoModel } from "../models/Mind";
import { UserModel } from "../models/User";
import { WeeklyGoalModel } from "../models/WeeklyGoal";

/** Every model with a user's data (each has the demo expiry plugin), and the users themselves. */
type OwnedModel = {
  collection: Collection;
  deleteMany: (filter: Record<string, unknown>) => PromiseLike<{ deletedCount: number }>;
};

export const USER_OWNED_MODELS: OwnedModel[] = [
  UserModel,
  DailyEntryModel,
  FoodModel,
  MealDayModel,
  DiaryEntryModel,
  ThoughtLogModel,
  PurposeModel,
  QuoteModel,
  VideoModel,
  WeeklyGoalModel,
  AiMessageModel,
  AiUsageModel,
] as unknown as OwnedModel[];

export const DEMO_TTL_INDEX = "demo_expiresAt_ttl";

export async function createDemoTtlIndexes(): Promise<void> {
  await Promise.all(
    USER_OWNED_MODELS.map((model) =>
      model.collection.createIndex({ expiresAt: 1 }, { name: DEMO_TTL_INDEX, expireAfterSeconds: 0 }),
    ),
  );
}

/** Deletes every expired demo document. Returns how many demo accounts were removed. */
export async function deleteExpiredDemoData(now = new Date()): Promise<number> {
  const expired = { expiresAt: { $lte: now } };
  const [users] = await Promise.all(USER_OWNED_MODELS.map((model) => model.deleteMany(expired)));
  return users?.deletedCount ?? 0;
}

export async function prepareDemoDatabase(): Promise<void> {
  await createDemoTtlIndexes();
  const removed = await deleteExpiredDemoData();
  console.log(`🧪 Demo mode: TTL indexes ready${removed > 0 ? `, ${removed} expired demo account(s) removed` : ""}`);
}
