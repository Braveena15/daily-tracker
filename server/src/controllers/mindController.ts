// Purpose, the motivation library (quotes and videos), the low-mood check and "Lift me up".
import type { Request, Response } from "express";
import { isValidObjectId, type Model } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { DailyEntryModel } from "../models/DailyEntry";
import { dayMood } from "../utils/timeline";
import { todayInTimezone } from "../utils/dates";
import {
  openDayPurposes,
  previousVersion,
  purposeChanged,
  toPurposeContent,
  type StoredPurpose,
} from "../utils/dailyPurpose";
import { PurposeModel, QuoteModel, ThoughtLogModel, VideoModel } from "../models/Mind";
import { AppError } from "../utils/AppError";
import { BUILT_IN_QUOTES } from "../utils/builtInQuotes";
import { pickRandom } from "../utils/random";
import { LOW_MOOD, isLowMoodStreak } from "../utils/safety";
import { youtubeVideoId } from "../utils/youtube";
import { purposeSchema, quoteSchema, videoSchema } from "../validation/mindSchema";

// ---------- Purpose ----------

function toPurpose(doc: StoredPurpose) {
  return { ...toPurposeContent(doc), updatedAt: doc?.updatedAt ?? null };
}

export async function getPurpose(req: Request, res: Response): Promise<void> {
  res.json({ purpose: toPurpose(await PurposeModel.findOne({ userId: req.userId }).lean()) });
}

/**
 * PUT /api/purpose — saves the statement, core values and long-term goals. When any of them change,
 * the version being replaced is kept in purposeHistory (statement and goals encrypted).
 */
export async function savePurpose(req: Request, res: Response): Promise<void> {
  const body = purposeSchema.parse(req.body ?? {});
  const before = await PurposeModel.findOne({ userId: req.userId }).select("purposeStatement coreValues longTermGoals updatedAt").lean();
  // Saving the same purpose again changes nothing (not even "last updated")
  if (before && !purposeChanged(toPurposeContent(before), body)) {
    res.json({ purpose: toPurpose(await PurposeModel.findOne({ userId: req.userId }).lean()) });
    return;
  }
  const version = previousVersion(fieldCrypto, before, body, new Date());
  const doc = await PurposeModel.findOneAndUpdate(
    { userId: req.userId },
    version ? { $set: body, $push: { purposeHistory: version } } : { $set: body },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  res.json({ purpose: toPurpose(doc) });
}

// ---------- Quotes and videos (shared CRUD) ----------

async function findOwn<T>(model: Model<T>, req: Request, label: string) {
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await model.findOne({ _id: id, userId: req.userId }) : null;
  if (!doc) throw new AppError(404, `${label} not found`);
  return doc;
}

export async function listQuotes(req: Request, res: Response): Promise<void> {
  const quotes = await QuoteModel.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ quotes, builtIn: BUILT_IN_QUOTES });
}

export async function createQuote(req: Request, res: Response): Promise<void> {
  const quote = await QuoteModel.create({ ...quoteSchema.parse(req.body ?? {}), userId: req.userId });
  res.status(201).json({ quote });
}

export async function updateQuote(req: Request, res: Response): Promise<void> {
  const body = quoteSchema.parse(req.body ?? {});
  const quote = await findOwn(QuoteModel, req, "Quote");
  quote.set({ ...body, author: body.author || undefined });
  await quote.save();
  res.json({ quote });
}

export async function deleteQuote(req: Request, res: Response): Promise<void> {
  await (await findOwn(QuoteModel, req, "Quote")).deleteOne();
  res.json({ deleted: true });
}

export async function listVideos(req: Request, res: Response): Promise<void> {
  res.json({ videos: await VideoModel.find({ userId: req.userId }).sort({ createdAt: -1 }) });
}

export async function createVideo(req: Request, res: Response): Promise<void> {
  const body = videoSchema.parse(req.body ?? {});
  const video = await VideoModel.create({ ...body, videoId: youtubeVideoId(body.youtubeUrl)!, userId: req.userId });
  res.status(201).json({ video });
}

export async function updateVideo(req: Request, res: Response): Promise<void> {
  const body = videoSchema.parse(req.body ?? {});
  const video = await findOwn(VideoModel, req, "Video");
  video.set({ ...body, note: body.note || undefined, videoId: youtubeVideoId(body.youtubeUrl)! });
  await video.save();
  res.json({ video });
}

export async function deleteVideo(req: Request, res: Response): Promise<void> {
  await (await findOwn(VideoModel, req, "Video")).deleteOne();
  res.json({ deleted: true });
}

// ---------- Wellbeing ----------

/** GET /api/wellbeing/check — lowMoodStreak: average mood ≤ 3 on at least 5 of the last 7 days with a mood check-in. */
export async function wellbeingCheck(req: Request, res: Response): Promise<void> {
  const recent = await DailyEntryModel.find({ userId: req.userId, "moodLogs.0": { $exists: true } })
    .sort({ date: -1 })
    .limit(LOW_MOOD.days)
    .select("moodLogs.mood moodLogs.energy -_id")
    .lean();
  const moods = recent.flatMap((e) => {
    const m = dayMood(e.moodLogs);
    return m ? [m.avgMood] : [];
  });
  res.json({ lowMoodStreak: isLowMoodStreak(moods) });
}

/** GET /api/lift-me-up — good moments, purpose, a quote, a video and the last small step done. */
export async function liftMeUp(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  const [entries, purpose, quotes, videos, lastStep, today] = await Promise.all([
    DailyEntryModel.find({ userId, "goodThings.0": { $exists: true } })
      .sort({ date: -1 })
      .limit(365)
      .select("date goodThings -_id")
      .lean(),
    PurposeModel.findOne({ userId }).lean(),
    QuoteModel.find({ userId }).lean(),
    VideoModel.find({ userId }).lean(),
    ThoughtLogModel.findOne({ userId, smallStepDone: true, smallStep: { $exists: true } })
      .sort({ smallStepDoneAt: -1, updatedAt: -1 })
      .select("date smallStep smallStepDoneAt")
      .lean(),
    DailyEntryModel.findOne({ userId, date: todayInTimezone() }).select("dailyPurposes").lean(),
  ]);
  const todayPurposes = openDayPurposes(fieldCrypto, today).purposes.filter((p) => p.text.trim() !== "");

  const goodThings = pickRandom(
    entries.flatMap((e) => e.goodThings.map((g) => ({ text: g.text, date: e.date }))),
    5,
  );

  const quotePool = [
    ...quotes.map((q) => ({ id: String(q._id), text: q.text, author: q.author ?? null, source: null, category: q.category, mine: true })),
    ...BUILT_IN_QUOTES.map((q) => ({ ...q, mine: false })),
  ];
  const [quote] = pickRandom(quotePool, 1);
  const [video] = pickRandom(videos, 1);
  const smallStepText = lastStep?.smallStep ? fieldCrypto.tryDecrypt(lastStep.smallStep) : null;

  res.json({
    goodThings,
    // Today's purposes (the first 3) come first on the page when set; otherwise the main purpose statement
    todayPurposes: todayPurposes.slice(0, 3).map((p) => ({ id: p.id, text: p.text, focusValues: p.focusValues })),
    todayPurposeCount: todayPurposes.length,
    purpose: purpose && (purpose.purposeStatement || purpose.coreValues.length > 0)
      ? { purposeStatement: purpose.purposeStatement ?? "", coreValues: purpose.coreValues }
      : null,
    quote: quote ?? null,
    video: video ? { id: String(video._id), title: video.title, videoId: video.videoId, note: video.note ?? null } : null,
    smallStep: smallStepText ? { text: smallStepText, date: lastStep!.date } : null,
  });
}
