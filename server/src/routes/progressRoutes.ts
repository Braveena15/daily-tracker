import { Router } from "express";
import { getInsights, getJourney, getSleep, getWater, getWeeklyReview, getWeight } from "../controllers/progressController";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";

export const progressRouter = Router();

progressRouter.use(requireAuth, blockDemoWrites);

progressRouter.get("/weight", getWeight);
progressRouter.get("/weekly-review", getWeeklyReview);
progressRouter.get("/journey", getJourney);
progressRouter.get("/insights", getInsights);
progressRouter.get("/sleep", getSleep);
progressRouter.get("/water", getWater);
