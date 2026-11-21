import { Router } from "express";
import {
  addEntry,
  deleteByDate,
  deleteEntry,
  getByDate,
  getStreak,
  getToday,
  listEntries,
  saveDaily,
  updateEntry,
} from "../controllers/entriesController";
import { requireAuth } from "../middleware/requireAuth";

export const entriesRouter = Router();

entriesRouter.use(requireAuth);

// Fixed paths come before "/:date" so "today" isn't treated as a date
entriesRouter.get("/", listEntries);
entriesRouter.get("/today", getToday);
entriesRouter.get("/stats/streak", getStreak);

entriesRouter.get("/:date", getByDate);
entriesRouter.delete("/:date", deleteByDate);
// Single daily values (weight, steps, active calories)
entriesRouter.put("/:date/daily", saveDaily);
// Timestamped entries: kind = moods | workouts | mental | outdoor | goodThings | learnings | presentMoments
entriesRouter.post("/:date/:kind", addEntry);
entriesRouter.patch("/:date/:kind/:id", updateEntry);
entriesRouter.delete("/:date/:kind/:id", deleteEntry);
