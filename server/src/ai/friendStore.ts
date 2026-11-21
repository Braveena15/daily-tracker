// The AI friend's conversations in MongoDB: one AiMessage (type "friend") per thought log, with the
// whole conversation encrypted (DIARY_ENCRYPTION_KEY). Reuses the shared daily AI allowance.
import { AiMessageModel } from "../models/Ai";
import type { FieldCrypto } from "../utils/crypto";
import { openConversation, sealConversation, type FriendStore } from "./friend";
import { mongoAiStore } from "./mongoStore";

export function createFriendStore(crypto: FieldCrypto): FriendStore {
  return {
    async load(userId, thoughtId) {
      const doc = await AiMessageModel.findOne({ userId, type: "friend", refId: thoughtId }).select("content").lean();
      return doc ? openConversation(crypto, doc.content) : null;
    },
    async save(userId, thoughtId, date, conversation) {
      await AiMessageModel.updateOne(
        { userId, type: "friend", refId: thoughtId },
        { $set: { userId, date, content: sealConversation(crypto, conversation), source: conversation.reply.source } },
        { upsert: true, runValidators: true },
      );
    },
    consume: (userId, day, limit) => mongoAiStore.consume(userId, day, limit),
  };
}
