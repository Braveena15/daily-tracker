// Apple Health sync: token management (logged-in routes) and the sync endpoint (Bearer token).
// Neither the token nor the request body is ever logged.
import type { Request, Response } from "express";
import { DailyEntryModel } from "../models/DailyEntry";
import { UserModel } from "../models/User";
import { addLogNote } from "../middleware/requestLogger";
import { AppError } from "../utils/AppError";
import { addDays } from "../utils/dates";
import { planHealthMerge, type StoredSleep } from "../utils/healthSyncMerge";
import { formatDuration, parseSleepSamples, sleepScore, summariseNight } from "../utils/sleep";
import { updateProfileWeightIfLatest } from "../services/profileWeight";
import { generateSyncToken, hashSyncToken } from "../utils/syncToken";
import {
  HEALTH_SYNC_KEYS,
  SyncDateError,
  healthSyncSchema,
  resolveSyncDate,
} from "../validation/healthSyncSchema";

// ---------- Token (needs the normal login) ----------

/** GET /api/health-sync/status — never returns the token or its hash. */
export async function syncStatus(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId)
    .select("+healthSyncTokenHash healthSyncTokenCreatedAt lastHealthSyncAt")
    .lean();
  if (!user) throw new AppError(401, "Please log in to continue");
  res.json({
    hasToken: Boolean(user.healthSyncTokenHash),
    createdAt: user.healthSyncTokenHash ? (user.healthSyncTokenCreatedAt ?? null) : null,
    lastHealthSyncAt: user.lastHealthSyncAt ?? null,
  });
}

/** POST /api/health-sync/token — a new token, returned this once. Replaces any previous token. */
export async function createSyncToken(req: Request, res: Response): Promise<void> {
  const token = generateSyncToken();
  const createdAt = new Date();
  const result = await UserModel.updateOne(
    { _id: req.userId },
    { $set: { healthSyncTokenHash: hashSyncToken(token), healthSyncTokenCreatedAt: createdAt } },
  );
  if (result.matchedCount === 0) throw new AppError(401, "Please log in to continue");
  res.set("Cache-Control", "no-store");
  res.status(201).json({ token, createdAt });
}

/** DELETE /api/health-sync/token — the old token stops working straight away. */
export async function revokeSyncToken(req: Request, res: Response): Promise<void> {
  await UserModel.updateOne({ _id: req.userId }, { $unset: { healthSyncTokenHash: 1, healthSyncTokenCreatedAt: 1 } });
  res.json({ revoked: true });
}

// ---------- Sync (Bearer token only) ----------

/** A 400 whose reason also goes into the development request log (messages never contain the token). */
function invalid(res: Response, message: string, logNote: string = message): AppError {
  addLogNote(res, `validation failed: ${logNote}`);
  return new AppError(400, message);
}

/** POST /api/health-sync — merges Apple Health data into one day's entry. */
export async function healthSync(req: Request, res: Response): Promise<void> {
  const raw: unknown = req.body;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalid(res, 'Send a JSON object, e.g. {"steps": 8234}, with header "Content-Type: application/json"', "body is not a JSON object");
  }

  const parsed = healthSyncSchema.safeParse(raw);
  if (!parsed.success) {
    // The response shows the first problem; the dev log lists every field that failed and why
    const problems = parsed.error.issues.map((i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`);
    throw invalid(res, problems[0] ?? "Invalid body", problems.join(" | "));
  }
  const input = parsed.data;
  // Unknown keys are ignored but reported back, which helps spot typos in the Shortcut
  const ignoredFields = Object.keys(raw).filter((k) => !(HEALTH_SYNC_KEYS as string[]).includes(k));

  let date: string;
  try {
    date = resolveSyncDate(input.date);
  } catch (err) {
    if (err instanceof SyncDateError) throw invalid(res, `date: ${err.message}`);
    throw err;
  }

  const hasData = HEALTH_SYNC_KEYS.some((k) => k !== "date" && input[k] !== undefined);
  if (!hasData) {
    throw invalid(
      res,
      "Nothing to sync: send at least one of activeCalories, restingCalories, steps (or stepsWatch/stepsPhone), exerciseMinutes, weightKg, sleepHours, sleepSamples or workouts",
      "no health fields sent",
    );
  }

  const existing = await DailyEntryModel.findOne({ userId: req.userId, date })
    .select("weightKg sleepHours workouts healthSync")
    .lean();
  const sleep = input.sleepSamples === undefined ? null : await nightFromSamples(req.userId, date, input.sleepSamples);
  const syncedAt = new Date();
  const plan = planHealthMerge(existing, input, syncedAt, sleep);

  await DailyEntryModel.updateOne(
    { userId: req.userId, date },
    { $set: plan.set },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await UserModel.updateOne({ _id: req.userId }, { $set: { lastHealthSyncAt: syncedAt } });
  if (plan.updatedFields.includes("weightKg") && input.weightKg !== undefined) {
    await updateProfileWeightIfLatest(req.userId, date, input.weightKg);
  }

  res.json({
    ok: true,
    date,
    updatedFields: plan.updatedFields,
    ...(plan.keptFields.length > 0 && {
      keptFields: plan.keptFields,
      note: "keptFields already had a value for this day, so they weren't overwritten",
    }),
    ...(ignoredFields.length > 0 && { ignoredFields }),
    ...(input.sleepSamples !== undefined && {
      sleep: sleep
        ? { slept: formatDuration(sleep.totalSleepMin), score: sleep.score, bedtime: sleep.bedtime, wakeTime: sleep.wakeTime }
        : { note: `No sleep found in sleepSamples for the night ending on ${date}` },
    }),
  });
}

const BASELINE_DAYS = 14;

/** The night ending on `date`, scored against the bedtimes of the previous 14 nights that have sleep data. */
async function nightFromSamples(userId: string | undefined, date: string, text: string): Promise<StoredSleep | null> {
  const night = summariseNight(parseSleepSamples(text), date);
  if (!night) return null;
  const previous = await DailyEntryModel.find({
    userId,
    date: { $gte: addDays(date, -BASELINE_DAYS), $lte: addDays(date, -1) },
    "sleep.bedtime": { $exists: true },
  })
    .select("sleep.bedtime -_id")
    .lean();
  const bedtimes = previous.flatMap((e) => (e.sleep?.bedtime ? [e.sleep.bedtime] : []));
  return { ...night, ...sleepScore(night, bedtimes), source: "watch" };
}
