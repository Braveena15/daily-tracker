// Development-only request log: one line per request, e.g.
//   14:05:12 POST /api/health-sync 400 3ms — steps: steps must be a number
// Only the method, path (no query string), status, time and an optional short note are logged:
// never headers, tokens or request bodies.
import type { NextFunction, Request, Response } from "express";

const NOTE_KEY = "devLogNote";

/**
 * Adds a short note to this request's log line (e.g. why validation failed).
 * Never pass tokens or body values here.
 */
export function addLogNote(res: Response, note: string): void {
  const existing = res.locals[NOTE_KEY] as string | undefined;
  res.locals[NOTE_KEY] = existing ? `${existing}; ${note}` : note;
}

/** The log line for one request. The query string is dropped, since it could carry secrets. */
export function formatLogLine(input: {
  at: Date;
  method: string;
  url: string;
  status: number;
  ms: number;
  note?: string;
}): string {
  const time = input.at.toTimeString().slice(0, 8);
  const path = input.url.split("?")[0];
  const line = `${time} ${input.method} ${path} ${input.status} ${Math.round(input.ms)}ms`;
  return input.note ? `${line} — ${input.note}` : line;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      formatLogLine({
        at: new Date(),
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms,
        note: res.locals[NOTE_KEY] as string | undefined,
      }),
    );
  });
  next();
}
