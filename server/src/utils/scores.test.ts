/// <reference types="vitest/globals" />
import {
  dayScores,
  learningScore,
  mentalScore,
  overallScore,
  physicalScore,
  type NutritionInput,
  type ScoreEntry,
  type ScoreGoals,
} from "./scores";

const goals: ScoreGoals = { stepGoal: 8000, activeCalorieGoal: 400, workoutMinutesGoal: 30, learningMinutesGoal: 30 };

const empty: ScoreEntry = {
  mood: 5,
  energy: 5,
  sleepHours: null,
  workouts: [],
  mentalActivities: [],
  outdoorActivities: [],
  goodThings: [],
  learnings: [],
  presentMoment: "",
};

const noMeals: NutritionInput = { eatenKcal: null, targetKcal: 2000, minimumKcal: 1500 };
const ate = (eatenKcal: number): NutritionInput => ({ eatenKcal, targetKcal: 2000, minimumKcal: 1500 });

const line = (result: { breakdown: { label: string }[] }, label: string) => {
  const found = result.breakdown.find((l) => l.label === label);
  if (!found) throw new Error(`No line called ${label}`);
  return found as { label: string; points: number; max: number; reason: string };
};

describe("no entry", () => {
  it("gives null scores (not 0) and an empty breakdown", () => {
    expect(physicalScore(null, goals, noMeals)).toEqual({ score: null, breakdown: [] });
    expect(mentalScore(null)).toEqual({ score: null, breakdown: [] });
    expect(learningScore(null, goals)).toEqual({ score: null, breakdown: [] });
    expect(dayScores(null, goals, noMeals).overall).toBeNull();
  });
});

describe("physicalScore", () => {
  it("has lines that add up to 100 at most", () => {
    const result = physicalScore(empty, goals, noMeals);
    expect(result.breakdown.reduce((s, l) => s + l.max, 0)).toBe(100);
    expect(result.score).toBe(0);
  });

  it("scores workout minutes toward the goal, capped at 20", () => {
    expect(line(physicalScore({ ...empty, workouts: [{ type: "Gym", durationMin: 15 }] }, goals, noMeals), "Workouts").points).toBe(10);
    const over = line(
      physicalScore({ ...empty, workouts: [{ type: "Gym", durationMin: 30 }, { type: "Run", durationMin: 15 }] }, goals, noMeals),
      "Workouts",
    );
    expect(over.points).toBe(20);
    expect(over.reason).toBe("45 of 30 workout minutes ✓");
  });

  it("uses steps, then active calories, then 0 for movement", () => {
    expect(line(physicalScore({ ...empty, steps: 4000, activeCalories: 400 }, goals, noMeals), "Movement").points).toBe(8);
    const fromWatch = line(physicalScore({ ...empty, activeCalories: 200 }, goals, noMeals), "Movement");
    expect(fromWatch.points).toBe(8);
    expect(fromWatch.reason).toContain("no steps logged");
    expect(line(physicalScore(empty, goals, noMeals), "Movement")).toMatchObject({
      points: 0,
      reason: "No steps or active calories logged",
    });
  });

  it("scores nutrition by distance from target", () => {
    const nutrition = (food: NutritionInput) => line(physicalScore(empty, goals, food), "Nutrition").points;
    expect(nutrition(ate(2000))).toBe(30);
    expect(nutrition(ate(2200))).toBe(30); // exactly 10%
    expect(nutrition(ate(2350))).toBe(20);
    expect(nutrition(ate(2550))).toBe(10);
    expect(nutrition(ate(3000))).toBe(5);
  });

  it("caps nutrition at 10 below the safe minimum", () => {
    // 1450 is within 30% of a 2000 target (10 points anyway); use a low target to test the cap
    const result = line(physicalScore(empty, goals, { eatenKcal: 1450, targetKcal: 1500, minimumKcal: 1500 }), "Nutrition");
    expect(result.points).toBe(10);
    expect(result.reason).toContain("safe daily minimum");
  });

  it("gives 0 nutrition with a clear reason when no meals were logged", () => {
    expect(line(physicalScore(empty, goals, noMeals), "Nutrition")).toMatchObject({ points: 0, reason: "No meals logged" });
  });

  it("uses the sleep score instead of hours when the watch synced sleep", () => {
    const sleep = (sleepScore: number | null, sleepHours: number | null = 4) =>
      line(physicalScore({ ...empty, sleepHours, sleepScore }, goals, noMeals), "Sleep");
    expect(sleep(95).points).toBe(19);
    expect(sleep(72).points).toBe(14); // 14.4
    expect(sleep(100).points).toBe(20);
    expect(sleep(0).points).toBe(0);
    expect(sleep(95, 7.23).reason).toBe("Sleep score 95/100 (7.23 h) ✓");
    expect(sleep(60, null).reason).toBe("Sleep score 60/100");
    // No sleep score: the hours rule (4 h → 5 points)
    expect(sleep(null).points).toBe(5);
  });

  it("scores sleep bands", () => {
    const sleep = (h: number | null) => line(physicalScore({ ...empty, sleepHours: h }, goals, noMeals), "Sleep").points;
    expect(sleep(7)).toBe(20);
    expect(sleep(9)).toBe(20);
    expect(sleep(6)).toBe(12);
    expect(sleep(9.5)).toBe(12);
    expect(sleep(10)).toBe(12);
    expect(sleep(5.5)).toBe(5);
    expect(sleep(11)).toBe(5);
    expect(sleep(null)).toBe(0);
  });

  it("scores outdoor time", () => {
    const outdoor = (acts: ScoreEntry["outdoorActivities"]) =>
      line(physicalScore({ ...empty, outdoorActivities: acts }, goals, noMeals), "Outdoor");
    expect(outdoor([{ type: "Walk", durationMin: 10 }, { type: "Sun", durationMin: 5 }]).points).toBe(15);
    expect(outdoor([{ type: "Sunlight" }]).points).toBe(8);
    expect(outdoor([])).toMatchObject({ points: 0, reason: "No outdoor time logged" });
  });

  it("adds up a full day", () => {
    const result = physicalScore(
      {
        ...empty,
        sleepHours: 7.5,
        steps: 9000,
        workouts: [{ type: "Cycling", durationMin: 40 }],
        outdoorActivities: [{ type: "Cycling", durationMin: 40 }],
      },
      goals,
      ate(1950),
    );
    expect(result.score).toBe(100);
  });
});

describe("mentalScore", () => {
  it("counts distinct activities, ignoring case", () => {
    const acts = (...types: string[]) => types.map((type) => ({ type }));
    const points = (...types: string[]) =>
      line(mentalScore({ ...empty, mentalActivities: acts(...types) }), "Mental-strength activities").points;
    expect(points()).toBe(0);
    expect(points("Meditation")).toBe(15);
    expect(points("Meditation", "meditation ")).toBe(15);
    expect(points("Meditation", "Reading")).toBe(25);
    expect(points("Meditation", "Reading", "Breathing", "Journaling")).toBe(35);
  });

  it("scores good things, reflection, mood and energy", () => {
    const result = mentalScore({
      ...empty,
      goodThings: ["a", "b"],
      presentMoment: "Calm and a little tired today.",
      mood: 7,
      energy: 6,
    });
    expect(line(result, "Good things").points).toBe(15);
    expect(line(result, "Present-moment reflection").points).toBe(15);
    expect(line(result, "Mood").points).toBe(14);
    expect(line(result, "Energy").points).toBe(6);
    expect(result.score).toBe(15 + 15 + 14 + 6);
  });

  it("needs at least 20 characters of reflection", () => {
    expect(line(mentalScore({ ...empty, presentMoment: "  short  " }), "Present-moment reflection").points).toBe(0);
  });

  it("reaches 100 on a full day", () => {
    const result = mentalScore({
      ...empty,
      mood: 10,
      energy: 10,
      mentalActivities: [{ type: "A" }, { type: "B" }, { type: "C" }],
      goodThings: ["1", "2", "3"],
      presentMoment: "Feeling grounded and grateful tonight.",
    });
    expect(result.score).toBe(100);
  });
});

describe("learningScore", () => {
  it("scores count, minutes and depth", () => {
    const one = learningScore({ ...empty, learnings: [{ topic: "TS", minutes: 15 }] }, goals);
    expect(one.score).toBe(40 + 15 + 0);

    const two = learningScore(
      {
        ...empty,
        learnings: [
          { topic: "TS", minutes: 20 },
          { topic: "Cooking", minutes: 20, details: "How to temper spices properly" },
        ],
      },
      goals,
    );
    expect(two.score).toBe(100);
    expect(line(two, "Learning time").reason).toBe("40 of 30 learning minutes ✓");
  });

  it("is 0 with no learnings", () => {
    expect(learningScore(empty, goals).score).toBe(0);
  });
});

describe("overallScore", () => {
  it("averages and rounds", () => {
    expect(overallScore(80, 70, 41)).toBe(64);
  });

  it("is null if any area is null", () => {
    expect(overallScore(null, 70, 40)).toBeNull();
  });
});
