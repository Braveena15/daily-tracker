// THE ONLY PLACE that decides what is sent to the AI. Every AI request is built here.
//
// Privacy rules, enforced by these functions (and proven in buildContext.test.ts):
// - Diary entries are never sent. Nothing here accepts diary data at all.
// - Names, emails and account details are never sent. Nothing here accepts them.
// - "minimal" mode sends only structured, non-identifying data: relative days ("today"),
//   scores, mood/energy counts and averages, times of day ("afternoon"), sleep hours and sleep score
//   (never raw sleep samples), activity types and minutes, feeling names and intensities,
//   thinking-trap types, and counts. No free text written by the user — not even mood notes.
//   Even activity and feeling names are free text when the user types their own
//   ("Walk with Sarah"), so only the app's built-in names are sent; anything else becomes "other".
// - "full" mode may also send thought-log text — but never from a log marked private.
//
// These are pure functions (no database, no AI calls), so they're easy to test.
import type { ScoreEntry } from "../utils/scores";
import { daysBetween } from "../utils/dates";
import { dayMood, timeOfDay } from "../utils/timeline";

export type AiMode = "minimal" | "full";
export type AiTask = "thought" | "daily" | "weekly" | "boost";

/** What gets turned into JSON and sent with the task prompt. */
export type AiContext = { task: AiTask; mode: AiMode; data: Record<string, unknown> };

// ---------- Allow-lists for names the user might type themselves ----------

const lower = (s: string) => s.trim().toLowerCase();

/** The app's built-in quick-add activity names (see the check-in page). */
export const KNOWN_ACTIVITIES = new Set(
  [
    "cycling", "gym", "running", "walking", "swimming", "home workout", // workouts
    "meditation", "journaling", "reading", "breathing", "cold shower", "gratitude", // mental strength
    "walk", "sunlight", "nature", "sport", // outdoor
  ].map(lower),
);

/** Common feeling words, including the app's suggestions. */
export const KNOWN_FEELINGS = new Set(
  [
    "anxious", "sad", "angry", "ashamed", "guilty", "lonely", "overwhelmed", "frustrated", "hurt", "worried",
    "stressed", "tired", "scared", "nervous", "disappointed", "embarrassed", "jealous", "hopeless", "irritated",
    "calm", "happy", "hopeful", "grateful", "proud", "relieved", "content",
  ].map(lower),
);

/** The value words offered on the Purpose page. */
export const KNOWN_VALUES = new Set(
  [
    "kindness", "health", "family", "growth", "honesty", "courage", "curiosity", "gratitude",
    "discipline", "creativity", "friendship", "faith", "independence", "service", "calm", "learning",
  ].map(lower),
);

/** A built-in name as-is (lower case), anything else as the fallback word. */
function safeName(name: string, allowed: Set<string>, otherwise: string): string {
  return allowed.has(lower(name)) ? lower(name) : otherwise;
}

/** "today", "yesterday" or "N days ago" — never the actual date. */
export function relativeDay(date: string, today: string): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff > 1) return `${diff} days ago`;
  return "upcoming";
}

const sum = (items: { durationMin?: number | null; minutes?: number | null }[]) =>
  items.reduce((s, i) => s + (i.durationMin ?? i.minutes ?? 0), 0);

// ---------- Shared pieces ----------

const when = (at: Date | string | null | undefined) => (at ? timeOfDay(at) : null);

/**
 * A day's mood check-ins as numbers only, e.g. { count: 3, avgMood: 6.3, lowestMoodAt: "afternoon" }.
 * Notes written with a check-in are never included.
 */
export function moodFacts(moods: ScoreEntry["moods"]) {
  const m = dayMood(moods);
  if (!m) return { count: 0, avgMood: null, avgEnergy: null, lowestMood: null, highestMood: null };
  return {
    count: m.count,
    avgMood: m.avgMood,
    avgEnergy: m.avgEnergy,
    lowestMood: { mood: m.minMood, timeOfDay: when(m.lowest.loggedAt) },
    highestMood: { mood: m.maxMood, timeOfDay: when(m.highest.loggedAt) },
  };
}

/** A day's entries as numbers, categories and times of day only. Never includes reflections, good things or notes. */
export function entryFacts(entry: ScoreEntry & { date: string }, today: string) {
  const activities = (items: ScoreEntry["workouts"], other: string) =>
    items.map((a) => ({ type: safeName(a.type, KNOWN_ACTIVITIES, other), minutes: a.durationMin ?? null, timeOfDay: when(a.loggedAt) }));
  return {
    day: relativeDay(entry.date, today),
    moodCheckIns: moodFacts(entry.moods),
    sleepHours: entry.sleepHours ?? null,
    sleepScore: entry.sleepScore ?? null,
    steps: entry.steps ?? null,
    activeCalories: entry.activeCalories ?? null,
    workouts: activities(entry.workouts, "other workout"),
    mentalActivities: activities(entry.mentalActivities, "other activity"),
    outdoorActivities: activities(entry.outdoorActivities, "other outdoor time"),
    goodThingsCount: entry.goodThings.length,
    learningsCount: entry.learnings.length,
    learningMinutes: sum(entry.learnings),
    reflectionsCount: entry.presentMoments.filter((p) => p.trim().length > 0).length,
  };
}

export type ScoresInput = { physical: number | null; mental: number | null; learning: number | null; overall: number | null };

// ---------- Thought log ----------

export type ThoughtInput = {
  date: string;
  thought: string;
  situation: string;
  feelings: { name: string; intensityBefore: number }[];
  distortions: string[];
  evidenceFor: string;
  evidenceAgainst: string;
  friendAdvice: string;
  balancedThought: string;
  smallStep: string;
  smallStepDone: boolean;
  intensityAfter: number | null;
  isPrivate: boolean;
};

const has = (s: string) => s.trim().length > 0;

export function buildThoughtContext(log: ThoughtInput, mode: AiMode, today: string): AiContext {
  const data: Record<string, unknown> = {
    day: relativeDay(log.date, today),
    feelings: log.feelings.map((f) => ({ name: safeName(f.name, KNOWN_FEELINGS, "other feeling"), intensityBefore: f.intensityBefore })),
    thinkingTraps: log.distortions,
    intensityAfter: log.intensityAfter,
    // Which steps they worked through — counts effort without sending the words
    stepsCompleted: {
      describedSituation: has(log.situation),
      weighedEvidence: has(log.evidenceFor) || has(log.evidenceAgainst),
      imaginedAdviceToFriend: has(log.friendAdvice),
      wroteBalancedThought: has(log.balancedThought),
      choseSmallStep: has(log.smallStep),
      smallStepDone: log.smallStepDone,
    },
  };

  // Words are only shared in "full" mode, and never from a private log
  const shareText = mode === "full" && !log.isPrivate;
  if (shareText) {
    data.text = {
      thought: log.thought,
      situation: log.situation,
      evidenceFor: log.evidenceFor,
      evidenceAgainst: log.evidenceAgainst,
      adviceToFriend: log.friendAdvice,
      balancedThought: log.balancedThought,
      smallStep: log.smallStep,
    };
  }

  return { task: "thought", mode: shareText ? "full" : "minimal", data };
}

// ---------- Daily note ----------

export function buildDailyContext(input: {
  entry: ScoreEntry & { date: string };
  scores: ScoresInput;
  nutrition: { eatenKcal: number; targetKcal: number | null } | null;
  today: string;
}): AiContext {
  const { entry, scores, nutrition, today } = input;
  return {
    task: "daily",
    // The daily note never needs free text, so it is always minimal
    mode: "minimal",
    data: {
      ...entryFacts(entry, today),
      scores,
      nutrition: nutrition
        ? {
            mealsLogged: true,
            percentOfTarget: nutrition.targetKcal ? Math.round((nutrition.eatenKcal / nutrition.targetKcal) * 100) : null,
          }
        : { mealsLogged: false },
    },
  };
}

// ---------- Weekly reflection ----------

type WeekNumbers = {
  daysLogged: number;
  avgPhysical: number | null;
  avgMental: number | null;
  avgLearning: number | null;
  avgOverall: number | null;
  avgMood: number | null;
  avgSleepHours: number | null;
  avgSleepScore: number | null;
  workouts: number;
  workoutMinutes: number;
  learningMinutes: number;
  avgKcal: number | null;
  mealDays: number;
  bestDay: { date: string; overall: number } | null;
};

export type InsightInput = { key: string; daysWith: number; daysWithout: number; moodWith: number; moodWithout: number };

/** Insight keys look like "activity:cycling", "outdoor" or "sleep7"; only safe labels are sent. */
function insightLabel(key: string): string {
  if (key === "outdoor") return "days with outdoor time";
  if (key === "sleep7") return "days with 7+ hours of sleep";
  if (key.startsWith("activity:")) {
    const name = key.slice("activity:".length);
    return KNOWN_ACTIVITIES.has(name) ? `days with ${name}` : "days with one of their activities";
  }
  return "a pattern in their days";
}

export function buildWeeklyContext(input: {
  thisWeek: WeekNumbers;
  lastWeek: WeekNumbers;
  calorieTarget: number | null;
  insights: InsightInput[];
  today: string;
}): AiContext {
  const week = ({ bestDay, ...rest }: WeekNumbers) => ({
    ...rest,
    bestDay: bestDay ? { day: relativeDay(bestDay.date, input.today), overall: bestDay.overall } : null,
  });
  return {
    task: "weekly",
    mode: "minimal",
    data: {
      thisWeek: week(input.thisWeek),
      lastWeek: week(input.lastWeek),
      calorieTarget: input.calorieTarget,
      patterns: input.insights.map((i) => ({
        observation: insightLabel(i.key),
        moodOnThoseDays: i.moodWith,
        moodOnOtherDays: i.moodWithout,
        daysCompared: i.daysWith + i.daysWithout,
      })),
    },
  };
}

// ---------- Boost ----------

export function buildBoostContext(input: {
  recentScores: (ScoresInput & { date: string })[];
  streak: { current: number; longest: number };
  coreValues: string[];
  today: string;
  mode: AiMode;
}): AiContext {
  const { recentScores, streak, coreValues, today, mode } = input;
  const logged = recentScores.filter((s) => s.overall !== null);
  const avg = (key: keyof ScoresInput) => {
    const values = logged.map((s) => s[key]).filter((v): v is number => v !== null);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  };

  // Value words: only the app's suggested words in minimal mode; in full mode short, plain words too
  const plainWord = /^[a-z][a-z -]{1,29}$/i;
  const values = coreValues
    .map(lower)
    .filter((v) => KNOWN_VALUES.has(v) || (mode === "full" && plainWord.test(v) && v.split(/\s+/).length <= 3));

  return {
    task: "boost",
    mode: "minimal",
    data: {
      daysLoggedThisWeek: logged.length,
      averageScoresThisWeek: { physical: avg("physical"), mental: avg("mental"), learning: avg("learning"), overall: avg("overall") },
      lastLogged: logged.length ? relativeDay(logged[logged.length - 1]!.date, today) : null,
      streak,
      values: [...new Set(values)],
    },
  };
}

// ---------- Safety helpers ----------

/** All user-written text in a thought log, for the crisis check (never sent anywhere). */
export const thoughtText = (log: ThoughtInput) =>
  [log.thought, log.situation, log.evidenceFor, log.evidenceAgainst, log.friendAdvice, log.balancedThought, log.smallStep];

/** All user-written text in a day's entries, for the crisis check (never sent anywhere). */
export const entryText = (entry: ScoreEntry) => [
  ...entry.presentMoments,
  ...entry.goodThings,
  ...entry.moods.map((m) => m.note ?? ""),
  ...entry.learnings.flatMap((l) => [l.topic, l.details ?? ""]),
];

/** Any mood check-in of 3 or lower today means the reply ends with a gentle reminder about support. */
export function isLowMoodToday(
  entry: { date: string; moodLogs?: { mood: number }[] | null } | null | undefined,
  today: string,
): boolean {
  return !!entry && entry.date === today && (entry.moodLogs ?? []).some((m) => m.mood <= 3);
}
