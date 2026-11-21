/// <reference types="vitest/globals" />
import { addDays, dayStatus, daysBetween, isTodayInColombo, isValidDateString, listDates, todayInTimezone } from "./dates";
import { calculateStreaks } from "./streaks";

describe("todayInTimezone", () => {
  it("uses Colombo time (UTC+5:30) by default", () => {
    // 20:00 UTC on 18 Nov is already 01:30 on 19 Nov in Colombo
    expect(todayInTimezone(undefined, new Date("2026-11-18T20:00:00Z"))).toBe("2026-11-19");
    // 18:00 UTC is 23:30 in Colombo, still the 18th
    expect(todayInTimezone(undefined, new Date("2026-11-18T18:00:00Z"))).toBe("2026-11-18");
  });

  it("works for other timezones", () => {
    const now = new Date("2026-11-18T03:00:00Z");
    expect(todayInTimezone("UTC", now)).toBe("2026-11-18");
    expect(todayInTimezone("America/New_York", now)).toBe("2026-11-17");
  });

  it("uses the current time by default", () => {
    expect(isValidDateString(todayInTimezone())).toBe(true);
  });
});

describe("isValidDateString", () => {
  it("accepts real dates", () => {
    expect(isValidDateString("2026-11-18")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true); // leap year
  });

  it("rejects impossible dates and wrong formats", () => {
    expect(isValidDateString("2026-02-29")).toBe(false); // not a leap year
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-04-31")).toBe(false);
    expect(isValidDateString("2026-1-5")).toBe(false);
    expect(isValidDateString("18-11-2026")).toBe(false);
    expect(isValidDateString("2026-11-18T00:00")).toBe(false);
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString(20261118)).toBe(false);
    expect(isValidDateString(undefined)).toBe(false);
  });
});

describe("addDays and daysBetween", () => {
  it("moves across month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-11-18", 0)).toBe("2026-11-18");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-11-01", "2026-11-18")).toBe(17);
    expect(daysBetween("2026-11-18", "2026-11-01")).toBe(-17);
    expect(daysBetween("2025-01-01", "2026-01-01")).toBe(365);
  });

  it("throws on invalid input", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("listDates", () => {
  it("lists every date inclusive, oldest first", () => {
    expect(listDates("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });

  it("returns one date when from equals to, and none when from is later", () => {
    expect(listDates("2026-11-18", "2026-11-18")).toEqual(["2026-11-18"]);
    expect(listDates("2026-11-19", "2026-11-18")).toEqual([]);
  });
});

describe("calculateStreaks", () => {
  const today = "2026-11-18";

  it("is zero with no entries", () => {
    expect(calculateStreaks([], today)).toEqual({ current: 0, longest: 0 });
  });

  it("counts a run ending today", () => {
    expect(calculateStreaks(["2026-11-16", "2026-11-17", "2026-11-18"], today)).toEqual({ current: 3, longest: 3 });
  });

  it("keeps the streak alive when only yesterday is logged", () => {
    expect(calculateStreaks(["2026-11-16", "2026-11-17"], today)).toEqual({ current: 2, longest: 2 });
  });

  it("resets the current streak after a missed day", () => {
    expect(calculateStreaks(["2026-11-15", "2026-11-16"], today)).toEqual({ current: 0, longest: 2 });
  });

  it("finds the longest run in the past", () => {
    const dates = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-10", "2026-11-17", "2026-11-18"];
    expect(calculateStreaks(dates, today)).toEqual({ current: 2, longest: 4 });
  });

  it("handles unsorted input, duplicates and month boundaries", () => {
    const dates = ["2026-11-01", "2026-10-31", "2026-11-01", "2026-10-30"];
    expect(calculateStreaks(dates, "2026-11-02")).toEqual({ current: 3, longest: 3 });
  });

  it("ignores dates after today", () => {
    expect(calculateStreaks(["2026-11-18", "2026-11-19", "2026-11-20"], today)).toEqual({ current: 1, longest: 1 });
  });
});

describe("isTodayInColombo (daily purpose lock)", () => {
  // Asia/Colombo is UTC+05:30
  const at = (local: string) => new Date(`${local}+05:30`);

  it("allows today from 00:00 to 23:59", () => {
    expect(isTodayInColombo("2026-11-21", at("2026-11-21T00:00:00"))).toBe(true);
    expect(isTodayInColombo("2026-11-21", at("2026-11-21T12:00:00"))).toBe(true);
    expect(isTodayInColombo("2026-11-21", at("2026-11-21T23:59:59"))).toBe(true);
  });

  it("locks the day at midnight: yesterday's purpose is rejected", () => {
    const midnight = at("2026-11-22T00:00:00");
    expect(isTodayInColombo("2026-11-21", midnight)).toBe(false);
    expect(dayStatus("2026-11-21", midnight)).toBe("past");
    expect(dayStatus("2026-11-22", midnight)).toBe("today");
  });

  it("uses the Colombo date, not UTC", () => {
    // 19:00 UTC on the 21st is already 00:30 on the 22nd in Colombo
    expect(dayStatus("2026-11-21", new Date("2026-11-21T19:00:00Z"))).toBe("past");
    expect(isTodayInColombo("2026-11-22", new Date("2026-11-21T19:00:00Z"))).toBe(true);
  });

  it("rejects future dates", () => {
    expect(isTodayInColombo("2026-11-22", at("2026-11-21T23:59:59"))).toBe(false);
    expect(dayStatus("2026-11-22", at("2026-11-21T23:59:59"))).toBe("future");
  });
});
