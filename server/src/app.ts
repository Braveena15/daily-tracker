import path from "node:path";
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
import { weeklyGoalRouter } from "./routes/weeklyGoalRoutes";
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
import { aiRouter } from "./routes/aiRoutes";
import { healthSyncRouter } from "./routes/healthSyncRoutes";
import { programPhotosRouter, programsRouter } from "./routes/programRoutes";
import { expensesRouter, receiptsRouter, storageRouter } from "./routes/expensesRoutes";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import { serveClient } from "./middleware/serveClient";
import { demoRestrictions } from "./demo/restrictions";
import { demoRouter } from "./routes/demoRoutes";

export const app = express();

// Render (and most hosts) put a proxy in front of the app. Trusting the first hop gives the real
// client IP to the rate limiters and lets Express see the original https for secure cookies.
app.set("trust proxy", 1);

// Development only: one log line per request (method, path, status, time). Never tokens or bodies.
if (!env.isProduction) app.use(requestLogger);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // Videos on the Motivation and Lift pages are privacy-enhanced YouTube embeds
        "frame-src": ["https://www.youtube-nocookie.com"],
        // Render serves everything over https already; this would break a local production test on http
        "upgrade-insecure-requests": null,
      },
    },
  }),
);
// Development only: the Vite dev server runs on another origin. In production the client is served
// from this same server, so no cross-origin requests are allowed at all.
if (env.CLIENT_URL && !env.isProduction) app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
// A full day of meals (up to 100 items) needs a larger body than everything else
app.use("/api/meals", express.json({ limit: "100kb" }));
// Diary entries can be up to 20,000 characters (up to 4 bytes each); thought logs have several long fields
app.use("/api/diary", express.json({ limit: "100kb" }));
app.use("/api/thoughts", express.json({ limit: "64kb" }));
// A program holds a few longer texts (why, goal notes, reflections)
app.use("/api/programs", express.json({ limit: "64kb" }));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Public demo only: some features are refused, and "Try the demo" creates temporary accounts
if (env.demoMode) {
  app.use(demoRestrictions);
  app.use("/api/demo", demoRouter);
}

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/entries", entriesRouter);
app.use("/api/foods", foodsRouter);
app.use("/api/meals", mealsRouter);
app.use("/api/programs", programsRouter);
app.use("/api/program-photos", programPhotosRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/receipts", receiptsRouter);
app.use("/api/storage", storageRouter);
app.use("/api/scores", scoresRouter);
app.use("/api/progress", progressRouter);
app.use("/api/weekly-goals", weeklyGoalRouter);
app.use("/api/diary", diaryRouter);
app.use("/api/thoughts", thoughtsRouter);
app.use("/api/purpose", purposeRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/videos", videosRouter);
app.use("/api/wellbeing", wellbeingRouter);
app.use("/api/lift-me-up", liftRouter);
app.use("/api/ai", aiRouter);
app.use("/api/health-sync", healthSyncRouter);

// Production: the built client (client/dist), with index.html for every other page
if (env.isProduction) app.use(serveClient(path.resolve(__dirname, "../../client/dist")));

app.use(notFound);
app.use(errorHandler);
