import {
  fieldsStillFromWatch,
  planHealthMerge,
  syncedSteps,
  type MergeTarget,
  type StoredSleep,
  type StoredWorkout,
} from "./healthSyncMerge";

const at = new Date("2026-11-20T15:30:00Z");

/** Workouts without the generated _id and loggedAt, for comparing. */
const plain = (workouts: unknown) =>
  (workouts as StoredWorkout[]).map(({ _id, loggedAt, ...w }) => w);

describe("planHealthMerge", () => {
  it("creates a new day's values when there's no entry yet", () => {
    const plan = planHealthMerge(null, { steps: 8234, activeCalories: 512, weightKg: 72.4, sleepHours: 7.5 }, at);
    expect(plan.set).toEqual({
      steps: 8234,
      activeCalories: 512,
      weightKg: 72.4,
      sleepHours: 7.5,
      healthSync: { source: "apple-health", syncedAt: at, fields: ["activeCalories", "steps", "weightKg", "sleepHours"] },
    });
    expect(plan.updatedFields).toEqual(["activeCalories", "steps", "weightKg", "sleepHours"]);
    expect(plan.keptFields).toEqual([]);
  });

  it("overwrites steps, active/resting calories and exercise minutes", () => {
    const plan = planHealthMerge(
      { weightKg: null, sleepHours: null, workouts: [] },
      { steps: 9000, activeCalories: 600, restingCalories: 1600, exerciseMinutes: 45 },
      at,
    );
    expect(plan.set).toMatchObject({ steps: 9000, activeCalories: 600, restingCalories: 1600, exerciseMinutes: 45 });
  });

  it("prefers watch steps over phone steps when the watch counted any (2026 watch, 3084 phone → 2026)", () => {
    const plan = planHealthMerge(null, { stepsWatch: 2026, stepsPhone: 3084 }, at);
    expect(plan.set.steps).toBe(2026);
    expect(plan.updatedFields).toEqual(["steps"]);
    expect(plan.set).not.toHaveProperty("stepsWatch");
    expect(plan.set).not.toHaveProperty("stepsPhone");
    expect(syncedSteps({ stepsWatch: 9100, stepsPhone: 4000 })).toBe(9100);
  });

  it("falls back to phone steps when the watch counted 0 or wasn't sent", () => {
    expect(syncedSteps({ stepsWatch: 0, stepsPhone: 3084 })).toBe(3084);
    expect(syncedSteps({ stepsPhone: 3084 })).toBe(3084);
    expect(syncedSteps({ stepsWatch: 0 })).toBe(0);
  });

  it("ignores plain steps when watch or phone steps are sent", () => {
    expect(syncedSteps({ stepsWatch: 2026, steps: 9999 })).toBe(2026);
    expect(syncedSteps({ stepsPhone: 3200, steps: 9999 })).toBe(3200);
    expect(syncedSteps({ stepsWatch: 0, steps: 9999 })).toBe(0);
  });

  it("uses plain steps when neither watch nor phone steps are sent", () => {
    expect(syncedSteps({ steps: 5000 })).toBe(5000);
    expect(syncedSteps({})).toBeUndefined();
  });

  it("ignores zero or missing active calories so the burn falls back to the TDEE estimate", () => {
    const zero = planHealthMerge(null, { activeCalories: 0, steps: 1200 }, at);
    expect(zero.set).not.toHaveProperty("activeCalories");
    expect(zero.updatedFields).toEqual(["steps"]);
    expect(zero.set.healthSync).toMatchObject({ fields: ["steps"] });

    const missing = planHealthMerge(null, { steps: 1200 }, at);
    expect(missing.set).not.toHaveProperty("activeCalories");
    expect(missing.updatedFields).not.toContain("activeCalories");
  });

  it("keeps an earlier synced active calories value when a later sync sends 0", () => {
    const plan = planHealthMerge(
      { workouts: [], healthSync: { fields: ["activeCalories"] } },
      { activeCalories: 0, restingCalories: 1600 },
      at,
    );
    expect(plan.set).not.toHaveProperty("activeCalories");
    expect(plan.updatedFields).toEqual(["restingCalories"]);
  });

  it("stores watch sleep and overwrites sleepHours from it, even over a manual value", () => {
    const sleep: StoredSleep = {
      totalSleepMin: 434,
      deepMin: 60,
      remMin: 110,
      coreMin: 264,
      awakeCount: 2,
      awakeMin: 16,
      bedtime: "23:00",
      wakeTime: "06:30",
      score: 95,
      breakdown: [],
      source: "watch",
    };
    const plan = planHealthMerge({ sleepHours: 6, workouts: [] }, { sleepHours: 8 }, at, sleep);
    expect(plan.set.sleep).toEqual(sleep);
    expect(plan.set.sleepHours).toBe(7.23);
    expect(plan.updatedFields).toEqual(["sleepHours"]);
    expect(plan.keptFields).toEqual([]);
  });

  describe("sleep score field", () => {
    const night = (score: number): StoredSleep => ({
      totalSleepMin: 434, deepMin: 60, remMin: 110, coreMin: 264, awakeCount: 2, awakeMin: 16,
      bedtime: "23:00", wakeTime: "06:30", score, breakdown: [], source: "watch",
    });

    it("auto-fills the field from the calculated score on a new or empty day", () => {
      expect(planHealthMerge(null, {}, at, night(82)).set).toMatchObject({ sleepScoreValue: 82, sleepScoreSource: "auto" });
      expect(planHealthMerge({ sleepHours: 6 }, {}, at, night(82)).set).toMatchObject({ sleepScoreValue: 82, sleepScoreSource: "auto" });
    });

    it("refreshes an auto value on a later sync", () => {
      const plan = planHealthMerge({ sleepScoreValue: 82, sleepScoreSource: "auto" }, {}, at, night(76));
      expect(plan.set).toMatchObject({ sleepScoreValue: 76, sleepScoreSource: "auto" });
    });

    it("never overwrites a score you typed in", () => {
      const plan = planHealthMerge({ sleepScoreValue: 91, sleepScoreSource: "manual" }, {}, at, night(76));
      expect(plan.set).not.toHaveProperty("sleepScoreValue");
      expect(plan.set).not.toHaveProperty("sleepScoreSource");
      expect(plan.set.sleep).toEqual(night(76));
    });

    it("leaves the field alone when no sleep samples were synced", () => {
      expect(planHealthMerge({ sleepScoreValue: 82, sleepScoreSource: "auto" }, { steps: 10 }, at).set).not.toHaveProperty("sleepScoreValue");
    });
  });

  it("only fills weight and sleep when the day doesn't have them", () => {
    const manual: MergeTarget = { weightKg: 71.0, sleepHours: 6, workouts: [] };
    const plan = planHealthMerge(manual, { weightKg: 72.4, sleepHours: 8, steps: 100 }, at);
    expect(plan.set).not.toHaveProperty("weightKg");
    expect(plan.set).not.toHaveProperty("sleepHours");
    expect(plan.updatedFields).toEqual(["steps"]);
    expect(plan.keptFields).toEqual(["weightKg", "sleepHours"]);
  });

  it("treats 0 hours of sleep as a real value, and fills only what's missing", () => {
    expect(planHealthMerge({ weightKg: 70, sleepHours: 0 }, { weightKg: 72, sleepHours: 7 }, at).updatedFields).toEqual([]);
    expect(planHealthMerge({ weightKg: 70 }, { sleepHours: 7 }, at).set.sleepHours).toBe(7);
  });

  it("leaves fields that weren't sent alone", () => {
    const plan = planHealthMerge({ weightKg: null, workouts: [{ type: "Gym", durationMin: 40 }] }, { steps: 1 }, at);
    expect(Object.keys(plan.set).sort()).toEqual(["healthSync", "steps"]);
  });

  it("adds watch workouts and keeps manual ones", () => {
    const existing: MergeTarget = {
      workouts: [
        { type: "Gym", durationMin: 40, source: "manual" },
        { type: "Yoga", durationMin: 15 }, // older entries have no source: treated as manual
      ],
    };
    const plan = planHealthMerge(existing, { workouts: [{ type: "Running", durationMin: 30, calories: 280 }] }, at);
    expect(plain(plan.set.workouts)).toEqual([
      { type: "Gym", durationMin: 40, source: "manual" },
      { type: "Yoga", durationMin: 15 },
      { type: "Running", durationMin: 30, source: "watch", calories: 280 },
    ]);
    expect(plan.updatedFields).toEqual(["workouts"]);
  });

  it("replaces earlier watch workouts, so syncing twice doesn't duplicate them", () => {
    const body = { workouts: [{ type: "Running", durationMin: 30 }] };
    const first = planHealthMerge({ workouts: [{ type: "Gym", durationMin: 40, source: "manual" }] }, body, at);
    const afterFirst = { workouts: first.set.workouts as StoredWorkout[] };

    const second = planHealthMerge(afterFirst, body, new Date("2026-11-20T16:00:00Z")).set.workouts as StoredWorkout[];
    expect(plain(second)).toEqual([
      { type: "Gym", durationMin: 40, source: "manual" },
      { type: "Running", durationMin: 30, source: "watch" },
    ]);
    // The same run synced again keeps its id and time, so it doesn't move on the timeline
    expect(second[1]!._id).toEqual(afterFirst.workouts[1]!._id);
    expect(second[1]!.loggedAt).toEqual(at);

    // A later sync with a longer run replaces the old one
    expect(plain(planHealthMerge(afterFirst, { workouts: [{ type: "Running", durationMin: 45 }] }, at).set.workouts)).toEqual([
      { type: "Gym", durationMin: 40, source: "manual" },
      { type: "Running", durationMin: 45, source: "watch" },
    ]);
  });

  it("an empty workouts list removes watch workouts but keeps manual ones", () => {
    const plan = planHealthMerge(
      { workouts: [{ type: "Gym", durationMin: 40 }, { type: "Run", durationMin: 20, source: "watch" }] },
      { workouts: [] },
      at,
    );
    expect(plan.set.workouts).toEqual([{ type: "Gym", durationMin: 40 }]);
  });

  it("not sending workouts leaves every workout as it is", () => {
    const plan = planHealthMerge({ workouts: [{ type: "Run", durationMin: 20, source: "watch" }] }, { steps: 5 }, at);
    expect(plan.set).not.toHaveProperty("workouts");
  });

  it("keeps the day within 50 workouts, manual ones first", () => {
    const manual = Array.from({ length: 48 }, (_, i) => ({ type: `M${i}`, durationMin: 5 }));
    const watch = Array.from({ length: 5 }, (_, i) => ({ type: `W${i}`, durationMin: 5 }));
    const merged = planHealthMerge({ workouts: manual }, { workouts: watch }, at).set.workouts as StoredWorkout[];
    expect(merged).toHaveLength(50);
    expect(merged.slice(0, 48).map((w) => w.type)).toEqual(manual.map((w) => w.type));
  });

  it("times a watch workout by its startTime when the Shortcut sends one", () => {
    const start = new Date("2026-11-20T01:30:00Z");
    const plan = planHealthMerge(null, { workouts: [{ type: "Running", durationMin: 30, startTime: start }] }, at);
    expect((plan.set.workouts as StoredWorkout[])[0]!.loggedAt).toEqual(start);
  });

  describe("steps and active calories only increase", () => {
    it("replaces the stored value when the synced one is higher", () => {
      const plan = planHealthMerge({ steps: 4000, activeCalories: 200 }, { steps: 5230, activeCalories: 320 }, at);
      expect(plan.set).toMatchObject({ steps: 5230, activeCalories: 320 });
      expect(plan.updatedFields).toEqual(["activeCalories", "steps"]);
    });

    it("keeps the stored value when the synced one is lower or the same", () => {
      const plan = planHealthMerge({ steps: 9000, activeCalories: 500 }, { steps: 8500, activeCalories: 500 }, at);
      expect(plan.set).not.toHaveProperty("steps");
      expect(plan.set).not.toHaveProperty("activeCalories");
      expect(plan.keptFields).toEqual(["activeCalories", "steps"]);
      expect(plan.snapshot).toBeNull();
    });

    it("fills them in when nothing is stored yet", () => {
      expect(planHealthMerge(null, { steps: 120 }, at).set.steps).toBe(120);
      expect(planHealthMerge({ steps: null }, { stepsWatch: 0, stepsPhone: 300 }, at).set.steps).toBe(300);
    });

    it("also beats a lower manual value", () => {
      // You typed 3000; the watch later counted 6000
      const plan = planHealthMerge({ steps: 3000, healthSync: { fields: [] } }, { steps: 6000 }, at);
      expect(plan.set.steps).toBe(6000);
      expect((plan.set.healthSync as { fields: string[] }).fields).toEqual(["steps"]);
    });
  });

  describe("health snapshots", () => {
    it("records the day's totals whenever steps or calories change", () => {
      const plan = planHealthMerge({ steps: 4000, activeCalories: 300 }, { steps: 5230 }, at);
      expect(plan.snapshot).toEqual({ time: at, steps: 5230, activeCalories: 300 });
    });

    it("leaves out a total the day doesn't have", () => {
      expect(planHealthMerge(null, { activeCalories: 150 }, at).snapshot).toEqual({ time: at, activeCalories: 150 });
    });

    it("isn't recorded when only other fields were synced", () => {
      expect(planHealthMerge({ steps: 100 }, { restingCalories: 1500, weightKg: 70 }, at).snapshot).toBeNull();
    });
  });

  it("remembers watch fields from earlier syncs", () => {
    const plan = planHealthMerge(
      { weightKg: 72.4, healthSync: { fields: ["weightKg", "steps"] } },
      { steps: 9000, activeCalories: 400 },
      at,
    );
    expect(plan.set.healthSync).toEqual({
      source: "apple-health",
      syncedAt: at,
      fields: ["weightKg", "steps", "activeCalories"],
    });
  });
});

describe("fieldsStillFromWatch", () => {
  it("drops the mark from fields changed by hand", () => {
    expect(
      fieldsStillFromWatch(
        ["steps", "weightKg", "activeCalories", "sleepHours"],
        { steps: 8000, weightKg: 72.4, activeCalories: 500, sleepHours: 7 },
        { steps: 8500, weightKg: 72.4, activeCalories: null, sleepHours: 7 },
      ),
    ).toEqual(["weightKg", "sleepHours"]);
  });

  it("keeps watch-only fields and workouts (marked per workout)", () => {
    expect(fieldsStillFromWatch(["restingCalories", "exerciseMinutes", "workouts"], {}, {})).toEqual([
      "restingCalories",
      "exerciseMinutes",
      "workouts",
    ]);
  });

  it("treats missing and null as the same", () => {
    expect(fieldsStillFromWatch(["steps"], { steps: undefined }, { steps: null })).toEqual(["steps"]);
  });
});
