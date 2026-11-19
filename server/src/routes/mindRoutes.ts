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
import { requireAuth } from "../middleware/requireAuth";

export const diaryRouter = Router().use(requireAuth);
diaryRouter.get("/", listDiary);
diaryRouter.post("/", createDiaryEntry);
diaryRouter.get("/:id", getDiaryEntry);
diaryRouter.put("/:id", updateDiaryEntry);
diaryRouter.delete("/:id", deleteDiaryEntry);

export const thoughtsRouter = Router().use(requireAuth);
thoughtsRouter.get("/", listThoughts);
thoughtsRouter.get("/stats", getThoughtStats); // before "/:id" so "stats" isn't treated as an id
thoughtsRouter.post("/", createThought);
thoughtsRouter.get("/:id", getThought);
thoughtsRouter.put("/:id", updateThought);
thoughtsRouter.delete("/:id", deleteThought);

export const purposeRouter = Router().use(requireAuth);
purposeRouter.get("/", getPurpose);
purposeRouter.put("/", savePurpose);

export const quotesRouter = Router().use(requireAuth);
quotesRouter.get("/", listQuotes);
quotesRouter.post("/", createQuote);
quotesRouter.put("/:id", updateQuote);
quotesRouter.delete("/:id", deleteQuote);

export const videosRouter = Router().use(requireAuth);
videosRouter.get("/", listVideos);
videosRouter.post("/", createVideo);
videosRouter.put("/:id", updateVideo);
videosRouter.delete("/:id", deleteVideo);

export const wellbeingRouter = Router().use(requireAuth);
wellbeingRouter.get("/check", wellbeingCheck);

export const liftRouter = Router().use(requireAuth);
liftRouter.get("/", liftMeUp);
