// The AI cache and daily allowance, stored in MongoDB.
import { AiMessageModel, AiUsageModel } from "../models/Ai";
import type { AiStore, StoredMessage } from "./service";

const toStored = (doc: { type: string; refId: string; date: string; content: string; source: string; createdAt?: Date; updatedAt?: Date }): StoredMessage => ({
  type: doc.type as StoredMessage["type"],
  refId: doc.refId,
  date: doc.date,
  content: doc.content,
  source: doc.source as StoredMessage["source"],
  createdAt: doc.updatedAt ?? doc.createdAt ?? new Date(),
});

export const mongoAiStore: AiStore = {
  async find(key) {
    const doc = await AiMessageModel.findOne(key).lean();
    return doc ? toStored(doc) : null;
  },

  async save(key, message) {
    const doc = await AiMessageModel.findOneAndUpdate(
      key,
      { $set: { ...message, userId: key.userId } },
      { upsert: true, returnDocument: "after", runValidators: true },
    ).lean();
    return toStored(doc!);
  },

  /**
   * Adds one to today's count only while it is under the limit, in a single atomic step,
   * so two requests at once can't both slip past the limit.
   */
  async consume(userId, day, limit) {
    try {
      const res = await AiUsageModel.updateOne(
        { userId, date: day, count: { $lt: limit } },
        { $inc: { count: 1 } },
        { upsert: true },
      );
      return res.modifiedCount + res.upsertedCount > 0;
    } catch (err) {
      // Duplicate key: today's counter exists and is already at the limit
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  },
};

export async function usedToday(userId: string | undefined, day: string): Promise<number> {
  const doc = await AiUsageModel.findOne({ userId, date: day }).lean();
  return doc?.count ?? 0;
}
