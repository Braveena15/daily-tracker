/// <reference types="vitest/globals" />
// Privacy tests: free text written by the user (and anything identifying) must never reach
// an AI payload unless the rules allow it. Every free-text field below holds a unique
// "SECRET_…" marker, and the tests check the final JSON for those markers.
import {
  buildBoostContext,
  buildDailyContext,
  buildThoughtContext,
  buildWeeklyContext,
  entryText,
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
  // Three check-ins: 08:10 (7), 14:30 (4, with a private note), 20:45 (7) Colombo time
  moods: [
    { mood: 7, energy: 6, loggedAt: "2026-11-19T02:40:00.000Z" },
    { mood: 4, energy: 3, loggedAt: "2026-11-19T09:00:00.000Z", note: "SECRET_MOOD_NOTE argued with Sarah" },
    { mood: 7, energy: 5, loggedAt: "2026-11-19T15:15:00.000Z" },
  ],
  sleepHours: 7.5,
  steps: 8200,
  activeCalories: 420,
  workouts: [
    { type: "Cycling", durationMin: 40, loggedAt: "2026-11-19T01:30:00.000Z" },
    { type: "SECRET_WORKOUT with Sarah", durationMin: 20 }, // custom name typed by the user
  ],
  mentalActivities: [{ type: "Meditation", durationMin: 10 }],
  outdoorActivities: [{ type: "SECRET_OUTDOOR at Mum's house", durationMin: 30 }],
  goodThings: ["SECRET_GOOD_THING lunch with Priya"],
  learnings: [{ topic: "SECRET_LEARNING_TOPIC", details: "SECRET_LEARNING_DETAILS", minutes: 25 }],
  presentMoments: ["SECRET_PRESENT_MOMENT feeling calm", "SECRET_SECOND_MOMENT"],
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
      purpose: {
        purposes: [
          {
            id: "a",
            text: "SECRET_DAILY_PURPOSE",
            focusValues: ["Growth", "SECRET_VALUE Sarah"],
            intensity: 8,
            createdAt: null,
            updatedAt: null,
          },
          { id: "b", text: "SECRET_SECOND_PURPOSE", focusValues: [], intensity: 6, createdAt: null, updatedAt: null },
        ],
        reflectionNote: "SECRET_REFLECTION_NOTE",
      },
    }),
    buildWeeklyContext({
      thisWeek: weekNumbers,
      lastWeek: weekNumbers,
      calorieTarget: 2000,
      insights: [{ key: "activity:secret_custom activity", daysWith: 6, daysWithout: 8, moodWith: 7.5, moodWithout: 6 }],
      today: TODAY,
      // Daily scores and this week's check-ins (with a custom workout name typed by the person)
      days: [{ date: TODAY, physical: 70, mental: 60, learning: 50, overall: 60, missedReason: { category: "busy", note: "SECRET_MISSED_NOTE" } } as never],
      activities: [entry],
      // Categories and counts only
      missedReasons: { busy: 1 },
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
  avgSleepHours: 7.2,
  avgSleepScore: 81,
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
      moodCheckIns: {
        count: 3,
        avgMood: 6,
        avgEnergy: 4.7,
        lowestMood: { mood: 4, timeOfDay: "afternoon" },
        highestMood: { mood: 7, timeOfDay: "morning" },
      },
      sleepHours: 7.5,
      workouts: [
        { type: "cycling", minutes: 40, timeOfDay: "morning" },
        { type: "other workout", minutes: 20, timeOfDay: null },
      ],
      goodThingsCount: 1,
      learningsCount: 1,
      learningMinutes: 25,
      reflectionsCount: 2,
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
      sleepScoreSource: "manual",
    } as ScoreEntry & { date: string };
    const daily = buildDailyContext({ entry: withSleep, scores: { physical: 1, mental: 2, learning: 3, overall: 2 }, nutrition: null, today: TODAY });
    expect(daily.data).toMatchObject({ sleepHours: 7.5, sleepScore: 88 });
    const sent = json(daily);
    for (const leak of ["SECRET_SLEEP_REASON", "bedtime", "wakeTime", "deepMin", "Core", "+05:30", "sleepScoreSource"]) {
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

  it("detects low mood only for today's entry, from any check-in", () => {
    expect(isLowMoodToday({ date: TODAY, moodLogs: [{ mood: 7 }, { mood: 3 }] }, TODAY)).toBe(true);
    expect(isLowMoodToday({ date: TODAY, moodLogs: [{ mood: 4 }, { mood: 6 }] }, TODAY)).toBe(false);
    expect(isLowMoodToday({ date: TODAY, moodLogs: [] }, TODAY)).toBe(false);
    expect(isLowMoodToday({ date: "2026-11-18", moodLogs: [{ mood: 2 }] }, TODAY)).toBe(false);
    expect(isLowMoodToday(null, TODAY)).toBe(false);
  });

  it("checks mood notes for crisis language, but never sends them", () => {
    expect(entryText(entry)).toContain("SECRET_MOOD_NOTE argued with Sarah");
    expect(entryText(entry)).toContain("SECRET_SECOND_MOMENT");
  });
});

describe("weekly reflection context", () => {
  const base = { thisWeek: weekNumbers, lastWeek: weekNumbers, calorieTarget: 2000, insights: [], today: TODAY };

  it("sends daily scores by relative day and counts of built-in activity names only", () => {
    const { data } = buildWeeklyContext({
      ...base,
      days: [
        { date: "2026-11-18", physical: 70, mental: 60, learning: 50, overall: 60 },
        { date: "2026-11-17", physical: null, mental: null, learning: null, overall: null },
      ],
      activities: [entry],
    });
    expect(data.dailyScores).toEqual([{ day: "yesterday", physical: 70, mental: 60, learning: 50, overall: 60 }]);
    expect(data.activityCounts).toMatchObject({ workouts: { cycling: 1, other: 1 } });
    expect(json(data)).not.toContain("2026-11-18");
  });

  it("flags a thin week so the reflection says so instead of guessing", () => {
    const thin = buildWeeklyContext({ ...base, thisWeek: { ...weekNumbers, daysLogged: 2 } });
    expect(thin.data.dataNote).toMatch(/Thin data: only 2/);
    const noLastWeek = buildWeeklyContext({ ...base, lastWeek: { ...weekNumbers, daysLogged: 0 } });
    expect(noLastWeek.data.dataNote).toMatch(/No data from last week/);
    expect(buildWeeklyContext(base).data.dataNote).toBeNull();
    expect(buildPrompt(thin, { lowMood: false })).toMatch(/only a little to go on/);
  });
});

describe("water stays out of the AI", () => {
  it("isn't sent with the weekly reflection", () => {
    const week = { ...weekNumbers, avgWaterMl: 1800, waterDays: 5, waterGoalDays: 3 };
    const sent = json(buildWeeklyContext({ thisWeek: week, lastWeek: week, calorieTarget: null, insights: [], today: TODAY }));
    expect(sent).not.toMatch(/water/i);
    expect(sent).toContain("avgOverall");
  });
});
