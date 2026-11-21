// Weekly goals ("next week's goal" from the Weekly review). Only ever the logged-in user's own goals.
// The text is encrypted at rest and is never part of any AI request.
import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { fieldCrypto } from "../config/encryption";
import { GOAL_SOURCES, GOAL_TEXT_MAX, WeeklyGoalModel } from "../models/WeeklyGoal";
import { journeyStart } from "../services/journey";
import { AppError } from "../utils/AppError";
import { isValidDateString, todayInTimezone } from "../utils/dates";
import { goalWeekProblem, nextGoalWeek } from "../utils/weeklyGoals";

type GoalLean = { _id: unknown; weekStart: string; weekEnd: string; text: string; source: string; done: boolean; doneAt?: Date | null };

const toGoal = (g: GoalLean) => ({
  id: String(g._id),
  weekStart: g.weekStart,
  weekEnd: g.weekEnd,
  text: fieldCrypto.tryDecrypt(g.text) ?? "",
  source: g.source,
  done: g.done,
  doneAt: g.doneAt ?? null,
});

function weekEndingParam(value: unknown, today: string): string {
  if (value === undefined || value === "") return today;
  if (!isValidDateString(value)) throw new AppError(400, "weekEnding must be a real date in YYYY-MM-DD format");
  return value;
}

/** Goals for the given week window that share a day with it. */
const overlapping = (userId: string | undefined, week: { weekStart: string; weekEnd: string }) =>
  WeeklyGoalModel.find({ userId, weekStart: { $lte: week.weekEnd }, weekEnd: { $gte: week.weekStart } }).sort({ weekStart: 1 }).lean();

/**
 * GET /api/weekly-goals?weekEnding= — for the review week ending on that day (default today):
 * `current` is the goal for that week (the one running on its last day), `next` the goal for the week after.
 */
export async function getWeeklyGoals(req: Request, res: Response): Promise<void> {
  const today = todayInTimezone();
  const weekEnding = weekEndingParam(req.query.weekEnding, today);
  const start = await journeyStart(req.userId);
  const nextWeek = nextGoalWeek(weekEnding);
  const [current, next] = await Promise.all([
    WeeklyGoalModel.findOne({ userId: req.userId, weekStart: { $lte: weekEnding }, weekEnd: { $gte: weekEnding } }).lean(),
    overlapping(req.userId, nextWeek),
  ]);
  res.json({
    current: current ? toGoal(current) : null,
    next: next[0] ? toGoal(next[0]) : null,
    nextWeek,
    // Why a goal can't be set for next week (null when it can)
    nextProblem: goalWeekProblem(weekEnding, start, today),
  });
}

const saveSchema = z.strictObject({
  weekEnding: z.string().refine(isValidDateString, "weekEnding must be a real date in YYYY-MM-DD format"),
  text: z.string().trim().min(1, "Write the goal first").max(GOAL_TEXT_MAX, `Keep the goal under ${GOAL_TEXT_MAX} characters`),
  source: z.enum(GOAL_SOURCES),
  /** The person confirmed replacing the goal already set for that week */
  replace: z.boolean().default(false),
});

/** PUT /api/weekly-goals — set the goal for the week after `weekEnding`. Asks before replacing one. */
export async function saveWeeklyGoal(req: Request, res: Response): Promise<void> {
  const body = saveSchema.parse(req.body ?? {});
  const problem = goalWeekProblem(body.weekEnding, await journeyStart(req.userId), todayInTimezone());
  if (problem) throw new AppError(400, problem);

  const week = nextGoalWeek(body.weekEnding);
  const existing = await overlapping(req.userId, week);
  if (existing.length > 0 && !body.replace) {
    res.status(409).json({ message: "You already have a goal for that week. Replace it?", existing: toGoal(existing[0]!) });
    return;
  }
  // One goal per week: replacing removes any goal that shares a day with this week
  if (existing.length > 0) await WeeklyGoalModel.deleteMany({ userId: req.userId, _id: { $in: existing.map((g) => g._id) } });

  const goal = await WeeklyGoalModel.create({ userId: req.userId, ...week, text: fieldCrypto.encrypt(body.text), source: body.source });
  res.status(201).json({ goal: toGoal(goal.toObject()) });
}

const patchSchema = z.strictObject({ done: z.boolean() });

/** PATCH /api/weekly-goals/:id — "Did it?" */
export async function updateWeeklyGoal(req: Request, res: Response): Promise<void> {
  const { done } = patchSchema.parse(req.body ?? {});
  const id = req.params.id;
  const goal = isValidObjectId(id)
    ? await WeeklyGoalModel.findOneAndUpdate({ _id: id, userId: req.userId }, { done, doneAt: done ? new Date() : null }, { new: true }).lean()
    : null;
  if (!goal) throw new AppError(404, "Goal not found");
  res.json({ goal: toGoal(goal) });
}

/** DELETE /api/weekly-goals/:id */
export async function deleteWeeklyGoal(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const result = isValidObjectId(id) ? await WeeklyGoalModel.deleteOne({ _id: id, userId: req.userId }) : null;
  if (!result?.deletedCount) throw new AppError(404, "Goal not found");
  res.status(204).end();
}
