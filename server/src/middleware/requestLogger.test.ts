import type { Response } from "express";
import { addLogNote, formatLogLine } from "./requestLogger";

const at = new Date(2026, 10, 20, 21, 5, 9);

describe("formatLogLine", () => {
  it("shows time, method, path, status and duration", () => {
    expect(formatLogLine({ at, method: "GET", url: "/api/entries/2026-11-20", status: 200, ms: 12.6 })).toBe(
      "21:05:09 GET /api/entries/2026-11-20 200 13ms",
    );
  });

  it("drops the query string, which could carry secrets", () => {
    const line = formatLogLine({ at, method: "POST", url: "/api/health-sync?token=dt_secret", status: 401, ms: 1 });
    expect(line).toBe("21:05:09 POST /api/health-sync 401 1ms");
    expect(line).not.toContain("dt_secret");
  });

  it("adds the note after a dash", () => {
    expect(formatLogLine({ at, method: "POST", url: "/api/health-sync", status: 401, ms: 2, note: "auth failed: missing token" })).toBe(
      "21:05:09 POST /api/health-sync 401 2ms — auth failed: missing token",
    );
  });
});

describe("addLogNote", () => {
  it("joins several notes for one request", () => {
    const res = { locals: {} } as unknown as Response;
    addLogNote(res, "first");
    addLogNote(res, "second");
    expect(res.locals.devLogNote).toBe("first; second");
  });
});
