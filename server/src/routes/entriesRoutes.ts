import { Router } from "express";
import {
  deleteByDate,
  getByDate,
  getStreak,
  getToday,
  listEntries,
  saveByDate,
} from "../controllers/entriesController";
import { requireAuth } from "../middleware/requireAuth";

export const entriesRouter = Router();

entriesRouter.use(requireAuth);

// Fixed paths come before "/:date" so "today" isn't treated as a date
entriesRouter.get("/", listEntries);
entriesRouter.get("/today", getToday);
entriesRouter.get("/stats/streak", getStreak);

entriesRouter.get("/:date", getByDate);
entriesRouter.put("/:date", saveByDate);
entriesRouter.delete("/:date", deleteByDate);
