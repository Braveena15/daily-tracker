// The public demo (DEMO_MODE=true only; the router isn't mounted otherwise).
//   GET  /api/demo/config  what the pages need to know: demo on, repository link
//   POST /api/demo/start   a new temporary account with ~60 days of sample data, logged in
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { UserModel } from "../models/User";
import { AppError } from "../utils/AppError";
import { todayInTimezone } from "../utils/dates";
import { setAuthCookie } from "../utils/jwt";
import { seedSampleData, sampleProfile } from "./seed";
import { USER_OWNED_MODELS } from "./setup";

export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ACTIVE_DEMO_USERS = 300;

const NAMES = ["Demo Explorer", "Curious Explorer", "Friendly Visitor", "Morning Rider", "Calm Wanderer", "Happy Tester"];

export function demoConfig(_req: Request, res: Response): void {
  res.json({ enabled: true, repoUrl: env.DEMO_REPO_URL ?? null, ttlHours: DEMO_TTL_MS / 3_600_000 });
}

export async function startDemo(_req: Request, res: Response): Promise<void> {
  const now = new Date();
  const active = await UserModel.countDocuments({ isDemo: true, expiresAt: { $gt: now } });
  if (active >= MAX_ACTIVE_DEMO_USERS) {
    throw new AppError(503, "The demo is busy right now. Please try again a little later.");
  }

  const expiresAt = new Date(now.getTime() + DEMO_TTL_MS);
  const today = todayInTimezone();
  const id = randomBytes(6).toString("hex");
  const user = await UserModel.create({
    ...sampleProfile(today),
    name: NAMES[randomBytes(1)[0]! % NAMES.length]!,
    // Not a real address (.invalid can never be one), and nobody can log in with it: the password is random and thrown away
    email: `explorer-${id}@demo.invalid`,
    passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 4),
    isDemo: true,
    expiresAt,
  });

  try {
    await seedSampleData(user._id, today, expiresAt);
  } catch (err) {
    // Don't leave a half-filled account behind
    await Promise.all(USER_OWNED_MODELS.map((model) => model.deleteMany({ $or: [{ _id: user._id }, { userId: user._id }] })));
    throw err;
  }

  // The login lasts exactly as long as the account
  setAuthCookie(res, user.id, DEMO_TTL_MS);
  res.status(201).json({ user });
}
