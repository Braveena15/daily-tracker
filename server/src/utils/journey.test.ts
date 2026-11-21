/// <reference types="vitest/globals" />
import { clampFrom, earliestDate, historyRange, journeyDayCount, resolveJourneyStart, streaksSince } from "./journey";
import { calculateStreaks } from "./streaks";

const TODAY = "2026-11-21";

describe("resolveJourneyStart", () => {
  it("uses the chosen date first", () => {
    expect(resolveJourneyStart("2026-11-10", "2026-11-01", TODAY)).toBe("2026-11-10");
  });

  it("otherwise uses the first real entry, never earlier", () => {
    expect(resolveJourneyStart(null, "2026-11-21", TODAY)).toBe("2026-11-21");
    expect(resolveJourneyStart(undefined, "2026-11-15", TODAY)).toBe("2026-11-15");
  });

  it("falls back to today, and never starts in the future", () => {
    expect(resolveJourneyStart(null, null, TODAY)).toBe(TODAY);
    expect(resolveJourneyStart("2026-12-01", null, TODAY)).toBe(TODAY);
  });

  it("finds the earliest of several first-entry dates", () => {
    expect(earliestDate(["2026-11-21", null, "2026-11-19", undefined, "2026-11-20"])).toBe("2026-11-19");
    expect(earliestDate([null, undefined])).toBeNull();
  });
});

describe("journeyDayCount", () => {
  it("counts the start day and today", () => {
    expect(journeyDayCount(TODAY, TODAY)).toBe(1);
    expect(journeyDayCount("2026-11-15", TODAY)).toBe(7);
  });

  it("is 0 before the journey starts", () => {
    expect(journeyDayCount("2026-11-22", TODAY)).toBe(0);
  });
});

describe("clampFrom", () => {
  it("moves a range up to the journey start", () => {
    expect(clampFrom("2026-10-23", "2026-11-21")).toBe("2026-11-21");
    expect(clampFrom("2026-11-20", "2026-11-01")).toBe("2026-11-20");
  });
});

describe("streaksSince", () => {
  it("ignores test days before the journey start", () => {
    const dates = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-20", "2026-11-21"];
    expect(calculateStreaks(dates, TODAY)).toEqual({ current: 2, longest: 4 });
    expect(streaksSince(dates, "2026-11-21", TODAY)).toEqual({ current: 1, longest: 1 });
  });

  it("doesn't let a run cross the start date", () => {
    expect(streaksSince(["2026-11-19", "2026-11-20", "2026-11-21"], "2026-11-20", TODAY)).toEqual({ current: 2, longest: 2 });
  });

  it("is 0 when nothing has been logged since the start", () => {
    expect(streaksSince(["2026-11-01"], "2026-11-21", TODAY)).toEqual({ current: 0, longest: 0 });
  });
});

describe("historyRange", () => {
  it("shows only day 1 when the journey started today", () => {
    expect(historyRange(TODAY, TODAY, 30)).toEqual({ from: TODAY, to: TODAY, total: 1, hasOlder: false });
  });

  it("starts at the journey start for a short journey", () => {
    expect(historyRange("2026-11-15", TODAY, 30)).toEqual({ from: "2026-11-15", to: TODAY, total: 7, hasOlder: false });
  });

  it("shows the newest 30 days and offers older ones for a long journey", () => {
    expect(historyRange("2026-09-01", TODAY, 30)).toEqual({ from: "2026-10-23", to: TODAY, total: 82, hasOlder: true });
    expect(historyRange("2026-09-01", TODAY, 90)).toMatchObject({ from: "2026-09-01", hasOlder: false });
  });
});
