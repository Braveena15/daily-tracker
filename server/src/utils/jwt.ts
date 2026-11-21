import jwt from "jsonwebtoken";
import type { CookieOptions, Response } from "express";
import { env } from "../config/env";

export const AUTH_COOKIE = "token";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type TokenPayload = { userId: string };

/** `maxAgeMs`: how long the login lasts (7 days; a demo account only lasts as long as the account). */
export function signToken(userId: string, maxAgeMs = SEVEN_DAYS_MS): string {
  return jwt.sign({ userId } satisfies TokenPayload, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: Math.max(1, Math.floor(maxAgeMs / 1000)),
  });
}

// Returns the userId if the token is valid and unexpired, otherwise null.
export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "object" && typeof payload.userId === "string") {
      return payload.userId;
    }
    return null;
  } catch {
    return null;
  }
}

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.isProduction,
  path: "/",
};

export function setAuthCookie(res: Response, userId: string, maxAgeMs = SEVEN_DAYS_MS): void {
  res.cookie(AUTH_COOKIE, signToken(userId, maxAgeMs), { ...baseCookieOptions, maxAge: maxAgeMs });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, baseCookieOptions);
}
