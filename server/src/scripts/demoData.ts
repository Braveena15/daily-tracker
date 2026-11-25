// Generates 60 days of realistic, varied demo data. Pure (no database), so it can be tested.
// A fixed seed makes the "random" data the same on every run.
import { addDays } from "../utils/dates";
import { atTime } from "../utils/timeline";
import type { MealType } from "../utils/meals";
import { clockMinutes, sleepHoursFrom, sleepScore, type NightSummary } from "../utils/sleep";
import type { ScoreLine } from "../utils/scores";
import type { Distortion } from "../utils/thoughts";

/** Small seeded random number generator (mulberry32): same seed → same sequence. */
function createRandom(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    between: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    some: <T>(items: readonly T[], count: number): T[] => [...items].sort(() => next() - 0.5).slice(0, count),
  };
}

export const DEMO_PROFILE = {
  name: "Demo User",
  heightCm: 178,
  birthYear: 1993,
  sex: "male" as const,
  goalWeightKg: 78,
  activityLevel: "moderate" as const,
  weeklyGoalKg: 0.5 as const,
};

export const DEMO_FOODS = [
  { name: "String hoppers with curry", servingDescription: "10 pieces", kcalPerServing: 420, proteinG: 9, carbsG: 80, fatG: 7, fiberG: 4, isFavourite: true },
  { name: "Milk tea", servingDescription: "1 cup", kcalPerServing: 110, carbsG: 16, fatG: 3, fiberG: 0, isFavourite: true },
  { name: "Rice and curry", servingDescription: "1 plate", kcalPerServing: 650, proteinG: 22, carbsG: 95, fatG: 18, fiberG: 7, isFavourite: true },
  { name: "Oats with banana", servingDescription: "1 bowl", kcalPerServing: 330, proteinG: 10, carbsG: 58, fatG: 6, fiberG: 6 },
  { name: "Chicken kottu", servingDescription: "1 plate", kcalPerServing: 780, proteinG: 35, carbsG: 85, fatG: 30, fiberG: 4 },
  { name: "Banana", servingDescription: "1 medium", kcalPerServing: 105, proteinG: 1, carbsG: 27, fatG: 0, fiberG: 3.1 },
  { name: "Roasted chickpeas", servingDescription: "1 cup", kcalPerServing: 270, proteinG: 14, carbsG: 40, fatG: 6, fiberG: 11 },
  { name: "Fish curry with red rice", servingDescription: "1 plate", kcalPerServing: 560, proteinG: 32, carbsG: 70, fatG: 14, fiberG: 6 },
  { name: "Egg hoppers", servingDescription: "2 hoppers", kcalPerServing: 300, proteinG: 13, carbsG: 34, fatG: 12, fiberG: 1.5 },
] as const;

type FoodName = (typeof DEMO_FOODS)[number]["name"];

const GOOD_THINGS = [
  "Coffee with an old friend",
  "Finished a chapter of my book",
  "A quiet sunrise",
  "Helped a colleague with a tricky bug",
  "Cooked a new recipe",
  "Long call with family",
  "Got outside before work",
  "Great conversation at lunch",
];
const LEARNINGS = [
  { topic: "TypeScript generics", details: "How constraints and infer work together in conditional types" },
  { topic: "Sinhala vocabulary", details: "Ten new words for food and cooking" },
  { topic: "Personal finance", details: "Index funds vs. fixed deposits and how fees add up over time" },
  { topic: "Photography", details: "Using aperture to control depth of field in portraits" },
  { topic: "MongoDB indexes" },
  { topic: "History podcast" },
];
const REFLECTIONS = [
  "Calm and a little tired, but grateful for the quiet evening.",
  "Busy day. Proud that I still made time to move.",
  "Feeling light after the ride this morning.",
  "A bit scattered today — tomorrow I'll plan the morning better.",
  "Content. Small steps are adding up.",
];

type Stamped = { loggedAt: Date };

/** A demo day in the timeline shape (subdocument _ids are added by MongoDB on insert). */
export type DemoEntry = {
  date: string;
  sleepHours: number;
  weightKg?: number;
  steps?: number;
  activeCalories?: number;
  moodLogs: (Stamped & { mood: number; energy: number })[];
  workouts: (Stamped & { type: string; durationMin: number; source: "manual" })[];
  mentalActivities: (Stamped & { type: string; durationMin?: number })[];
  outdoorActivities: (Stamped & { type: string; durationMin?: number })[];
  goodThings: (Stamped & { text: string })[];
  learnings: (Stamped & { topic: string; details?: string; minutes?: number })[];
  presentMoments: (Stamped & { text: string })[];
  healthSnapshots: { time: Date; steps?: number; activeCalories?: number }[];
  waterLogs: (Stamped & { amountMl: number })[];
  /** Last night's sleep as Apple Health sync would store it, with the calculated score */
  sleep?: NightSummary & { score: number; breakdown: ScoreLine[]; source: "watch" };
  sleepScoreValue?: number;
  sleepScoreSource?: "auto";
  /** Plain text here; the seed encrypts it the way the API does */
  dailyPurposes?: DemoDailyPurpose[];
  dailyReflectionNote?: string;
};

/** One of the day's purposes, with its own intentions and rating */
export type DemoDailyPurpose = {
  text: string;
  focusValues: string[];
  intentions: { text: string; done: boolean; doneAt?: Date }[];
  rating?: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DemoMealItem = { mealType: MealType; foodName: FoodName; servings: number };
export type DemoMealDay = { date: string; items: DemoMealItem[] };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Hourly totals from 07:00 to 21:00 that grow to the day's final steps and calories. */
function snapshots(date: string, steps: number | undefined, activeCalories: number | undefined): DemoEntry["healthSnapshots"] {
  if (steps === undefined && activeCalories === undefined) return [];
  return Array.from({ length: 15 }, (_, i) => {
    const share = Math.sqrt((i + 1) / 15); // more movement earlier in the day
    return {
      time: atTime(date, `${String(7 + i).padStart(2, "0")}:00`),
      ...(steps !== undefined && { steps: Math.round(steps * share) }),
      ...(activeCalories !== undefined && { activeCalories: Math.round(activeCalories * share) }),
    };
  });
}

/**
 * `days` days ending on `today`: some days skipped, a gentle weight-loss trend (~0.5 kg/week)
 * with daily noise, and moods that tend to be a little higher on active, outdoor, well-slept
 * days — so the insights card has real patterns to find.
 */
export function generateDemoData(today: string, days = 60, seed = 2026): { entries: DemoEntry[]; mealDays: DemoMealDay[] } {
  const rnd = createRandom(seed);
  const entries: DemoEntry[] = [];
  const mealDays: DemoMealDay[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(today, i - (days - 1));
    const skipped = i < days - 1 && rnd.chance(0.12); // always log today

    if (!skipped) {
      const cycling = rnd.chance(0.35);
      const gym = !cycling && rnd.chance(0.3);
      const outdoor = cycling || rnd.chance(0.5);
      const sleepHours = Math.round(rnd.between(5.5, 8.75) * 4) / 4;

      const workouts = [
        ...(cycling ? [{ type: "Cycling", durationMin: rnd.int(30, 75) }] : []),
        ...(gym ? [{ type: "Gym", durationMin: rnd.int(35, 60) }] : []),
        ...(rnd.chance(0.3) ? [{ type: "Walking", durationMin: rnd.int(15, 40) }] : []),
      ];
      const mentalActivities = [
        ...(rnd.chance(0.5) ? [{ type: "Meditation", durationMin: rnd.int(5, 20) }] : []),
        ...(rnd.chance(0.3) ? [{ type: "Journaling" }] : []),
        ...(rnd.chance(0.35) ? [{ type: "Reading", durationMin: rnd.int(10, 40) }] : []),
      ];
      const outdoorActivities = outdoor
        ? [cycling ? { type: "Cycling", durationMin: workouts[0]!.durationMin } : { type: rnd.pick(["Walk", "Sunlight", "Nature"]), durationMin: rnd.int(5, 45) }]
        : [];

      // Mood: a baseline with noise, nudged up by movement, outdoor time and sleep
      const lift = (cycling ? 1.2 : 0) + (outdoor ? 0.5 : 0) + (sleepHours >= 7 ? 0.6 : 0);
      const mood = Math.round(clamp(5 + lift + rnd.between(-1.5, 1.5), 1, 10));
      const energy = Math.round(clamp(4.5 + lift * 0.8 + rnd.between(-1.5, 1.5), 1, 10));

      const learningCount = rnd.pick([0, 0, 1, 1, 1, 2]);
      const learnings = rnd.some(LEARNINGS, learningCount).map((l) => ({
        topic: l.topic,
        ...("details" in l && l.details && rnd.chance(0.7) && { details: l.details }),
        ...(rnd.chance(0.8) && { minutes: rnd.int(10, 45) }),
      }));

      // Weight: start near 86 kg, lose about 0.07 kg a day, ± daily noise from water and timing
      const weight = 86 - i * 0.07 + rnd.between(-0.45, 0.45);

      const at = (hour: number) => atTime(date, `${String(hour).padStart(2, "0")}:${String(rnd.int(0, 59)).padStart(2, "0")}`);
      // 1–3 check-ins: morning, afternoon dip, evening
      const moodLogs = [
        { loggedAt: at(8), mood, energy },
        ...(rnd.chance(0.7) ? [{ loggedAt: at(14), mood: Math.round(clamp(mood - rnd.int(0, 2), 1, 10)), energy: Math.round(clamp(energy - rnd.int(0, 2), 1, 10)) }] : []),
        ...(rnd.chance(0.6) ? [{ loggedAt: at(20), mood: Math.round(clamp(mood + rnd.int(-1, 1), 1, 10)), energy: Math.round(clamp(energy - 1, 1, 10)) }] : []),
      ];
      const steps = rnd.chance(0.85) ? rnd.int(3500, cycling ? 9000 : 13000) : undefined;
      const activeCalories = rnd.chance(0.7) ? rnd.int(180, cycling ? 750 : 550) : undefined;

      entries.push({
        date,
        sleepHours,
        ...(rnd.chance(0.75) && { weightKg: Math.round(weight * 10) / 10 }),
        ...(steps !== undefined && { steps }),
        ...(activeCalories !== undefined && { activeCalories }),
        moodLogs,
        workouts: workouts.map((w) => ({ ...w, loggedAt: at(w.type === "Gym" ? 18 : 7), source: "manual" as const })),
        mentalActivities: mentalActivities.map((a) => ({ ...a, loggedAt: at(a.type === "Meditation" ? 6 : 21) })),
        outdoorActivities: outdoorActivities.map((a) => ({ ...a, loggedAt: at(a.type === "Cycling" ? 7 : 16) })),
        goodThings: rnd.some(GOOD_THINGS, rnd.int(0, 3)).map((text) => ({ text, loggedAt: at(rnd.int(10, 21)) })),
        learnings: learnings.map((l) => ({ ...l, loggedAt: at(rnd.int(9, 22)) })),
        presentMoments: rnd.chance(0.6) ? [{ text: rnd.pick(REFLECTIONS), loggedAt: at(21) }] : [],
        healthSnapshots: snapshots(date, steps, activeCalories),
        waterLogs: [],
      });
    }

    // Meals are logged on most check-in days, and on some days without a check-in
    if (skipped ? rnd.chance(0.3) : rnd.chance(0.85)) {
      const items: DemoMealItem[] = [
        { mealType: "breakfast", foodName: rnd.pick(["String hoppers with curry", "Oats with banana", "Egg hoppers"] as const), servings: rnd.pick([0.75, 1, 1]) },
        { mealType: "breakfast", foodName: "Milk tea", servings: 1 },
        { mealType: "lunch", foodName: rnd.pick(["Rice and curry", "Fish curry with red rice"] as const), servings: rnd.pick([1, 1, 1.25]) },
        ...(rnd.chance(0.7) ? [{ mealType: "snack" as const, foodName: rnd.pick(["Banana", "Roasted chickpeas", "Milk tea"] as const), servings: 1 }] : []),
        {
          mealType: "dinner",
          foodName: rnd.pick(["Rice and curry", "Chicken kottu", "Fish curry with red rice", "String hoppers with curry"] as const),
          servings: rnd.pick([0.75, 1, 1]),
        },
      ];
      mealDays.push({ date, items });
    }
  }

  addDailyExtras(entries, today, seed + 1);
  return { entries, mealDays };
}

// ---------- Water, sleep and daily purposes ----------
// A second random stream, so adding these didn't change any of the data above.

export const DEMO_PURPOSE = {
  purposeStatement: "To live with curiosity and care: keep learning, stay active, and show up for the people around me.",
  coreValues: ["Health", "Curiosity", "Family", "Kindness", "Growth", "Calm"],
  longTermGoals: [
    { title: "Ride 100 km in one day", why: "To prove to myself that steady training adds up." },
    { title: "Build and ship a side project", why: "Learning is more fun when it becomes something real." },
    { title: "Reach a healthy weight and keep it", why: "More energy for the things I love." },
  ],
};

const PURPOSES = [
  "Be present and patient today",
  "Make steady progress on the project",
  "Look after my body: move, eat well, rest",
  "Be a good friend and listener",
  "Learn one thing deeply instead of many things lightly",
  "Keep the day calm and simple",
];
const INTENTIONS = [
  "Go cycling",
  "30 minutes of reading",
  "Cook a healthy dinner",
  "Call a friend",
  "Stretch for 10 minutes",
  "Study for an hour",
  "Walk after lunch",
  "Phone-free first hour",
  "Drink 2 litres of water",
  "Write three good things",
];
const REFLECTION_NOTES = ["Mostly on track.", "Got distracted in the afternoon, but the evening was good.", "A really good day.", "Tired, but I did what mattered."];

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function addDailyExtras(entries: DemoEntry[], today: string, seed: number): void {
  const rnd = createRandom(seed);
  const bedtimes: string[] = [];

  for (const e of entries) {
    const isToday = e.date === today;
    const at = (hour: number, minute = rnd.int(0, 59)) => atTime(e.date, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);

    // Water: 4–9 drinks through the day (fewer so far today)
    const drinks = isToday ? rnd.int(2, 4) : rnd.int(4, 9);
    const hours = [...new Set(Array.from({ length: drinks }, () => rnd.int(7, isToday ? 11 : 21)))].sort((a, b) => a - b);
    e.waterLogs = hours.map((h) => ({ loggedAt: at(h), amountMl: rnd.pick([250, 250, 250, 330, 500]) }));

    // Sleep: last night, split into stages, scored the same way as a real sync
    const totalSleepMin = Math.round(e.sleepHours * 60);
    const awakeCount = rnd.pick([0, 1, 1, 2, 2, 3]);
    const awakeMin = awakeCount === 0 ? 0 : rnd.int(awakeCount * 3, awakeCount * 9);
    const deepMin = Math.round(totalSleepMin * rnd.between(0.13, 0.2));
    const remMin = Math.round(totalSleepMin * rnd.between(0.19, 0.25));
    const bed = (clockMinutes("22:40") + rnd.int(0, 95)) % 1440; // 22:40 – 00:15
    const night: NightSummary = {
      totalSleepMin,
      deepMin,
      remMin,
      coreMin: totalSleepMin - deepMin - remMin,
      awakeCount,
      awakeMin,
      bedtime: clock(bed),
      wakeTime: clock((bed + totalSleepMin + awakeMin) % 1440),
    };
    const { score, breakdown } = sleepScore(night, bedtimes.slice(-14));
    bedtimes.push(night.bedtime);
    e.sleepHours = sleepHoursFrom(totalSleepMin);
    e.sleep = { ...night, score, breakdown, source: "watch" };
    e.sleepScoreValue = score;
    e.sleepScoreSource = "auto";

    // A purpose on about 3 days in 4 (always today)
    if (!isToday && !rnd.chance(0.75)) continue;
    const setAt = at(7, rnd.int(0, 30));
    // Past days were reflected on in the evening; today's reflection is still to come
    const reflected = !isToday && rnd.chance(0.8);
    const intentionPool = rnd.some(INTENTIONS, INTENTIONS.length);
    e.dailyPurposes = rnd.some(PURPOSES, rnd.pick([1, 1, 2, 3])).map((text) => ({
      text,
      focusValues: rnd.some(DEMO_PURPOSE.coreValues, rnd.int(1, 2)),
      intentions: intentionPool.splice(0, rnd.int(1, 3)).map((intention) => {
        const done = isToday ? rnd.chance(0.35) : rnd.chance(0.75);
        return { text: intention, done, ...(done && { doneAt: at(isToday ? rnd.int(8, 11) : rnd.int(9, 21)) }) };
      }),
      ...(reflected && { rating: rnd.pick([3, 4, 4, 5]) }),
      createdAt: setAt,
      updatedAt: setAt,
    }));
    if (reflected && rnd.chance(0.5)) e.dailyReflectionNote = rnd.pick(REFLECTION_NOTES);
  }
}

// ---------- Diary, thought logs and weekly goals ----------
// Neutral, made-up content only.

export type DemoDiaryEntry = { date: string; title: string; body: string; tags: string[]; isFavourite: boolean };
export type DemoThoughtLog = {
  date: string;
  situation: string;
  thought: string;
  feelings: { name: string; intensityBefore: number }[];
  distortions: Distortion[];
  evidenceFor: string;
  evidenceAgainst: string;
  friendAdvice: string;
  balancedThought: string;
  smallStep: string;
  smallStepDone: boolean;
  intensityAfter: number;
};
export type DemoWeeklyGoal = { weekStart: string; weekEnd: string; text: string; source: "typed" | "ai"; done: boolean };

const DIARY: (Omit<DemoDiaryEntry, "date"> & { daysAgo: number })[] = [
  {
    daysAgo: 1,
    title: "A slow Sunday",
    body: "Slept in a little, then rode along the coast before it got hot. Spent the afternoon reading and cooking a big pot of dhal for the week. Nothing special happened, and that felt like exactly what I needed.",
    tags: ["weekend", "calm"],
    isFavourite: true,
  },
  {
    daysAgo: 6,
    title: "Progress on the side project",
    body: "Finally got the charts working. It took longer than planned, but breaking the problem into small pieces helped. Note to self: write the plan down before starting.",
    tags: ["learning", "work"],
    isFavourite: false,
  },
  {
    daysAgo: 15,
    title: "Family dinner",
    body: "Everyone was home for dinner tonight. Lots of laughing about old stories. I want to make these evenings happen more often, not just on special occasions.",
    tags: ["family", "gratitude"],
    isFavourite: true,
  },
  {
    daysAgo: 29,
    title: "Halfway through the month",
    body: "Looking back at the last two weeks: more movement, better sleep on most nights, and the morning walks are still going. The evenings are where my routine slips.",
    tags: ["reflection"],
    isFavourite: false,
  },
  {
    daysAgo: 47,
    title: "Starting fresh",
    body: "Decided to track how my days actually go instead of how I think they go. Small, honest check-ins. Curious what I'll notice.",
    tags: ["reflection", "goals"],
    isFavourite: false,
  },
];

const THOUGHTS: (Omit<DemoThoughtLog, "date"> & { daysAgo: number })[] = [
  {
    daysAgo: 3,
    situation: "A presentation at work didn't go as smoothly as I wanted.",
    thought: "Everyone must think I don't know what I'm doing.",
    feelings: [
      { name: "Worried", intensityBefore: 7 },
      { name: "Frustrated", intensityBefore: 5 },
    ],
    distortions: ["mind-reading", "all-or-nothing"],
    evidenceFor: "I lost my place once and had to check my notes.",
    evidenceAgainst: "Two people asked good follow-up questions, and my manager said the main points were clear.",
    friendAdvice: "One stumble doesn't undo the preparation you did. People remember the content.",
    balancedThought: "It wasn't perfect, but it was useful, and I can practise the opening next time.",
    smallStep: "Rehearse the first two minutes out loud before the next one.",
    smallStepDone: false,
    intensityAfter: 3,
  },
  {
    daysAgo: 18,
    situation: "Skipped my workout three days in a row.",
    thought: "I always give up on things.",
    feelings: [{ name: "Frustrated", intensityBefore: 6 }],
    distortions: ["overgeneralising", "labelling"],
    evidenceFor: "I missed three planned sessions.",
    evidenceAgainst: "I've exercised most weeks for over a month. It was a busy week.",
    friendAdvice: "Missing a few days is normal. What matters is starting again.",
    balancedThought: "I had a busy week and fell behind. I can pick it back up with a short session.",
    smallStep: "A 20-minute ride tomorrow morning.",
    smallStepDone: true,
    intensityAfter: 2,
  },
  {
    daysAgo: 35,
    situation: "A friend didn't reply to my message all day.",
    thought: "Maybe I said something wrong.",
    feelings: [{ name: "Anxious", intensityBefore: 5 }],
    distortions: ["personalising", "fortune-telling"],
    evidenceFor: "They usually reply quickly.",
    evidenceAgainst: "They mentioned a deadline this week. Nothing in my message was unkind.",
    friendAdvice: "People get busy. You can check in tomorrow if you're still unsure.",
    balancedThought: "They're probably just busy. No reply isn't a sign that something's wrong.",
    smallStep: "Send a light message tomorrow if I still haven't heard back.",
    smallStepDone: true,
    intensityAfter: 1,
  },
];

const WEEKLY_GOALS = [
  "Three rides this week",
  "In bed by 23:00 on weeknights",
  "Cook at home five days",
  "Read for 20 minutes every evening",
  "A walk after lunch every workday",
  "Call family twice",
  "Two hours on the side project",
];

/** Diary entries, thought logs and weekly goals, dated back from `today` (all within 60 days). */
export function generateDemoMind(today: string): { diary: DemoDiaryEntry[]; thoughts: DemoThoughtLog[]; weeklyGoals: DemoWeeklyGoal[] } {
  const dated = <T extends { daysAgo: number }>({ daysAgo, ...rest }: T) => ({ ...rest, date: addDays(today, -daysAgo) });
  // Weekly review weeks end on today, today−7, …; each goal covers one of those weeks. This week's is still open.
  const weeklyGoals: DemoWeeklyGoal[] = WEEKLY_GOALS.map((text, i) => {
    const weekEnd = addDays(today, -7 * i);
    return { weekStart: addDays(weekEnd, -6), weekEnd, text, source: i % 3 === 1 ? "ai" : "typed", done: i > 0 && i % 4 !== 2 };
  });
  return { diary: DIARY.map(dated), thoughts: THOUGHTS.map(dated), weeklyGoals };
}
