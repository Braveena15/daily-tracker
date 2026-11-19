// Daily scores (0–100) for the three areas of life the app tracks: physical, mental and learning.
// Pure functions: they take plain data and return numbers + an explanation, so they're easy to test.
//
// Every score is a sum of a few parts ("lines"). Each line has a maximum, the points earned,
// and a short human-friendly reason, so the app can show exactly how a score was reached.
// A day with no check-in has score null (not 0): we don't know how the day went, and
// treating it as 0 would drag averages and charts down for days that simply weren't logged.

export type ScoreLine = { label: string; points: number; max: number; reason: string };
export type ScoreResult = { score: number | null; breakdown: ScoreLine[] };

/** The user's personal goals (see GOAL_LIMITS in models/User.ts). */
export type ScoreGoals = {
  stepGoal: number;
  activeCalorieGoal: number;
  workoutMinutesGoal: number;
  learningMinutesGoal: number;
};

type Activity = { type: string; durationMin?: number | null };

/** The parts of a DailyEntry the scores use. */
export type ScoreEntry = {
  mood: number;
  energy: number;
  sleepHours?: number | null;
  steps?: number | null;
  activeCalories?: number | null;
  workouts: Activity[];
  mentalActivities: Activity[];
  outdoorActivities: Activity[];
  goodThings: string[];
  learnings: { topic: string; details?: string | null; minutes?: number | null }[];
  presentMoment?: string | null;
};

/**
 * Food for the day. eatenKcal is null when no meals were logged.
 * targetKcal is null until the profile is complete; minimumKcal is the safe minimum for the user's sex.
 */
export type NutritionInput = { eatenKcal: number | null; targetKcal: number | null; minimumKcal: number | null };

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const tick = (done: boolean) => (done ? " ✓" : "");
const sumMinutes = (items: { durationMin?: number | null; minutes?: number | null }[]) =>
  items.reduce((sum, i) => sum + (i.durationMin ?? i.minutes ?? 0), 0);

/** `fraction` of the way to the goal (capped at 1) × max, rounded to whole points. */
function towardGoal(value: number, goal: number, max: number): number {
  if (goal <= 0) return 0;
  return Math.round(Math.min(value / goal, 1) * max);
}

function total(breakdown: ScoreLine[]): ScoreResult {
  return { score: breakdown.reduce((sum, line) => sum + line.points, 0), breakdown };
}

const NOT_LOGGED: ScoreResult = { score: null, breakdown: [] };

// ---------- Physical ----------

function workoutsLine(entry: ScoreEntry, goals: ScoreGoals): ScoreLine {
  const minutes = sumMinutes(entry.workouts);
  const goal = goals.workoutMinutesGoal;
  return {
    label: "Workouts",
    max: 20,
    points: towardGoal(minutes, goal, 20),
    reason: minutes === 0 ? "No workouts logged" : `${fmt(minutes)} of ${fmt(goal)} workout minutes${tick(minutes >= goal)}`,
  };
}

function movementLine(entry: ScoreEntry, goals: ScoreGoals): ScoreLine {
  const line = { label: "Movement", max: 15 };
  if (entry.steps != null) {
    return {
      ...line,
      points: towardGoal(entry.steps, goals.stepGoal, 15),
      reason: `${fmt(entry.steps)} of ${fmt(goals.stepGoal)} steps${tick(entry.steps >= goals.stepGoal)}`,
    };
  }
  if (entry.activeCalories != null) {
    const goal = goals.activeCalorieGoal;
    return {
      ...line,
      points: towardGoal(entry.activeCalories, goal, 15),
      reason: `${fmt(entry.activeCalories)} of ${fmt(goal)} active kcal${tick(entry.activeCalories >= goal)} (no steps logged)`,
    };
  }
  return { ...line, points: 0, reason: "No steps or active calories logged" };
}

function nutritionLine(food: NutritionInput): ScoreLine {
  const line = { label: "Nutrition", max: 30 };
  const { eatenKcal, targetKcal, minimumKcal } = food;
  if (eatenKcal === null) return { ...line, points: 0, reason: "No meals logged" };
  if (targetKcal === null || targetKcal <= 0) {
    return { ...line, points: 0, reason: "Complete your profile to score nutrition" };
  }

  const off = Math.abs(eatenKcal - targetKcal) / targetKcal; // e.g. 0.12 = 12% away from target
  let points: number;
  let reason: string;
  if (off <= 0.1) [points, reason] = [30, "Within 10% of your calorie target ✓"];
  else if (off <= 0.2) [points, reason] = [20, "Within 20% of your calorie target"];
  else if (off <= 0.3) [points, reason] = [10, "Within 30% of your calorie target"];
  else [points, reason] = [5, "More than 30% away from your calorie target"];

  // Eating too little is never rewarded with a top score
  if (minimumKcal !== null && eatenKcal < minimumKcal && points > 10) {
    points = 10;
    reason = "Below your safe daily minimum — fuelling well matters";
  }
  return { ...line, points, reason };
}

function sleepLine(entry: ScoreEntry): ScoreLine {
  const line = { label: "Sleep", max: 20 };
  const h = entry.sleepHours;
  if (h == null) return { ...line, points: 0, reason: "No sleep logged" };
  if (h >= 7 && h <= 9) return { ...line, points: 20, reason: `${h} h — in the 7–9 h sweet spot ✓` };
  if ((h >= 6 && h < 7) || (h > 9 && h <= 10)) return { ...line, points: 12, reason: `${h} h — close to 7–9 h` };
  return { ...line, points: 5, reason: `${h} h — well outside 7–9 h` };
}

function outdoorLine(entry: ScoreEntry): ScoreLine {
  const line = { label: "Outdoor", max: 15 };
  const minutes = sumMinutes(entry.outdoorActivities);
  if (minutes >= 15) return { ...line, points: 15, reason: `${fmt(minutes)} min outside ✓` };
  if (entry.outdoorActivities.length > 0) return { ...line, points: 8, reason: "Some time outside (under 15 min)" };
  return { ...line, points: 0, reason: "No outdoor time logged" };
}

/** Physical: workouts 20 + movement 15 + nutrition 30 + sleep 20 + outdoor 15 = 100. */
export function physicalScore(entry: ScoreEntry | null, goals: ScoreGoals, food: NutritionInput): ScoreResult {
  if (!entry) return NOT_LOGGED;
  return total([workoutsLine(entry, goals), movementLine(entry, goals), nutritionLine(food), sleepLine(entry), outdoorLine(entry)]);
}

// ---------- Mental ----------

/** Mental: activities 35 + good things 20 + reflection 15 + mood 20 + energy 10 = 100. */
export function mentalScore(entry: ScoreEntry | null): ScoreResult {
  if (!entry) return NOT_LOGGED;

  // "Meditation" and "meditation " count as the same activity
  const distinct = new Set(entry.mentalActivities.map((a) => a.type.trim().toLowerCase())).size;
  const activityPoints = distinct >= 3 ? 35 : distinct === 2 ? 25 : distinct === 1 ? 15 : 0;

  const goodThings = entry.goodThings.length;
  const goodPoints = goodThings >= 3 ? 20 : goodThings === 2 ? 15 : goodThings === 1 ? 10 : 0;

  const reflection = (entry.presentMoment ?? "").trim().length;

  return total([
    {
      label: "Mental-strength activities",
      max: 35,
      points: activityPoints,
      reason:
        distinct === 0
          ? "No mental-strength activities logged"
          : `${distinct} different ${distinct === 1 ? "activity" : "activities"}${tick(distinct >= 3)}`,
    },
    {
      label: "Good things",
      max: 20,
      points: goodPoints,
      reason: goodThings === 0 ? "No good things noted" : `${goodThings} good ${goodThings === 1 ? "thing" : "things"}${tick(goodThings >= 3)}`,
    },
    {
      label: "Present-moment reflection",
      max: 15,
      points: reflection >= 20 ? 15 : 0,
      reason:
        reflection >= 20 ? "Reflection written ✓" : reflection > 0 ? "Write 20+ characters for it to count" : "No reflection written",
    },
    { label: "Mood", max: 20, points: entry.mood * 2, reason: `Mood ${entry.mood}/10` },
    { label: "Energy", max: 10, points: entry.energy, reason: `Energy ${entry.energy}/10` },
  ]);
}

// ---------- Learning ----------

/** Learning: learnings logged 50 + minutes 30 + depth 20 = 100. */
export function learningScore(entry: ScoreEntry | null, goals: ScoreGoals): ScoreResult {
  if (!entry) return NOT_LOGGED;

  const count = entry.learnings.length;
  const minutes = sumMinutes(entry.learnings);
  const goal = goals.learningMinutesGoal;
  const deep = entry.learnings.some((l) => (l.details ?? "").trim().length >= 20);

  return total([
    {
      label: "Learnings logged",
      max: 50,
      points: count >= 2 ? 50 : count === 1 ? 40 : 0,
      reason: count === 0 ? "No learnings logged" : `${count} ${count === 1 ? "learning" : "learnings"} logged${tick(count >= 2)}`,
    },
    {
      label: "Learning time",
      max: 30,
      points: towardGoal(minutes, goal, 30),
      reason: minutes === 0 ? "No learning minutes logged" : `${fmt(minutes)} of ${fmt(goal)} learning minutes${tick(minutes >= goal)}`,
    },
    {
      label: "Depth",
      max: 20,
      points: deep ? 20 : 0,
      reason: deep
        ? "Notes on what you learned ✓"
        : count > 0
          ? "Add a few details (20+ characters) for it to count"
          : "No details written",
    },
  ]);
}

// ---------- Overall ----------

/** Average of the three scores, rounded. Null when the day wasn't logged. */
export function overallScore(physical: number | null, mental: number | null, learning: number | null): number | null {
  if (physical === null || mental === null || learning === null) return null;
  return Math.round((physical + mental + learning) / 3);
}

export type DayScores = {
  physical: ScoreResult;
  mental: ScoreResult;
  learning: ScoreResult;
  overall: number | null;
};

/** All three scores for one day, plus the overall. */
export function dayScores(entry: ScoreEntry | null, goals: ScoreGoals, food: NutritionInput): DayScores {
  const physical = physicalScore(entry, goals, food);
  const mental = mentalScore(entry);
  const learning = learningScore(entry, goals);
  return { physical, mental, learning, overall: overallScore(physical.score, mental.score, learning.score) };
}
