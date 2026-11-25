/// <reference types="vitest/globals" />
// Only sleep comes from the watch; manual sleep is never overwritten by a sync.
import { planHealthMerge, type StoredSleep } from "./healthSyncMerge";

const at = new Date("2026-11-20T15:30:00Z");

const night = (score = 95): StoredSleep => ({
  totalSleepMin: 434,
  deepMin: 60,
  remMin: 110,
  coreMin: 264,
  awakeCount: 2,
  awakeMin: 16,
  bedtime: "23:00",
  wakeTime: "06:30",
  score,
  breakdown: [],
  source: "watch",
});

describe("planHealthMerge", () => {
  it("stores the watch's night, its hours and its score on a new day", () => {
    const plan = planHealthMerge(null, {}, at, night(82));
    expect(plan.set).toEqual({
      sleep: night(82),
      sleepHours: 7.23,
      sleepHoursSource: "watch",
      sleepScoreValue: 82,
      sleepScoreSource: "auto",
      healthSync: { source: "apple-health", syncedAt: at, fields: ["sleepHours"] },
    });
    expect(plan.updatedFields).toEqual(["sleepHours"]);
    expect(plan.keptFields).toEqual([]);
  });

  it("refreshes earlier watch values with a new night", () => {
    const plan = planHealthMerge({ sleepHours: 6, sleepHoursSource: "watch", sleepScoreValue: 70, sleepScoreSource: "auto" }, {}, at, night(76));
    expect(plan.set).toMatchObject({ sleepHours: 7.23, sleepHoursSource: "watch", sleepScoreValue: 76, sleepScoreSource: "auto" });
  });

  it("never overwrites hours or a score you entered yourself, but still keeps the night's stages", () => {
    const plan = planHealthMerge({ sleepHours: 6.5, sleepHoursSource: "manual", sleepScoreValue: 91, sleepScoreSource: "manual" }, { sleepHours: 8 }, at, night(76));
    expect(plan.set.sleep).toEqual(night(76));
    for (const field of ["sleepHours", "sleepHoursSource", "sleepScoreValue", "sleepScoreSource"]) {
      expect(plan.set, field).not.toHaveProperty(field);
    }
    expect(plan.updatedFields).toEqual([]);
    expect(plan.keptFields).toEqual(["sleepHours"]);
  });

  it("keeps manual hours but fills an empty score from the watch", () => {
    const plan = planHealthMerge({ sleepHours: 6.5, sleepHoursSource: "manual" }, {}, at, night(80));
    expect(plan.set).not.toHaveProperty("sleepHours");
    expect(plan.set).toMatchObject({ sleepScoreValue: 80, sleepScoreSource: "auto" });
  });

  it("fills sleepHours sent on its own only when the day has none", () => {
    expect(planHealthMerge(null, { sleepHours: 7.5 }, at).set).toMatchObject({ sleepHours: 7.5, sleepHoursSource: "watch" });
    expect(planHealthMerge({ sleepHours: 0 }, { sleepHours: 7.5 }, at)).toMatchObject({ set: {}, updatedFields: [], keptFields: ["sleepHours"] });
    expect(planHealthMerge({ sleepHours: 6, sleepHoursSource: "manual" }, { sleepHours: 7.5 }, at).set).toEqual({});
  });

  it("samples win over plain sleepHours when both are sent", () => {
    expect(planHealthMerge(null, { sleepHours: 9 }, at, night()).set.sleepHours).toBe(7.23);
  });

  it("changes nothing when no sleep was sent", () => {
    expect(planHealthMerge({ sleepScoreValue: 82, sleepScoreSource: "auto" }, {}, at)).toEqual({ set: {}, updatedFields: [], keptFields: [] });
  });
});
