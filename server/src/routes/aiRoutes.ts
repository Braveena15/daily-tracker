import { Router } from "express";
import {
  aiStatus,
  boost,
  dailyNote,
  thoughtEncouragement,
  updateAiSettings,
  weeklyReflection,
} from "../controllers/aiController";
import { getFriendConversation, saveFriendFeedback, sendFriendMessage, startFriend } from "../controllers/aiFriendController";
import { aiRateLimit } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";

export const aiRouter = Router();

aiRouter.use(requireAuth, blockDemoWrites);

aiRouter.get("/status", aiStatus);
aiRouter.put("/settings", updateAiSettings);

// Add ?regenerate=true to ask for a fresh message (still counts towards the daily limit)
aiRouter.post("/thought/:id", aiRateLimit, thoughtEncouragement);
aiRouter.post("/daily/:date", aiRateLimit, dailyNote);
aiRouter.get("/weekly", aiRateLimit, weeklyReflection);
aiRouter.post("/boost", aiRateLimit, boost);

// The AI friend in the Thought log. Sending needs { consent: true }; private logs are refused.
aiRouter.get("/friend/:thoughtId", getFriendConversation);
aiRouter.post("/friend/:thoughtId", aiRateLimit, startFriend);
aiRouter.post("/friend/:thoughtId/messages", aiRateLimit, sendFriendMessage);
aiRouter.put("/friend/:thoughtId/feedback", saveFriendFeedback);
