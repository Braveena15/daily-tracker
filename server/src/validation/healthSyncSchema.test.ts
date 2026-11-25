import { healthSyncSchema, IGNORED_SYNC_FIELDS, looseNumber, MAX_SYNC_AGE_DAYS, resolveSyncDate, SyncDateError } from "./healthSyncSchema";

const parse = (body: unknown) => healthSyncSchema.parse(body);
const errorOf = (body: unknown) => {
  const result = healthSyncSchema.safeParse(body);
  if (result.success) throw new Error("expected a validation error");
  return result.error.issues[0]!.message;
};

describe("looseNumber", () => {
  it("passes real numbers through", () => {
    expect(looseNumber(8234)).toBe(8234);
    expect(looseNumber(72.456)).toBe(72.456);
  });

  it("treats missing, null and empty text as not sent", () => {
    expect(looseNumber(undefined)).toBeUndefined();
    expect(looseNumber(null)).toBeUndefined();
    expect(looseNumber("")).toBeUndefined();
    expect(looseNumber("   ")).toBeUndefined();
  });

  it("reads numbers sent as text, with separators, decimal commas or units", () => {
    expect(looseNumber("8234")).toBe(8234);
    expect(looseNumber(" 512.75 ")).toBe(512.75);
    expect(looseNumber("8,234")).toBe(8234);
    expect(looseNumber("12 345")).toBe(12345);
    expect(looseNumber("1,234.5")).toBe(1234.5);
    expect(looseNumber("7,5")).toBe(7.5);
    expect(looseNumber("72.4 kg")).toBe(72.4);
    expect(looseNumber("350kcal")).toBe(350);
  });

  it("leaves text that isn't a number unchanged (so validation rejects it)", () => {
    expect(looseNumber("lots")).toBe("lots");
    expect(looseNumber("1.2.3")).toBe("1.2.3");
  });
});

describe("healthSyncSchema", () => {
  it("coerces sleep hours sent as text and rounds them", () => {
    expect(parse({ sleepHours: "7.4567" })).toEqual({ sleepHours: 7.46 });
    expect(parse({ sleepHours: "7,5 h" })).toEqual({ sleepHours: 7.5 });
  });

  it("only reads date and sleep: steps, calories, exercise, workouts and weight are dropped", () => {
    expect(
      parse({ steps: "8,234", stepsWatch: 6120, stepsPhone: "lots", activeCalories: -1, restingCalories: 1650, exerciseMinutes: 41, workouts: "Running", weightKg: 72.4, sleepHours: 8 }),
    ).toEqual({ sleepHours: 8 });
    expect(IGNORED_SYNC_FIELDS).toEqual(["steps", "stepsWatch", "stepsPhone", "activeCalories", "restingCalories", "exerciseMinutes", "workouts", "weightKg"]);
  });

  it("accepts sleepSamples as text or as a list of lines", () => {
    const a = "2026-11-19T23:00:00+05:30;2026-11-20T06:30:00+05:30;Core";
    const b = "2026-11-20T02:00:00+05:30;2026-11-20T02:10:00+05:30;Awake";
    expect(parse({ sleepSamples: `${a}\n${b}` }).sleepSamples).toBe(`${a}\n${b}`);
    expect(parse({ sleepSamples: [a, b] }).sleepSamples).toBe(`${a}\n${b}`);
    expect(parse({ sleepSamples: "  " })).toEqual({});
    expect(errorOf({ sleepSamples: 42 })).toMatch(/sleepSamples must be text/);
    expect(errorOf({ sleepSamples: "x".repeat(200_001) })).toMatch(/too long/);
  });

  it("drops empty values instead of failing", () => {
    expect(parse({ sleepHours: "" })).toEqual({});
    expect(parse({ sleepHours: null, sleepSamples: "" })).toEqual({});
  });

  it("rejects sleep hours outside the limits, or that aren't a number", () => {
    expect(errorOf({ sleepHours: 25 })).toBe("sleepHours must be between 0 and 24 hours");
    expect(errorOf({ sleepHours: "lots" })).toBe("sleepHours must be a number");
  });

  it("keeps only the date part of an ISO date-time", () => {
    expect(parse({ date: "2026-11-20T21:00:00+05:30" }).date).toBe("2026-11-20");
    // A UTC time is turned into the Colombo day: 19:00Z is 00:30 the next day there
    expect(parse({ date: "2026-11-20T19:00:00Z" }).date).toBe("2026-11-21");
    expect(parse({ date: "2026-11-20T18:00:00.000Z" }).date).toBe("2026-11-20");
    expect(parse({ date: "2026-11-20T23:30:00" }).date).toBe("2026-11-20");
    expect(parse({ date: "" }).date).toBeUndefined();
  });
});

describe("resolveSyncDate", () => {
  const today = "2026-11-20";

  it("defaults to today", () => {
    expect(resolveSyncDate(undefined, today)).toBe(today);
  });

  it(`accepts today back to ${MAX_SYNC_AGE_DAYS} days ago`, () => {
    expect(resolveSyncDate("2026-11-20", today)).toBe("2026-11-20");
    expect(resolveSyncDate("2026-11-06", today)).toBe("2026-11-06");
  });

  it("rejects future dates", () => {
    expect(() => resolveSyncDate("2026-11-21", today)).toThrow(SyncDateError);
    expect(() => resolveSyncDate("2026-11-21", today)).toThrow(/future/);
  });

  it(`rejects dates older than ${MAX_SYNC_AGE_DAYS} days`, () => {
    expect(() => resolveSyncDate("2026-11-05", today)).toThrow(/too old/);
  });

  it("rejects invalid dates", () => {
    expect(() => resolveSyncDate("2026-02-30", "2026-03-01")).toThrow(/real date/);
    expect(() => resolveSyncDate("20/11/2026", today)).toThrow(/YYYY-MM-DD/);
  });

  it("uses Asia/Colombo for today by default", () => {
    // 20:00 UTC on 20 Nov is already 01:30 on 21 Nov in Colombo
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T20:00:00Z"));
    try {
      expect(resolveSyncDate(undefined)).toBe("2026-11-21");
      expect(resolveSyncDate("2026-11-21")).toBe("2026-11-21");
    } finally {
      vi.useRealTimers();
    }
  });
});
