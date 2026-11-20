/// <reference types="vitest/globals" />
import { entrySchema } from "./entrySchema";

const minimal = { mood: 7, energy: 6, sleepHours: 7.5 };

function errorOf(body: unknown): string | undefined {
  const result = entrySchema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("entrySchema", () => {
  it("accepts a minimal entry and fills in empty lists", () => {
    expect(entrySchema.parse(minimal)).toEqual({
      ...minimal,
      workouts: [],
      mentalActivities: [],
      outdoorActivities: [],
      goodThings: [],
      learnings: [],
      presentMoment: "",
    });
  });

  it("accepts a full entry and trims text", () => {
    const parsed = entrySchema.parse({
      ...minimal,
      weightKg: 72.4,
      steps: 9500,
      activeCalories: 420,
      workouts: [{ type: " Cycling ", durationMin: 45, notes: "Hills" }],
      mentalActivities: [{ type: "Meditation" }],
      outdoorActivities: [{ type: "Sunlight", durationMin: 20 }],
      goodThings: ["  Good coffee "],
      learnings: [{ topic: "Mongo indexes", minutes: 30 }],
      presentMoment: " Calm ",
    });
    expect(parsed.workouts[0]?.type).toBe("Cycling");
    expect(parsed.goodThings).toEqual(["Good coffee"]);
    expect(parsed.presentMoment).toBe("Calm");
  });

  it("allows null to clear optional numbers", () => {
    expect(errorOf({ ...minimal, weightKg: null, steps: null, activeCalories: null })).toBeUndefined();
  });

  it("requires mood, energy and sleep", () => {
    expect(errorOf({ energy: 5, sleepHours: 7 })).toBe("Mood must be a number");
    expect(errorOf({ mood: 5, sleepHours: 7 })).toBe("Energy must be a number");
    expect(errorOf({ mood: 5, energy: 5 })).toBe("Sleep must be a number");
  });

  it("checks ranges", () => {
    expect(errorOf({ ...minimal, mood: 11 })).toBe("Mood must be between 1 and 10");
    expect(errorOf({ ...minimal, mood: 0 })).toBe("Mood must be between 1 and 10");
    expect(errorOf({ ...minimal, mood: 6.5 })).toBe("Mood must be a whole number");
    expect(errorOf({ ...minimal, sleepHours: 25 })).toBe("Sleep must be between 0 and 24 hours");
    expect(errorOf({ ...minimal, weightKg: 20 })).toBe("Weight must be between 30 and 300 kg");
    expect(errorOf({ ...minimal, steps: -1 })).toBe("Steps must be between 0 and 200000");
  });

  it("keeps the source and calories of watch workouts", () => {
    const watch = { type: "Running", durationMin: 30, source: "watch", calories: 280 };
    expect(entrySchema.parse({ ...minimal, workouts: [watch] }).workouts).toEqual([watch]);
    expect(errorOf({ ...minimal, workouts: [{ type: "Run", durationMin: 5, source: "phone" }] })).toMatch(/manual|watch/);
  });

  it("requires minutes for workouts but not for other activities", () => {
    expect(errorOf({ ...minimal, workouts: [{ type: "Gym" }] })).toBe("Workout minutes must be a number");
    expect(errorOf({ ...minimal, workouts: [{ type: "Gym", durationMin: 0 }] })).toBe(
      "Please enter how many minutes each workout took",
    );
    expect(errorOf({ ...minimal, mentalActivities: [{ type: "Reading" }] })).toBeUndefined();
  });

  it("rejects empty names and too many items", () => {
    expect(errorOf({ ...minimal, outdoorActivities: [{ type: "   " }] })).toBe("Activity name is required");
    expect(errorOf({ ...minimal, goodThings: [""] })).toBe("Good things can't be empty");
    expect(errorOf({ ...minimal, goodThings: Array.from({ length: 21 }, () => "x") })).toBe(
      "You can add up to 20 good things",
    );
  });

  it("limits the present moment to 2000 characters", () => {
    expect(errorOf({ ...minimal, presentMoment: "a".repeat(2000) })).toBeUndefined();
    expect(errorOf({ ...minimal, presentMoment: "a".repeat(2001) })).toBe(
      "Present moment must be 2000 characters or less",
    );
  });

  it("rejects unknown fields, so userId or date can't be smuggled in", () => {
    expect(entrySchema.safeParse({ ...minimal, userId: "someone-else" }).success).toBe(false);
    expect(entrySchema.safeParse({ ...minimal, date: "2026-01-01" }).success).toBe(false);
  });
});
