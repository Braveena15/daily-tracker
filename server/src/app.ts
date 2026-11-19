import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { healthRouter } from "./routes/healthRoutes";
import { authRouter } from "./routes/authRoutes";
import { profileRouter } from "./routes/profileRoutes";
import { entriesRouter } from "./routes/entriesRoutes";
import { foodsRouter } from "./routes/foodsRoutes";
import { mealsRouter } from "./routes/mealsRoutes";
import { progressRouter } from "./routes/progressRoutes";
import { scoresRouter } from "./routes/scoresRoutes";
import {
  diaryRouter,
  liftRouter,
  purposeRouter,
  quotesRouter,
  thoughtsRouter,
  videosRouter,
  wellbeingRouter,
} from "./routes/mindRoutes";
import { errorHandler, notFound } from "./middleware/errorHandler";

export const app = express();

app.use(helmet());
// Only the client app may call the API with cookies
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
// A full day of meals (up to 100 items) needs a larger body than everything else
app.use("/api/meals", express.json({ limit: "100kb" }));
// Diary entries can be up to 20,000 characters (up to 4 bytes each); thought logs have several long fields
app.use("/api/diary", express.json({ limit: "100kb" }));
app.use("/api/thoughts", express.json({ limit: "64kb" }));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/entries", entriesRouter);
app.use("/api/foods", foodsRouter);
app.use("/api/meals", mealsRouter);
app.use("/api/scores", scoresRouter);
app.use("/api/progress", progressRouter);
app.use("/api/diary", diaryRouter);
app.use("/api/thoughts", thoughtsRouter);
app.use("/api/purpose", purposeRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/videos", videosRouter);
app.use("/api/wellbeing", wellbeingRouter);
app.use("/api/lift-me-up", liftRouter);

app.use(notFound);
app.use(errorHandler);
