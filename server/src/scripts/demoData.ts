// Generates 60 days of realistic, varied demo data. Pure (no database), so it can be tested.
// A fixed seed makes the "random" data the same on every run.
import { addDays } from "../utils/dates";
import type { MealType } from "../utils/meals";

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
  { name: "String hoppers with curry", servingDescription: "10 pieces", kcalPerServing: 420, proteinG: 9, carbsG: 80, fatG: 7, isFavourite: true },
  { name: "Milk tea", servingDescription: "1 cup", kcalPerServing: 110, carbsG: 16, fatG: 3, isFavourite: true },
  { name: "Rice and curry", servingDescription: "1 plate", kcalPerServing: 650, proteinG: 22, carbsG: 95, fatG: 18, isFavourite: true },
  { name: "Oats with banana", servingDescription: "1 bowl", kcalPerServing: 330, proteinG: 10, carbsG: 58, fatG: 6 },
  { name: "Chicken kottu", servingDescription: "1 plate", kcalPerServing: 780, proteinG: 35, carbsG: 85, fatG: 30 },
  { name: "Banana", servingDescription: "1 medium", kcalPerServing: 105, proteinG: 1, carbsG: 27, fatG: 0 },
  { name: "Roasted chickpeas", servingDescription: "1 cup", kcalPerServing: 270, proteinG: 14, carbsG: 40, fatG: 6 },
  { name: "Fish curry with red rice", servingDescription: "1 plate", kcalPerServing: 560, proteinG: 32, carbsG: 70, fatG: 14 },
  { name: "Egg hoppers", servingDescription: "2 hoppers", kcalPerServing: 300, proteinG: 13, carbsG: 34, fatG: 12 },
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

export type DemoEntry = {
  date: string;
  mood: number;
  energy: number;
  sleepHours: number;
  weightKg?: number;
  steps?: number;
  activeCalories?: number;
  workouts: { type: string; durationMin: number }[];
  mentalActivities: { type: string; durationMin?: number }[];
  outdoorActivities: { type: string; durationMin?: number }[];
  goodThings: string[];
  learnings: { topic: string; details?: string; minutes?: number }[];
  presentMoment: string;
};

export type DemoMealItem = { mealType: MealType; foodName: FoodName; servings: number };
export type DemoMealDay = { date: string; items: DemoMealItem[] };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

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

      entries.push({
        date,
        mood,
        energy,
        sleepHours,
        ...(rnd.chance(0.75) && { weightKg: Math.round(weight * 10) / 10 }),
        ...(rnd.chance(0.85) && { steps: rnd.int(3500, cycling ? 9000 : 13000) }),
        ...(rnd.chance(0.7) && { activeCalories: rnd.int(180, cycling ? 750 : 550) }),
        workouts,
        mentalActivities,
        outdoorActivities,
        goodThings: rnd.some(GOOD_THINGS, rnd.int(0, 3)),
        learnings,
        presentMoment: rnd.chance(0.6) ? rnd.pick(REFLECTIONS) : "",
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

  return { entries, mealDays };
}
