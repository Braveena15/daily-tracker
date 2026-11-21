// The AI friend in the Thought log (see ai/friend.ts for the rules). Every route is the logged-in
// user's own thought log only, and nothing is sent to the AI without consent: true in the request.
import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { usedToday } from "../ai/mongoStore";
import { friendFirstReply, friendFollowUp, FriendRefusal, MAX_FRIEND_MESSAGES, setFriendFeedback, SUPPORT_LINE, type FriendResult, type FriendThought } from "../ai/friend";
import { createFriendStore } from "../ai/friendStore";
import { aiDeps } from "../config/ai";
import { fieldCrypto } from "../config/encryption";
import { DailyEntryModel } from "../models/DailyEntry";
import { PurposeModel, ThoughtLogModel } from "../models/Mind";
import { UserModel } from "../models/User";
import { AppError } from "../utils/AppError";
import { todayInTimezone } from "../utils/dates";

const store = createFriendStore(fieldCrypto);
const deps = () => ({ generate: aiDeps.generate, store, limit: aiDeps.limit, onError: aiDeps.onError });

const GOOD_MOMENTS = 3;

/** The user's own thought log, decrypted, in the shape the friend uses. */
async function loadThought(req: Request, withContext: boolean): Promise<FriendThought> {
  const { thoughtId } = req.params;
  const doc = isValidObjectId(thoughtId) ? await ThoughtLogModel.findOne({ _id: thoughtId, userId: req.userId }).lean() : null;
  if (!doc) throw new AppError(404, "Thought log not found");

  const open = (value: string | null | undefined) => (value ? (fieldCrypto.tryDecrypt(value) ?? "") : "");
  const thought: FriendThought = {
    id: String(doc._id),
    date: doc.date,
    isPrivate: Boolean(doc.isPrivate),
    thought: open(doc.thought),
    situation: open(doc.situation),
    feelings: doc.feelings.map((f) => ({ name: f.name, intensity: f.intensityBefore })),
    thinkingTraps: [...doc.distortions],
    evidenceFor: open(doc.evidenceFor),
    evidenceAgainst: open(doc.evidenceAgainst),
    balancedThought: open(doc.balancedThought),
    friendAdvice: open(doc.friendAdvice),
    smallStepText: open(doc.smallStep),
  };
  if (!withContext || thought.isPrivate) return thought;

  // Only with "Include my values and a few recent good moments" turned on
  const [purpose, days] = await Promise.all([
    PurposeModel.findOne({ userId: req.userId }).select("coreValues").lean(),
    DailyEntryModel.find({ userId: req.userId, "goodThings.0": { $exists: true } }).sort({ date: -1 }).limit(GOOD_MOMENTS).select("goodThings").lean(),
  ]);
  const goodMoments = days
    .flatMap((d) => [...d.goodThings].sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()))
    .slice(0, GOOD_MOMENTS)
    .map((g) => g.text);
  return { ...thought, values: purpose?.coreValues ?? [], goodMoments };
}

async function aiEnabledFor(userId: string | undefined): Promise<boolean> {
  const user = await UserModel.findById(userId).select("aiEnabled").lean();
  if (!user) throw new AppError(401, "Please log in to continue");
  return user.aiEnabled !== false;
}

const messagesLeft = (c: { messages: { role: string }[] } | null) =>
  MAX_FRIEND_MESSAGES - (c?.messages.filter((m) => m.role === "user").length ?? 0);

/** Runs a friend action, turning refusals into 400/403 responses. */
async function respond(req: Request, res: Response, run: () => Promise<FriendResult>) {
  try {
    const result = await run();
    const today = todayInTimezone();
    res.json({
      ...result,
      ...(result.showSupport && { supportMessage: SUPPORT_LINE }),
      messagesLeft: messagesLeft(result.conversation),
      usedToday: await usedToday(req.userId, today),
      limit: aiDeps.limit,
    });
  } catch (err) {
    if (err instanceof FriendRefusal) throw new AppError(err.status, err.message);
    throw err;
  }
}

/** GET /api/ai/friend/:thoughtId — the conversation so far (nothing is sent to the AI). */
export async function getFriendConversation(req: Request, res: Response): Promise<void> {
  const thought = await loadThought(req, false);
  const conversation = await store.load(req.userId!, thought.id);
  res.json({ conversation, isPrivate: thought.isPrivate, messagesLeft: messagesLeft(conversation) });
}

const firstSchema = z.strictObject({
  consent: z.literal(true, { error: "Please confirm you want to share this thought with Gemini first." }),
  includeContext: z.boolean().default(false),
  regenerate: z.boolean().default(false),
});

/** POST /api/ai/friend/:thoughtId — the friend's first reply. Needs { consent: true }. */
export async function startFriend(req: Request, res: Response): Promise<void> {
  // Consent is checked before the thought is even read
  const body = firstSchema.parse(req.body ?? {});
  const thought = await loadThought(req, body.includeContext);
  await respond(req, res, async () =>
    friendFirstReply(deps(), {
      userId: req.userId!,
      thought,
      consent: body.consent,
      includeContext: body.includeContext,
      today: todayInTimezone(),
      userEnabled: await aiEnabledFor(req.userId),
      regenerate: body.regenerate,
    }),
  );
}

const messageSchema = z.strictObject({
  consent: z.literal(true, { error: "Please confirm you want to share this thought with Gemini first." }),
  message: z.string({ error: "Write a message first." }).trim().min(1, "Write a message first.").max(1000, "Keep messages under 1000 characters."),
});

/** POST /api/ai/friend/:thoughtId/messages — one follow-up message. Needs { consent: true, message }. */
export async function sendFriendMessage(req: Request, res: Response): Promise<void> {
  const body = messageSchema.parse(req.body ?? {});
  const existing = await store.load(req.userId!, String(req.params.thoughtId));
  const thought = await loadThought(req, existing?.includedContext ?? false);
  await respond(req, res, async () =>
    friendFollowUp(deps(), {
      userId: req.userId!,
      thought,
      consent: body.consent,
      message: body.message,
      today: todayInTimezone(),
      userEnabled: await aiEnabledFor(req.userId),
    }),
  );
}

const feedbackSchema = z.strictObject({
  target: z.union([z.literal("reply"), z.number().int().min(0)]),
  helpful: z.boolean().nullable(),
});

/** PUT /api/ai/friend/:thoughtId/feedback — "Did this help?" 👍 / 👎 on a reply. */
export async function saveFriendFeedback(req: Request, res: Response): Promise<void> {
  const body = feedbackSchema.parse(req.body ?? {});
  const thought = await loadThought(req, false);
  try {
    const conversation = await setFriendFeedback(store, { userId: req.userId!, thought, target: body.target, helpful: body.helpful });
    res.json({ conversation, messagesLeft: messagesLeft(conversation) });
  } catch (err) {
    if (err instanceof FriendRefusal) throw new AppError(err.status, err.message);
    throw err;
  }
}
