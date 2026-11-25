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
  setWaterTotal,
  setMissedReason,
  clearMissedReason,
  updateEntry,
} from "../controllers/entriesController";
import {
  addIntention,
  addPurpose,
  deleteIntention,
  deletePurpose,
  saveReflectionNote,
  updateIntention,
  updatePurpose,
} from "../controllers/dailyPurposeController";
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
// The day's water total, typed in (replaces the day's drinks with one entry)
entriesRouter.put("/:date/water/total", setWaterTotal);
// Why a day wasn't logged (today or yesterday only); it never counts as logging the day
entriesRouter.put("/:date/missed-reason", setMissedReason);
entriesRouter.delete("/:date/missed-reason", clearMissedReason);
// What matters today (up to 5), each with its intensity and optional intentions, and the day's evening note.
// Before "/:date/:kind…" so "purposes" isn't treated as a kind of entry.
entriesRouter.post("/:date/purposes", addPurpose);
entriesRouter.patch("/:date/purposes/:purposeId", updatePurpose);
entriesRouter.delete("/:date/purposes/:purposeId", deletePurpose);
entriesRouter.post("/:date/purposes/:purposeId/intentions", addIntention);
entriesRouter.patch("/:date/purposes/:purposeId/intentions/:intentionId", updateIntention);
entriesRouter.delete("/:date/purposes/:purposeId/intentions/:intentionId", deleteIntention);
entriesRouter.put("/:date/reflection-note", saveReflectionNote);
// Timestamped entries: kind = moods | workouts | mental | outdoor | goodThings | learnings | presentMoments
entriesRouter.post("/:date/:kind", addEntry);
entriesRouter.patch("/:date/:kind/:id", updateEntry);
entriesRouter.delete("/:date/:kind/:id", deleteEntry);
