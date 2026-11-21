// Dismissed milestone notes, stored on the account so a note closed on the phone stays closed on the laptop.
import type { Request, Response } from "express";
import { z } from "zod";
import { UserModel } from "../models/User";
import { AppError } from "../utils/AppError";
import { MILESTONE_IDS } from "../utils/milestones";

/** GET /api/profile/milestones */
export async function getMilestones(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId).select("dismissedMilestones").lean();
  if (!user) throw new AppError(401, "Please log in to continue");
  res.json({ dismissed: user.dismissedMilestones ?? [] });
}

const dismissSchema = z.strictObject({ ids: z.array(z.enum(MILESTONE_IDS)).min(1).max(MILESTONE_IDS.length) });

/** POST /api/profile/milestones/dismissed — { ids }: close these notes for good. */
export async function dismissMilestones(req: Request, res: Response): Promise<void> {
  const { ids } = dismissSchema.parse(req.body ?? {});
  const user = await UserModel.findByIdAndUpdate(
    req.userId,
    { $addToSet: { dismissedMilestones: { $each: ids } } },
    { new: true, projection: { dismissedMilestones: 1 } },
  ).lean();
  if (!user) throw new AppError(401, "Please log in to continue");
  res.json({ dismissed: user.dismissedMilestones ?? [] });
}
