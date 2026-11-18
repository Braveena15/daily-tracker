import jwt from "jsonwebtoken";
import type { CookieOptions, Response } from "express";
import { env } from "../config/env";

export const AUTH_COOKIE = "token";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type TokenPayload = { userId: string };

export function signToken(userId: string): string {
  return jwt.sign({ userId } satisfies TokenPayload, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d",
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

export function setAuthCookie(res: Response, userId: string): void {
  res.cookie(AUTH_COOKIE, signToken(userId), { ...baseCookieOptions, maxAge: SEVEN_DAYS_MS });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, baseCookieOptions);
}
