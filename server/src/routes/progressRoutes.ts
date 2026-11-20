import { Router } from "express";
import { getInsights, getJourney, getSleep, getWeeklyReview, getWeight } from "../controllers/progressController";
import { requireAuth } from "../middleware/requireAuth";

export const progressRouter = Router();

progressRouter.use(requireAuth);

progressRouter.get("/weight", getWeight);
progressRouter.get("/weekly-review", getWeeklyReview);
progressRouter.get("/journey", getJourney);
progressRouter.get("/insights", getInsights);
progressRouter.get("/sleep", getSleep);
