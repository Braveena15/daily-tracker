import { Router } from "express";
import {
  copyMeals,
  getDailyStats,
  getLowIntake,
  getMealDay,
  getWeeklyStats,
  saveMealDay,
} from "../controllers/mealsController";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";

export const mealsRouter = Router();

mealsRouter.use(requireAuth, blockDemoWrites);

// Fixed paths come before "/:date" so "stats" isn't treated as a date
mealsRouter.get("/stats/weekly", getWeeklyStats);
mealsRouter.get("/stats/daily", getDailyStats);
mealsRouter.get("/stats/low-intake", getLowIntake);

mealsRouter.get("/:date", getMealDay);
mealsRouter.put("/:date", saveMealDay);
mealsRouter.post("/:date/copy", copyMeals);
