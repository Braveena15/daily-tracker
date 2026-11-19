import { Router } from "express";
import { getDayScores, listScores } from "../controllers/scoresController";
import { requireAuth } from "../middleware/requireAuth";

export const scoresRouter = Router();

scoresRouter.use(requireAuth);

scoresRouter.get("/", listScores);
scoresRouter.get("/:date", getDayScores);
