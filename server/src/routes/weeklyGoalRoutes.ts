import { Router } from "express";
import { deleteWeeklyGoal, getWeeklyGoals, saveWeeklyGoal, updateWeeklyGoal } from "../controllers/weeklyGoalController";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";

// Next week's goal, set from the Weekly review
export const weeklyGoalRouter = Router();

weeklyGoalRouter.use(requireAuth, blockDemoWrites);

weeklyGoalRouter.get("/", getWeeklyGoals);
weeklyGoalRouter.put("/", saveWeeklyGoal);
weeklyGoalRouter.patch("/:id", updateWeeklyGoal);
weeklyGoalRouter.delete("/:id", deleteWeeklyGoal);
