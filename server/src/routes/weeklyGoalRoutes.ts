import { Router } from "express";
import { deleteWeeklyGoal, getWeeklyGoals, saveWeeklyGoal, updateWeeklyGoal } from "../controllers/weeklyGoalController";
import { requireAuth } from "../middleware/requireAuth";

// Next week's goal, set from the Weekly review
export const weeklyGoalRouter = Router();

weeklyGoalRouter.use(requireAuth);

weeklyGoalRouter.get("/", getWeeklyGoals);
weeklyGoalRouter.put("/", saveWeeklyGoal);
weeklyGoalRouter.patch("/:id", updateWeeklyGoal);
weeklyGoalRouter.delete("/:id", deleteWeeklyGoal);
