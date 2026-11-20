/// <reference types="vitest/globals" />
// Privacy tests: free text written by the user (and anything identifying) must never reach
// an AI payload unless the rules allow it. Every free-text field below holds a unique
// "SECRET_…" marker, and the tests check the final JSON for those markers.
import {
  buildBoostContext,
  buildDailyContext,
  buildThoughtContext,
  buildWeeklyContext,
  isLowMoodToday,
  relativeDay,
  type ThoughtInput,
} from "./buildContext";
import { buildPrompt } from "./prompts";
import type { ScoreEntry } from "../utils/scores";

const TODAY = "2026-11-19";
const json = (value: unknown) => JSON.stringify(value);

const entry: ScoreEntry & { date: string } = {
  date: TODAY,
  mood: 6,
  energy: 5,
  sleepHours: 7.5,
  steps: 8200,
  activeCalories: 420,
  workouts: [
    { type: "Cycling", durationMin: 40 },
    { type: "SECRET_WORKOUT with Sarah", durationMin: 20 }, // custom name typed by the user
  ],
  mentalActivities: [{ type: "Meditation", durationMin: 10 }],
  outdoorActivities: [{ type: "SECRET_OUTDOOR at Mum's house", durationMin: 30 }],
  goodThings: ["SECRET_GOOD_THING lunch with Priya"],
  learnings: [{ topic: "SECRET_LEARNING_TOPIC", details: "SECRET_LEARNING_DETAILS", minutes: 25 }],
  presentMoment: "SECRET_PRESENT_MOMENT feeling calm",
};

const log: ThoughtInput = {
  date: "2026-11-18",
  thought: "SECRET_THOUGHT I always mess up",
  situation: "SECRET_SITUATION meeting with my boss",
  feelings: [
    { name: "Anxious", intensityBefore: 8 },
    { name: "SECRET_FEELING_custom", intensityBefore: 5 },
  ],
  distortions: ["catastrophising", "labelling"],
  evidenceFor: "SECRET_EVIDENCE_FOR",
  evidenceAgainst: "SECRET_EVIDENCE_AGAINST",
  friendAdvice: "SECRET_FRIEND_ADVICE",
  balancedThought: "SECRET_BALANCED_THOUGHT",
  smallStep: "SECRET_SMALL_STEP",
  smallStepDone: false,
  intensityAfter: 4,
  isPrivate: false,
};

// What a diary entry and the account look like — these must never appear anywhere
const DIARY_TEXT = "SECRET_DIARY_BODY";
const ACCOUNT = { name: "SECRET_NAME Routhiran", email: "secret.user@example.com" };

function allMinimalPayloads() {
  return [
    buildThoughtContext(log, "minimal", TODAY),
    buildDailyContext({
      entry,
      scores: { physical: 70, mental: 65, learning: 80, overall: 72 },
      nutrition: { eatenKcal: 1900, targetKcal: 2000 },
      today: TODAY,
    }),
    buildWeeklyContext({
      thisWeek: weekNumbers,
      lastWeek: weekNumbers,
      calorieTarget: 2000,
      insights: [{ key: "activity:secret_custom activity", daysWith: 6, daysWithout: 8, moodWith: 7.5, moodWithout: 6 }],
      today: TODAY,
    }),
    buildBoostContext({
      recentScores: [{ date: TODAY, physical: 70, mental: 60, learning: 50, overall: 60 }],
      streak: { current: 3, longest: 9 },
      coreValues: ["Growth", "Kindness", "SECRET_VALUE Sarah"],
      today: TODAY,
      mode: "minimal",
    }),
  ];
}

const weekNumbers = {
  daysLogged: 5,
  avgPhysical: 60,
  avgMental: 70,
  avgLearning: 50,
  avgOverall: 60,
  avgMood: 6.5,
  workouts: 4,
  workoutMinutes: 160,
  learningMinutes: 90,
  avgKcal: 1950,
  mealDays: 5,
  bestDay: { date: "2026-11-17", overall: 78 },
};

describe("minimal mode never sends free text", () => {
  it("contains no SECRET_ marker, diary text, name or email in any payload or prompt", () => {
    for (const context of allMinimalPayloads()) {
      for (const sent of [json(context), buildPrompt(context, { lowMood: false })]) {
        expect(sent).not.toContain("SECRET");
        expect(sent).not.toContain(DIARY_TEXT);
        expect(sent).not.toContain(ACCOUNT.email);
        expect(sent).not.toContain("Routhiran");
        expect(sent).not.toContain("Sarah");
        expect(sent).not.toContain("Priya");
        expect(sent).not.toContain("Mum");
      }
    }
  });

  it("sends no real dates, only relative days", () => {
    for (const context of allMinimalPayloads()) {
      expect(json(context)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it("keeps the structured data the AI needs", () => {
    const thought = buildThoughtContext(log, "minimal", TODAY);
    expect(thought.mode).toBe("minimal");
    expect(thought.data).toMatchObject({
      day: "yesterday",
      feelings: [
        { name: "anxious", intensityBefore: 8 },
        { name: "other feeling", intensityBefore: 5 },
      ],
      thinkingTraps: ["catastrophising", "labelling"],
      intensityAfter: 4,
    });
    expect(thought.data).not.toHaveProperty("text");

    const daily = buildDailyContext({ entry, scores: { physical: 1, mental: 2, learning: 3, overall: 2 }, nutrition: null, today: TODAY });
    expect(daily.data).toMatchObject({
      day: "today",
      mood: 6,
      sleepHours: 7.5,
      workouts: [
        { type: "cycling", minutes: 40 },
        { type: "other workout", minutes: 20 },
      ],
      goodThingsCount: 1,
      learningsCount: 1,
      learningMinutes: 25,
      wroteReflection: true,
      nutrition: { mealsLogged: false },
    });
  });

  it("sends the sleep score and hours, but never the night's details or samples", () => {
    // A stored entry carries the full sleep summary; only the score number may reach the AI
    const withSleep = {
      ...entry,
      sleepScore: 88,
      sleep: { bedtime: "23:00", wakeTime: "06:30", deepMin: 60, breakdown: [{ reason: "SECRET_SLEEP_REASON" }] },
      sleepSamples: "2026-11-19T23:00:00+05:30;2026-11-20T06:30:00+05:30;Core",
      appleSleepScore: 91,
    } as ScoreEntry & { date: string };
    const daily = buildDailyContext({ entry: withSleep, scores: { physical: 1, mental: 2, learning: 3, overall: 2 }, nutrition: null, today: TODAY });
    expect(daily.data).toMatchObject({ sleepHours: 7.5, sleepScore: 88 });
    const sent = json(daily);
    for (const leak of ["SECRET_SLEEP_REASON", "bedtime", "wakeTime", "deepMin", "Core", "+05:30", "appleSleepScore"]) {
      expect(sent).not.toContain(leak);
    }
  });

  it("only sends the app's own value words", () => {
    const boost = allMinimalPayloads()[3]!;
    expect(boost.data.values).toEqual(["growth", "kindness"]);
  });
});

describe("full mode", () => {
  it("includes thought-log text for a log that isn't private", () => {
    const context = buildThoughtContext(log, "full", TODAY);
    expect(context.mode).toBe("full");
    expect(json(context)).toContain("SECRET_THOUGHT");
    expect(json(context)).toContain("SECRET_BALANCED_THOUGHT");
  });

  it("never includes text from a private log", () => {
    const context = buildThoughtContext({ ...log, isPrivate: true }, "full", TODAY);
    expect(context.mode).toBe("minimal");
    expect(json(context)).not.toContain("SECRET");
    expect(buildPrompt(context, { lowMood: false })).not.toContain("SECRET");
  });

  it("still never sends check-in free text, even in full mode", () => {
    const daily = buildDailyContext({ entry, scores: { physical: 1, mental: 2, learning: 3, overall: 2 }, nutrition: null, today: TODAY });
    expect(json(daily)).not.toContain("SECRET");
  });

  it("allows plain custom value words in full mode only", () => {
    const boost = buildBoostContext({
      recentScores: [],
      streak: { current: 0, longest: 0 },
      coreValues: ["Adventure", "call 0771234567", "me@x.com"],
      today: TODAY,
      mode: "full",
    });
    expect(boost.data.values).toEqual(["adventure"]);
  });
});

describe("helpers", () => {
  it("describes dates relative to today", () => {
    expect(relativeDay(TODAY, TODAY)).toBe("today");
    expect(relativeDay("2026-11-18", TODAY)).toBe("yesterday");
    expect(relativeDay("2026-11-12", TODAY)).toBe("7 days ago");
  });

  it("detects low mood only for today's entry", () => {
    expect(isLowMoodToday({ date: TODAY, mood: 3 }, TODAY)).toBe(true);
    expect(isLowMoodToday({ date: TODAY, mood: 4 }, TODAY)).toBe(false);
    expect(isLowMoodToday({ date: "2026-11-18", mood: 2 }, TODAY)).toBe(false);
    expect(isLowMoodToday(null, TODAY)).toBe(false);
  });
});
