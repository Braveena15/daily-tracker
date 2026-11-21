/// <reference types="vitest/globals" />
// The "Daily purposes" list (GET /api/purpose/days): range and today/past split.
import { createFieldCrypto } from "./crypto";
import { hasDailyPurpose, openDailyPurpose, purposeDaysRange, sealText, splitPurposeDays } from "./dailyPurpose";

const TODAY = "2026-11-21";
const crypto = createFieldCrypto("c".repeat(64));

describe("purposeDaysRange", () => {
  it("includes the journey start and today", () => {
    expect(purposeDaysRange({}, TODAY, TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(purposeDaysRange({ from: "2025-11-22", to: TODAY }, "2026-11-15", TODAY)).toEqual({ from: "2026-11-15", to: TODAY });
  });

  it("defaults to the last 30 days, from the journey start at the earliest", () => {
    expect(purposeDaysRange({}, "2026-01-01", TODAY)).toEqual({ from: "2026-10-23", to: TODAY });
  });

  it("never goes past today", () => {
    expect(purposeDaysRange({ to: "2026-11-25" }, "2026-11-01", TODAY).to).toBe(TODAY);
  });
});

describe("today's purpose in the list", () => {
  // What the endpoint does with a stored day: decrypt, then keep days that have a purpose
  const stored = (date: string, text: string) => ({ date, ...openDailyPurpose(crypto, { text: sealText(crypto, text), focusValues: [] })! });

  it("appears as soon as it's saved, first, apart from the past days", () => {
    const days = [stored(TODAY, "Be present"), stored("2026-11-19", "Rest"), stored("2026-11-20", "Focus")].filter(hasDailyPurpose);
    const list = splitPurposeDays(days, TODAY);
    expect(list.today?.text).toBe("Be present");
    expect(list.past.map((d) => d.date)).toEqual(["2026-11-20", "2026-11-19"]);
    expect(list).toMatchObject({ isEmpty: false, canSetToday: false });
  });

  it("offers 'Set today's purpose' when only past days have one", () => {
    const list = splitPurposeDays([stored("2026-11-20", "Focus")], TODAY);
    expect(list).toMatchObject({ today: null, isEmpty: false, canSetToday: true });
    expect(list.past).toHaveLength(1);
  });

  it("is empty only when there are no daily purposes at all", () => {
    expect(splitPurposeDays([], TODAY)).toEqual({ today: null, past: [], isEmpty: true, canSetToday: true });
    expect(splitPurposeDays([stored(TODAY, "Only today")], TODAY)).toMatchObject({ isEmpty: false, canSetToday: false });
  });

  it("ignores a day without any purpose content", () => {
    const blank = { date: TODAY, ...openDailyPurpose(crypto, { text: undefined, focusValues: [] })! };
    expect(splitPurposeDays([blank].filter(hasDailyPurpose), TODAY).isEmpty).toBe(true);
  });
});
