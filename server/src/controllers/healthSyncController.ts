// Apple Health sync: token management (logged-in routes) and the sync endpoint (Bearer token).
// Neither the token nor the request body is ever logged.
import { networkInterfaces } from "node:os";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { DailyEntryModel } from "../models/DailyEntry";
import { UserModel } from "../models/User";
import { addLogNote } from "../middleware/requestLogger";
import { AppError } from "../utils/AppError";
import { addDays } from "../utils/dates";
import { planHealthMerge, type StoredSleep } from "../utils/healthSyncMerge";
import { formatDuration, parseSleepSamples, sleepScore, summariseNight } from "../utils/sleep";
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
    // Development only: this computer's Wi-Fi/LAN IPv4 addresses, so the phone can be pointed at one
    lanAddresses: env.isProduction ? [] : lanIPv4Addresses(),
  });
}

/** This computer's non-internal IPv4 addresses (e.g. "192.168.1.20"). */
export function lanIPv4Addresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a): a is NonNullable<typeof a> => !!a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}

/**
 * GET /api/health-sync/test — "Test connection": proves the API is reachable and the login works,
 * and reports whether a token is active (the token itself is never stored, so it can't be checked here).
 */
export async function testSyncConnection(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId).select("+healthSyncTokenHash lastHealthSyncAt").lean();
  if (!user) throw new AppError(401, "Please log in to continue");
  res.json({ ok: true, hasToken: Boolean(user.healthSyncTokenHash), lastHealthSyncAt: user.lastHealthSyncAt ?? null, serverTime: new Date() });
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

/**
 * POST /api/health-sync — merges the watch's sleep into one day's entry. Only date, sleepSamples and
 * sleepHours are used; anything else a Shortcut sends (steps, calories, workouts…) is accepted but
 * not stored, and listed in ignoredFields.
 */
export async function healthSync(req: Request, res: Response): Promise<void> {
  const raw: unknown = req.body;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalid(res, 'Send a JSON object, e.g. {"sleepSamples": "…"}, with header "Content-Type: application/json"', "body is not a JSON object");
  }

  // Only the sleep fields are read (and validated); everything else is ignored without an error
  const body = raw as Record<string, unknown>;
  const used = Object.fromEntries(HEALTH_SYNC_KEYS.filter((k) => k in body).map((k) => [k, body[k]]));
  const parsed = healthSyncSchema.safeParse(used);
  if (!parsed.success) {
    // The response shows the first problem; the dev log lists every field that failed and why
    const problems = parsed.error.issues.map((i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`);
    throw invalid(res, problems[0] ?? "Invalid body", problems.join(" | "));
  }
  const input = parsed.data;
  const ignoredFields = Object.keys(body).filter((k) => !(HEALTH_SYNC_KEYS as string[]).includes(k));

  let date: string;
  try {
    date = resolveSyncDate(input.date);
  } catch (err) {
    if (err instanceof SyncDateError) throw invalid(res, `date: ${err.message}`);
    throw err;
  }

  const syncedAt = new Date();
  const hasSleep = input.sleepSamples !== undefined || input.sleepHours !== undefined;
  if (!hasSleep) {
    // An older Shortcut that only sends steps or calories: nothing to store, but not an error
    await UserModel.updateOne({ _id: req.userId }, { $set: { lastHealthSyncAt: syncedAt } });
    res.json({
      ok: true,
      date,
      updatedFields: [],
      ...(ignoredFields.length > 0 && { ignoredFields }),
      note: "Only sleep is synced (sleepSamples or sleepHours). Steps, calories and workouts are entered on the Today page.",
    });
    return;
  }

  const existing = await DailyEntryModel.findOne({ userId: req.userId, date })
    .select("sleepHours sleepHoursSource sleepScoreValue sleepScoreSource")
    .lean();
  const sleep = input.sleepSamples === undefined ? null : await nightFromSamples(req.userId, date, input.sleepSamples);
  const plan = planHealthMerge(existing, input, syncedAt, sleep);

  if (Object.keys(plan.set).length > 0) {
    await DailyEntryModel.updateOne({ userId: req.userId, date }, { $set: plan.set }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  }
  await UserModel.updateOne({ _id: req.userId }, { $set: { lastHealthSyncAt: syncedAt } });

  res.json({
    ok: true,
    date,
    updatedFields: plan.updatedFields,
    ...(plan.keptFields.length > 0 && {
      keptFields: plan.keptFields,
      note: "keptFields weren't overwritten: the day already has sleep you entered yourself",
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
