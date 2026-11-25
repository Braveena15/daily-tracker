/// <reference types="vitest/globals" />
import { dailySchema, entryPatchSchemas, entrySchemas } from "./entrySchema";
import type { z } from "zod";

function errorOf(schema: z.ZodType, body: unknown): string | undefined {
  const result = schema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("dailySchema (PUT /:date/daily)", () => {
  it("accepts any of weight, steps and active calories", () => {
    expect(dailySchema.parse({ weightKg: 72.4 })).toEqual({ weightKg: 72.4 });
    expect(dailySchema.parse({ steps: 9500, activeCalories: 420 })).toEqual({ steps: 9500, activeCalories: 420 });
  });

  it("allows null to clear a value", () => {
    expect(dailySchema.parse({ steps: null })).toEqual({ steps: null });
  });

  it("checks ranges and whole numbers", () => {
    expect(errorOf(dailySchema, { weightKg: 10 })).toBe("Weight must be between 30 and 300 kg");
    expect(errorOf(dailySchema, { steps: 12.5 })).toBe("Steps must be a whole number");
    expect(errorOf(dailySchema, { activeCalories: -1 })).toBe("Active calories must be between 0 and 10000 kcal");
  });

  it("rejects an empty body and unknown fields", () => {
    expect(errorOf(dailySchema, {})).toBe("Send weightKg, steps, activeCalories, sleepHours or sleepScoreValue");
    expect(errorOf(dailySchema, { steps: 10, userId: "x" })).toBeDefined();
  });

  it("takes manual sleep hours and an optional 0–100 sleep score", () => {
    expect(dailySchema.parse({ sleepHours: 7.5, sleepScoreValue: 82 })).toEqual({ sleepHours: 7.5, sleepScoreValue: 82 });
    expect(dailySchema.parse({ sleepHours: null, sleepScoreValue: null })).toEqual({ sleepHours: null, sleepScoreValue: null });
    expect(errorOf(dailySchema, { sleepHours: 25 })).toBe("Hours slept must be between 0 and 24 hours");
    expect(errorOf(dailySchema, { sleepScoreValue: 101 })).toBe("Sleep score must be between 0 and 100");
    expect(errorOf(dailySchema, { sleepScoreValue: 80.5 })).toBe("Sleep score must be a whole number");
  });
});

describe("entrySchemas (POST /:date/:kind)", () => {
  it("accepts a mood check-in with an optional note and time", () => {
    expect(entrySchemas.moods.parse({ mood: 7, energy: 6 })).toEqual({ mood: 7, energy: 6 });
    expect(entrySchemas.moods.parse({ mood: 7, energy: 6, note: " Calm ", time: "08:15" })).toEqual({
      mood: 7,
      energy: 6,
      note: "Calm",
      time: "08:15",
    });
    // An empty note counts as no note
    expect(entrySchemas.moods.parse({ mood: 7, energy: 6, note: "" })).toEqual({ mood: 7, energy: 6 });
  });

  it("checks mood and energy", () => {
    expect(errorOf(entrySchemas.moods, { mood: 11, energy: 5 })).toBe("Mood must be between 1 and 10");
    expect(errorOf(entrySchemas.moods, { mood: 5 })).toBe("Energy must be a number");
    expect(errorOf(entrySchemas.moods, { mood: 5.5, energy: 5 })).toBe("Mood must be a whole number");
  });

  it("rejects a badly formed time", () => {
    expect(errorOf(entrySchemas.goodThings, { text: "Sun", time: "8:15" })).toBe('time must be a 24-hour time like "08:15"');
    expect(errorOf(entrySchemas.goodThings, { text: "Sun", time: "24:00" })).toBeDefined();
  });

  it("requires minutes for workouts but not for other activities", () => {
    expect(errorOf(entrySchemas.workouts, { type: "Gym" })).toBe("Workout minutes must be a number");
    expect(errorOf(entrySchemas.workouts, { type: "Gym", durationMin: 0 })).toBe("Please enter how many minutes the workout took");
    expect(entrySchemas.mental.parse({ type: " Meditation " })).toEqual({ type: "Meditation" });
    expect(entrySchemas.outdoor.parse({ type: "Sunlight", durationMin: 20 })).toEqual({ type: "Sunlight", durationMin: 20 });
  });

  it("doesn't let a workout claim to come from the watch", () => {
    expect(errorOf(entrySchemas.workouts, { type: "Gym", durationMin: 30, source: "watch" })).toBeDefined();
  });

  it("requires text for good things and present moments", () => {
    expect(errorOf(entrySchemas.goodThings, { text: "   " })).toBe("Good things can't be empty");
    expect(errorOf(entrySchemas.presentMoments, { text: "" })).toBe("Write a few words first");
    expect(errorOf(entrySchemas.presentMoments, { text: "x".repeat(2001) })).toBe("Present moment must be 2000 characters or less");
  });

  it("accepts a learning", () => {
    expect(entrySchemas.learnings.parse({ topic: "Mongo indexes", minutes: 30, details: "" })).toEqual({ topic: "Mongo indexes", minutes: 30 });
    expect(errorOf(entrySchemas.learnings, { topic: "" })).toBe("Each learning needs a topic");
  });

  it("rejects unknown fields, so userId, date or loggedAt can't be smuggled in", () => {
    expect(errorOf(entrySchemas.goodThings, { text: "Sun", userId: "someone-else" })).toBeDefined();
    expect(errorOf(entrySchemas.goodThings, { text: "Sun", loggedAt: "2020-01-01T00:00:00Z" })).toBeDefined();
  });
});

describe("entryPatchSchemas (PATCH /:date/:kind/:id)", () => {
  it("accepts some of the fields", () => {
    expect(entryPatchSchemas.moods.parse({ energy: 8 })).toEqual({ energy: 8 });
    expect(entryPatchSchemas.workouts.parse({ time: "07:30" })).toEqual({ time: "07:30" });
  });

  it("allows null only for optional fields", () => {
    expect(entryPatchSchemas.learnings.parse({ minutes: null, details: null })).toEqual({ minutes: null, details: null });
    expect(errorOf(entryPatchSchemas.learnings, { topic: null })).toBeDefined();
  });

  it("still validates what's sent, and needs at least one change", () => {
    expect(errorOf(entryPatchSchemas.moods, { mood: 0 })).toBe("Mood must be between 1 and 10");
    expect(errorOf(entryPatchSchemas.moods, {})).toBe("Nothing to change");
  });
});

describe("water entries", () => {
  it("accepts 50–2000 whole ml, with an optional earlier time", () => {
    expect(entrySchemas.water.parse({ amountMl: 250 })).toEqual({ amountMl: 250 });
    expect(entrySchemas.water.parse({ amountMl: 2000, time: "07:30" })).toEqual({ amountMl: 2000, time: "07:30" });
    expect(entrySchemas.water.parse({ amountMl: 50 })).toEqual({ amountMl: 50 });
  });
  it("refuses amounts outside 50–2000 ml, fractions, text and extra fields", () => {
    for (const body of [{ amountMl: 49 }, { amountMl: 2001 }, { amountMl: 0 }, { amountMl: -250 }, { amountMl: 250.5 }, { amountMl: "250" }, {}, { amountMl: 250, note: "x" }]) {
      expect(entrySchemas.water.safeParse(body).success).toBe(false);
    }
  });
});
