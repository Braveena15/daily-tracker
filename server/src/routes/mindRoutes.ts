// Routes for the "Mind" section. Every route needs a logged-in user.
import { Router } from "express";
import {
  createDiaryEntry,
  deleteDiaryEntry,
  getDiaryEntry,
  listDiary,
  updateDiaryEntry,
} from "../controllers/diaryController";
import {
  createQuote,
  createVideo,
  deleteQuote,
  deleteVideo,
  getPurpose,
  liftMeUp,
  listQuotes,
  listVideos,
  savePurpose,
  updateQuote,
  updateVideo,
  wellbeingCheck,
} from "../controllers/mindController";
import {
  createThought,
  deleteThought,
  getThought,
  getThoughtStats,
  listThoughts,
  updateThought,
} from "../controllers/thoughtsController";
import { getPurposeHistory, listPurposeDays, purposeSuggestionList } from "../controllers/dailyPurposeController";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";

export const diaryRouter = Router().use(requireAuth, blockDemoWrites);
diaryRouter.get("/", listDiary);
diaryRouter.post("/", createDiaryEntry);
diaryRouter.get("/:id", getDiaryEntry);
diaryRouter.put("/:id", updateDiaryEntry);
diaryRouter.delete("/:id", deleteDiaryEntry);

export const thoughtsRouter = Router().use(requireAuth, blockDemoWrites);
thoughtsRouter.get("/", listThoughts);
thoughtsRouter.get("/stats", getThoughtStats); // before "/:id" so "stats" isn't treated as an id
thoughtsRouter.post("/", createThought);
thoughtsRouter.get("/:id", getThought);
thoughtsRouter.put("/:id", updateThought);
thoughtsRouter.delete("/:id", deleteThought);

export const purposeRouter = Router().use(requireAuth, blockDemoWrites);
purposeRouter.get("/", getPurpose);
purposeRouter.put("/", savePurpose);
purposeRouter.get("/days", listPurposeDays);
purposeRouter.get("/suggestions", purposeSuggestionList);
purposeRouter.get("/history", getPurposeHistory);

export const quotesRouter = Router().use(requireAuth, blockDemoWrites);
quotesRouter.get("/", listQuotes);
quotesRouter.post("/", createQuote);
quotesRouter.put("/:id", updateQuote);
quotesRouter.delete("/:id", deleteQuote);

export const videosRouter = Router().use(requireAuth, blockDemoWrites);
videosRouter.get("/", listVideos);
videosRouter.post("/", createVideo);
videosRouter.put("/:id", updateVideo);
videosRouter.delete("/:id", deleteVideo);

export const wellbeingRouter = Router().use(requireAuth, blockDemoWrites);
wellbeingRouter.get("/check", wellbeingCheck);

export const liftRouter = Router().use(requireAuth, blockDemoWrites);
liftRouter.get("/", liftMeUp);
