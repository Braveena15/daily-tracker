import type { NextFunction, Request, Response } from "express";
import { UserModel } from "../models/User";
import { AppError } from "../utils/AppError";
import { bearerToken, hashSyncToken, looksLikeSyncToken, verifySyncToken } from "../utils/syncToken";

// For POST /api/health-sync only. Accepts nothing but "Authorization: Bearer <sync token>":
// login cookies are ignored, so the endpoint can't be triggered from a browser where you're logged in.
export async function requireSyncToken(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header) {
    throw new AppError(401, 'Missing header "Authorization: Bearer <your sync token>"');
  }
  const token = bearerToken(header);
  if (!token) {
    throw new AppError(401, 'The Authorization header must look like "Bearer dt_…"');
  }
  if (!looksLikeSyncToken(token)) {
    throw new AppError(401, 'That doesn\'t look like a sync token. It should start with "dt_" — copy it again from Profile → Apple Watch sync.');
  }

  // Found by hash (the token itself is never stored), then compared in constant time
  const user = await UserModel.findOne({ healthSyncTokenHash: hashSyncToken(token) })
    .select("+healthSyncTokenHash")
    .lean();
  if (!user || !verifySyncToken(token, user.healthSyncTokenHash)) {
    throw new AppError(401, "This sync token isn't valid. It may have been revoked or regenerated — create a new one in Profile → Apple Watch sync.");
  }

  req.userId = String(user._id);
  next();
}
