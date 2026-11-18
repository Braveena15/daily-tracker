import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE, verifyToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";

// Only lets the request through if it carries a valid login cookie.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.[AUTH_COOKIE];
  const userId = typeof token === "string" ? verifyToken(token) : null;

  if (!userId) {
    return next(new AppError(401, "Please log in to continue"));
  }

  req.userId = userId;
  next();
}
