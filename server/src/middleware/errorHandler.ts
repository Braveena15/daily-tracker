import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, `Not found: ${req.method} ${req.originalUrl}`));
}

// Turns any error into { message } JSON. Unexpected errors never leak details in production.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ message: err.issues[0]?.message ?? "Invalid input" });
    return;
  }

  // MongoDB duplicate key, e.g. two sign-ups with the same email at the same moment
  if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000) {
    res.status(409).json({ message: "An account with this email already exists" });
    return;
  }

  // Errors from Express itself, such as a malformed JSON body (status 400)
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ message: status === 400 ? "Invalid request body" : "Request rejected" });
    return;
  }

  console.error(err);
  const message =
    !env.isProduction && err instanceof Error ? err.message : "Something went wrong. Please try again.";
  res.status(500).json({ message });
}
