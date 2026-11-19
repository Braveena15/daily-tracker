import { Router } from "express";
import { copyMeals, getLowIntake, getMealDay, getWeeklyStats, saveMealDay } from "../controllers/mealsController";
import { requireAuth } from "../middleware/requireAuth";

export const mealsRouter = Router();

mealsRouter.use(requireAuth);

// Fixed paths come before "/:date" so "stats" isn't treated as a date
mealsRouter.get("/stats/weekly", getWeeklyStats);
mealsRouter.get("/stats/low-intake", getLowIntake);

mealsRouter.get("/:date", getMealDay);
mealsRouter.put("/:date", saveMealDay);
mealsRouter.post("/:date/copy", copyMeals);
