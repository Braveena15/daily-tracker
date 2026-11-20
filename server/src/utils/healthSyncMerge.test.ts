import { fieldsStillFromWatch, planHealthMerge, syncedSteps, type MergeTarget, type StoredWorkout } from "./healthSyncMerge";

const at = new Date("2026-11-20T15:30:00Z");

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
    expect(plan.set.workouts).toEqual([
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

    expect(planHealthMerge(afterFirst, body, at).set.workouts).toEqual([
      { type: "Gym", durationMin: 40, source: "manual" },
      { type: "Running", durationMin: 30, source: "watch" },
    ]);

    // A later sync with a longer run replaces the old one
    expect(planHealthMerge(afterFirst, { workouts: [{ type: "Running", durationMin: 45 }] }, at).set.workouts).toEqual([
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

  it("keeps the day within 20 workouts, manual ones first", () => {
    const manual = Array.from({ length: 18 }, (_, i) => ({ type: `M${i}`, durationMin: 5 }));
    const watch = Array.from({ length: 5 }, (_, i) => ({ type: `W${i}`, durationMin: 5 }));
    const merged = planHealthMerge({ workouts: manual }, { workouts: watch }, at).set.workouts as StoredWorkout[];
    expect(merged).toHaveLength(20);
    expect(merged.slice(0, 18).map((w) => w.type)).toEqual(manual.map((w) => w.type));
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
