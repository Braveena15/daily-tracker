import { Router } from "express";
import { getDayScores, listScores } from "../controllers/scoresController";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";

export const scoresRouter = Router();

scoresRouter.use(requireAuth, blockDemoWrites);

scoresRouter.get("/", listScores);
scoresRouter.get("/:date", getDayScores);
