// AI encouragement routes. Each one gathers the person's own words for the safety check
// (never sent anywhere), and a function that builds the AI payload via ai/buildContext.ts
// (the only place AI payloads are made). ai/service.ts decides whether the AI is used at all.
import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import {
  buildBoostContext,
  buildDailyContext,
  buildThoughtContext,
  buildWeeklyContext,
  entryText,
  isLowMoodToday,
  thoughtText,
  type ThoughtInput,
} from "../ai/buildContext";
import { usedToday } from "../ai/mongoStore";
import { getEncouragement, type AiRequest, type AiResult } from "../ai/service";
import { aiConfigured, aiDeps, aiMode } from "../config/ai";
import { fieldCrypto } from "../config/encryption";
import { openDailyPurpose, purposeText, type StoredDailyPurpose } from "../utils/dailyPurpose";
import { CHECKED_IN, DailyEntryModel } from "../models/DailyEntry";
import { PurposeModel, ThoughtLogModel } from "../models/Mind";
import { UserModel } from "../models/User";
import { loadDays, loadUserContext, scoresFor, toScoreEntry } from "../services/dayData";
import { computeInsights, computeWeeklyReview } from "../services/progressData";
import { AppError } from "../utils/AppError";
import { addDays, isValidDateString, listDates, todayInTimezone } from "../utils/dates";
import { journeyStart } from "../services/journey";
import { streaksSince } from "../utils/journey";

const today = () => todayInTimezone();
const wantsRegenerate = (req: Request) => req.query.regenerate === "true";

const THOUGHT_TEXT = ["thought", "situation", "evidenceFor", "evidenceAgainst", "friendAdvice", "balancedThought", "smallStep"] as const;

type ThoughtDoc = {
  date: string;
  feelings: { name: string; intensityBefore: number }[];
  distortions: string[];
  smallStepDone: boolean;
  intensityAfter?: number | null;
  isPrivate: boolean;
} & Partial<Record<(typeof THOUGHT_TEXT)[number], string | null>>;

/** A stored thought log, decrypted, in the shape buildContext expects. */
function toThoughtInput(doc: ThoughtDoc): ThoughtInput {
  const text = (field: (typeof THOUGHT_TEXT)[number]) => (doc[field] ? (fieldCrypto.tryDecrypt(doc[field]) ?? "") : "");
  return {
    date: doc.date,
    thought: text("thought"),
    situation: text("situation"),
    feelings: doc.feelings.map((f) => ({ name: f.name, intensityBefore: f.intensityBefore })),
    distortions: doc.distortions,
    evidenceFor: text("evidenceFor"),
    evidenceAgainst: text("evidenceAgainst"),
    friendAdvice: text("friendAdvice"),
    balancedThought: text("balancedThought"),
    smallStep: text("smallStep"),
    smallStepDone: doc.smallStepDone,
    intensityAfter: doc.intensityAfter ?? null,
    isPrivate: doc.isPrivate,
  };
}

/** The user (for the AI on/off setting) and today's mood check-ins (for the low-mood reminder). */
async function basics(userId: string | undefined) {
  const [user, todayEntry] = await Promise.all([
    UserModel.findById(userId).select("aiEnabled").lean(),
    DailyEntryModel.findOne({ userId, date: today() }).select("date moodLogs.mood").lean(),
  ]);
  if (!user) throw new AppError(401, "Please log in to continue");
  return { userEnabled: user.aiEnabled !== false, lowMood: isLowMoodToday(todayEntry, today()) };
}

/** Thought-log text from a date range — only for the safety check, never sent to the AI. */
async function recentThoughtText(userId: string | undefined, from: string, to: string): Promise<string[]> {
  const docs = await ThoughtLogModel.find({ userId, date: { $gte: from, $lte: to } }).lean();
  return docs.flatMap((d) => thoughtText(toThoughtInput(d as ThoughtDoc)));
}

async function send(req: Request, res: Response, request: Omit<AiRequest, "userId" | "today" | "regenerate">) {
  const result: AiResult = await getEncouragement(aiDeps, {
    ...request,
    userId: req.userId!,
    today: today(),
    regenerate: wantsRegenerate(req),
  });
  res.json({ ...result, usedToday: await usedToday(req.userId, today()), limit: aiDeps.limit });
}

function dateParam(value: unknown): string {
  if (!isValidDateString(value)) throw new AppError(400, "Date must be a real date in YYYY-MM-DD format");
  if (value > today()) throw new AppError(400, "That day hasn't happened yet");
  return value;
}

// ---------- Routes ----------

/** POST /api/ai/thought/:id — encouragement after finishing a thought log. */
export async function thoughtEncouragement(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await ThoughtLogModel.findOne({ _id: id, userId: req.userId }).lean() : null;
  if (!doc) throw new AppError(404, "Thought log not found");

  const log = toThoughtInput(doc as ThoughtDoc);
  const { userEnabled, lowMood } = await basics(req.userId);
  await send(req, res, {
    task: "thought",
    refId: String(id),
    date: log.date,
    userEnabled,
    lowMood,
    safetyText: thoughtText(log),
    buildContext: () => buildThoughtContext(log, aiMode, today()),
  });
}

/** POST /api/ai/daily/:date — a short note for tomorrow after that day's check-in. */
export async function dailyNote(req: Request, res: Response): Promise<void> {
  const date = dateParam(req.params.date);
  const [ctx, { entries, mealKcal }, { userEnabled, lowMood }] = await Promise.all([
    loadUserContext(req.userId),
    loadDays(req.userId, date, date),
    basics(req.userId),
  ]);
  const stored = entries.get(date);
  if (!stored) throw new AppError(400, "Check in for this day first");

  const entry = toScoreEntry(stored);
  const purpose = openDailyPurpose(fieldCrypto, stored.dailyPurpose as StoredDailyPurpose | undefined);
  const s = scoresFor(ctx, stored, mealKcal.get(date));
  const eaten = mealKcal.get(date);

  await send(req, res, {
    task: "daily",
    refId: date,
    date,
    userEnabled,
    lowMood,
    safetyText: [...entryText(entry), ...purposeText(purpose)],
    buildContext: () =>
      buildDailyContext({
        purpose,
        entry: { ...entry, date },
        scores: { physical: s.physical.score, mental: s.mental.score, learning: s.learning.score, overall: s.overall },
        nutrition: eaten === undefined ? null : { eatenKcal: eaten, targetKcal: ctx.summary?.calorieTarget ?? null },
        today: today(),
      }),
  });
}

/** GET /api/ai/weekly?weekEnding= — a reflection on the week, one per week. */
export async function weeklyReflection(req: Request, res: Response): Promise<void> {
  const weekEnding = req.query.weekEnding === undefined || req.query.weekEnding === "" ? today() : dateParam(req.query.weekEnding);
  const [review, { insights }, { userEnabled, lowMood }, thoughtWords] = await Promise.all([
    computeWeeklyReview(req.userId, weekEnding),
    computeInsights(req.userId),
    basics(req.userId),
    recentThoughtText(req.userId, addDays(weekEnding, -6), weekEnding),
  ]);

  await send(req, res, {
    task: "weekly",
    refId: weekEnding,
    date: weekEnding,
    userEnabled,
    lowMood,
    safetyText: [...review.entriesThisWeek.flatMap(entryText), ...review.purpose.days.flatMap(purposeText), ...thoughtWords],
    buildContext: () =>
      buildWeeklyContext({
        purpose: review.purpose.stats,
        thisWeek: review.thisWeek,
        lastWeek: review.lastWeek,
        calorieTarget: review.calorieTarget,
        insights,
        today: today(),
      }),
  });
}

/** POST /api/ai/boost — a pick-me-up for the "Lift me up" page (one per day unless regenerated). */
export async function boost(req: Request, res: Response): Promise<void> {
  const to = today();
  const start = await journeyStart(req.userId);
  // Only days since the journey started
  const from = [addDays(to, -6), start].sort().at(-1)!;
  const [ctx, { entries, mealKcal }, { userEnabled, lowMood }, purpose, dates, thoughtWords] = await Promise.all([
    loadUserContext(req.userId),
    loadDays(req.userId, from, to, start),
    basics(req.userId),
    PurposeModel.findOne({ userId: req.userId }).select("coreValues").lean(),
    DailyEntryModel.find({ userId: req.userId, ...CHECKED_IN }).select("date -_id").lean(),
    recentThoughtText(req.userId, addDays(to, -2), to),
  ]);

  const recentScores = listDates(from, to).map((date) => {
    const s = scoresFor(ctx, entries.get(date), mealKcal.get(date));
    return { date, physical: s.physical.score, mental: s.mental.score, learning: s.learning.score, overall: s.overall };
  });
  // The last 3 days of check-ins and thought logs are checked for crisis language first
  const recentWords = listDates(addDays(to, -2), to).flatMap((d) => (entries.has(d) ? entryText(toScoreEntry(entries.get(d)!)) : []));

  await send(req, res, {
    task: "boost",
    refId: to,
    date: to,
    userEnabled,
    lowMood,
    safetyText: [...recentWords, ...thoughtWords],
    buildContext: () =>
      buildBoostContext({
        recentScores,
        streak: streaksSince(dates.map((d) => d.date), start, to),
        coreValues: purpose?.coreValues ?? [],
        today: to,
        mode: aiMode,
      }),
  });
}

/** GET /api/ai/status — whether AI is on, the data mode, and today's usage. No secrets. */
export async function aiStatus(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId).select("aiEnabled").lean();
  if (!user) throw new AppError(401, "Please log in to continue");
  const userEnabled = user.aiEnabled !== false;
  res.json({
    enabled: aiConfigured && userEnabled,
    configured: aiConfigured,
    userEnabled,
    mode: aiMode,
    usedToday: await usedToday(req.userId, today()),
    limit: aiDeps.limit,
  });
}

const settingsSchema = z.strictObject({ aiEnabled: z.boolean({ error: "aiEnabled must be true or false" }) });

/** PUT /api/ai/settings — turn AI features on or off for this user. */
export async function updateAiSettings(req: Request, res: Response): Promise<void> {
  const { aiEnabled } = settingsSchema.parse(req.body ?? {});
  await UserModel.updateOne({ _id: req.userId }, { $set: { aiEnabled } });
  await aiStatus(req, res);
}
