import { Router } from "express";
import {
  aiStatus,
  boost,
  dailyNote,
  thoughtEncouragement,
  updateAiSettings,
  weeklyReflection,
} from "../controllers/aiController";
import { aiRateLimit } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/requireAuth";

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.get("/status", aiStatus);
aiRouter.put("/settings", updateAiSettings);

// Add ?regenerate=true to ask for a fresh message (still counts towards the daily limit)
aiRouter.post("/thought/:id", aiRateLimit, thoughtEncouragement);
aiRouter.post("/daily/:date", aiRateLimit, dailyNote);
aiRouter.get("/weekly", aiRateLimit, weeklyReflection);
aiRouter.post("/boost", aiRateLimit, boost);
