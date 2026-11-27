// The demo's three sample programs (no photos: uploads are off in the demo). Pure, so it can be
// tested. With DEMO_DAYS = 150 of sample data ending today:
//   - completed:   a 30-day reset, days −149 … −120
//   - ended early: a 100-day transformation ended on day 37 (days −115 … −79), reason "too busy"
//   - (a break)
//   - active:      a 100-day transformation on day 40 (started 39 days ago)
import { addDays } from "../utils/dates";

const ratings = (confidence: number, discipline: number, fitness: number, mentalWellbeing: number, focus: number) => ({
  confidence,
  discipline,
  fitness,
  mentalWellbeing,
  focus,
  custom: [],
});

export type SampleProgram = {
  name: string;
  lengthDays: number;
  startDate: string;
  status: "active" | "completed" | "ended_early";
  endedOn?: string;
  endedOnDay?: number;
  endedAt?: Date;
  endReason?: "too busy";
  /** Plain text, encrypted when stored */
  texts: { why: string; goalNotes: string; final?: string; midpoint?: string; endNote?: string };
  baseline: { weightKg: number; ratings: ReturnType<typeof ratings>; habits: string[] };
  goals: { goalWeightKg: number; ratings: ReturnType<typeof ratings>; habits: string[]; focusAreas: string[] };
  plan: { waterMl: number; calorieTarget: number; sleepHours: number; workoutsPerWeek: number; learningMinutes: number; customHabits: { id: string; label: string }[] };
  midpoint?: { date: string; weightKg: number; ratings: ReturnType<typeof ratings> };
  final?: { date: string; weightKg: number; ratings: ReturnType<typeof ratings> };
};

export const ACTIVE_HABITS = [
  { id: "demowalk", label: "Walk after dinner" },
  { id: "demosugar", label: "No sugary drinks" },
];

export function samplePrograms(today: string): SampleProgram[] {
  const completedStart = addDays(today, -149);
  const endedStart = addDays(today, -115);
  const activeStart = addDays(today, -39);
  return [
    {
      name: "30-day reset",
      lengthDays: 30,
      startDate: completedStart,
      status: "completed",
      texts: { why: "Feel more awake in the mornings.", goalNotes: "Simple routines first.", final: "Mornings feel easier. Keeping the early nights." },
      baseline: { weightKg: 86.4, ratings: ratings(4, 3, 4, 5, 4), habits: ["Late nights", "Skipping breakfast"] },
      goals: { goalWeightKg: 85, ratings: ratings(6, 6, 5, 6, 6), habits: ["Sleep by 11"], focusAreas: ["physical", "mental"] },
      plan: { waterMl: 2000, calorieTarget: 2100, sleepHours: 7.5, workoutsPerWeek: 2, learningMinutes: 15, customHabits: [] },
      final: { date: addDays(completedStart, 29), weightKg: 85.6, ratings: ratings(6, 5, 5, 6, 6) },
    },
    {
      name: "100-day transformation",
      lengthDays: 100,
      startDate: endedStart,
      status: "ended_early",
      endedOn: addDays(endedStart, 36),
      endedOnDay: 37,
      endedAt: new Date(`${addDays(endedStart, 36)}T20:00:00+05:30`),
      endReason: "too busy",
      texts: { why: "Get fit before the new year.", goalNotes: "Gym three times a week.", endNote: "Work got busy. I'll come back to it." },
      baseline: { weightKg: 85.9, ratings: ratings(5, 4, 4, 5, 5), habits: ["Little exercise"] },
      goals: { goalWeightKg: 80, ratings: ratings(7, 7, 7, 7, 7), habits: ["Gym 3× a week"], focusAreas: ["physical"] },
      plan: { waterMl: 2500, calorieTarget: 2000, sleepHours: 7.5, workoutsPerWeek: 3, learningMinutes: 20, customHabits: [] },
      final: { date: addDays(endedStart, 36), weightKg: 84.7, ratings: ratings(6, 6, 5, 6, 6) },
    },
    {
      name: "100-day transformation",
      lengthDays: 100,
      startDate: activeStart,
      status: "active",
      texts: { why: "Energy for my family, and to feel strong again.", goalNotes: "Steady, not perfect.", midpoint: "" },
      baseline: { weightKg: 84.8, ratings: ratings(5, 5, 5, 6, 5), habits: ["Late-night scrolling"] },
      goals: { goalWeightKg: 79, ratings: ratings(8, 8, 7, 8, 7), habits: ["Walk after dinner", "Read 20 minutes"], focusAreas: ["physical", "mental", "learning"] },
      plan: { waterMl: 2500, calorieTarget: 2000, sleepHours: 7.5, workoutsPerWeek: 3, learningMinutes: 20, customHabits: ACTIVE_HABITS },
    },
  ];
}

/** The active program's habits ticked on a day (most days, not all), for the sample entries. */
export function sampleHabitTicks(date: string, today: string): string[] | undefined {
  const start = addDays(today, -39);
  if (date < start || date > today) return undefined;
  const n = Number(date.replace(/-/g, ""));
  return ACTIVE_HABITS.filter((_, i) => (n + i * 3) % 5 !== 0).map((h) => h.id);
}
