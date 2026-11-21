import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { demoContext } from "../demo/context";
import { UserModel } from "../models/User";
import { AUTH_COOKIE, clearAuthCookie, verifyToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";

// Only lets the request through if it carries a valid login cookie.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.[AUTH_COOKIE];
  const userId = typeof token === "string" ? verifyToken(token) : null;

  if (!userId) {
    return next(new AppError(401, "Please log in to continue"));
  }

  req.userId = userId;
  if (!env.demoMode) return next();

  // Demo: the account must still exist (it's deleted after 24 hours), and everything this request
  // creates expires with it.
  UserModel.findById(userId)
    .select("expiresAt")
    .lean()
    .then((user) => {
      if (!user || (user.expiresAt && user.expiresAt <= new Date())) {
        clearAuthCookie(res);
        return next(new AppError(401, "Your demo has ended. Start a new one from the login page."));
      }
      if (!user.expiresAt) return next();
      demoContext.run({ expiresAt: user.expiresAt }, next);
    })
    .catch(next);
}
