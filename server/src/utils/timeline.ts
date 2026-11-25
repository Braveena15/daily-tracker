// A day as a timeline of timestamped entries. Pure functions, so they're easy to test.
//
// Every multi-entry (mood check-in, workout, good thing…) has its own _id and a loggedAt time.
// Times are stored as real instants (Date / ISO) and shown in the app's timezone, Asia/Colombo,
// which is always UTC+05:30 (no daylight saving).
import { DEFAULT_TIMEZONE } from "./dates";

export const APP_UTC_OFFSET = "+05:30";

// ---------- Kinds ----------

/** The URL name of each kind (POST /api/entries/:date/:kind) and the field it's stored in. */
export const KIND_FIELDS = {
  moods: "moodLogs",
  workouts: "workouts",
  mental: "mentalActivities",
  outdoor: "outdoorActivities",
  goodThings: "goodThings",
  learnings: "learnings",
  presentMoments: "presentMoments",
  water: "waterLogs",
} as const;
export type EntryKind = keyof typeof KIND_FIELDS;
export type EntryField = (typeof KIND_FIELDS)[EntryKind];

export const isEntryKind = (value: unknown): value is EntryKind => typeof value === "string" && Object.hasOwn(KIND_FIELDS, value);

// ---------- Times ----------

/** "HH:mm" in the app's timezone. */
export function clockTime(at: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

/** The instant for "HH:mm" on a calendar day, in the app's timezone. */
export function atTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${APP_UTC_OFFSET}`);
}

export class LoggedAtError extends Error {}

/**
 * When a new entry was logged: `time` ("HH:mm") on `date`, or now when no time is given.
 * Past days without a time get midday. A time later than now is rejected.
 */
export function resolveLoggedAt(date: string, time: string | undefined, now: Date, today: string): Date {
  if (time === undefined) return date === today ? now : atTime(date, "12:00");
  const at = atTime(date, time);
  if (at.getTime() > now.getTime() + 60_000) throw new LoggedAtError("That time hasn't happened yet");
  return at;
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

/** Morning 05–12, afternoon 12–17, evening 17–21, night otherwise. */
export function timeOfDay(at: Date | string): TimeOfDay {
  const hour = Number(clockTime(at).slice(0, 2));
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

// ---------- Mood ----------

export type MoodLike = { mood: number; energy: number; loggedAt?: Date | string | null };

export type DayMood = {
  count: number;
  avgMood: number;
  avgEnergy: number;
  minMood: number;
  maxMood: number;
  lowest: MoodLike;
  highest: MoodLike;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The day's mood check-ins summed up, or null when there are none. */
export function dayMood(logs: readonly MoodLike[] | null | undefined): DayMood | null {
  if (!logs || logs.length === 0) return null;
  const avg = (pick: (m: MoodLike) => number) => round1(logs.reduce((s, m) => s + pick(m), 0) / logs.length);
  // Ties go to the earliest check-in
  const lowest = logs.reduce((a, b) => (b.mood < a.mood ? b : a));
  const highest = logs.reduce((a, b) => (b.mood > a.mood ? b : a));
  return {
    count: logs.length,
    avgMood: avg((m) => m.mood),
    avgEnergy: avg((m) => m.energy),
    minMood: lowest.mood,
    maxMood: highest.mood,
    lowest,
    highest,
  };
}

// ---------- Timeline ----------

type Stamped = { _id?: unknown; loggedAt: Date | string };
type Activity = Stamped & { type: string; durationMin?: number | null; notes?: string | null; source?: string | null };

/** The parts of a stored day the timeline uses. */
export type TimelineSource = {
  date: string;
  moodLogs?: (Stamped & { mood: number; energy: number; note?: string | null })[];
  workouts?: (Activity & { calories?: number | null })[];
  mentalActivities?: Activity[];
  outdoorActivities?: Activity[];
  goodThings?: (Stamped & { text: string })[];
  learnings?: { _id?: unknown; loggedAt?: Date | string | null; topic: string; minutes?: number | null }[];
  presentMoments?: (Stamped & { text: string })[];
  waterLogs?: (Stamped & { amountMl: number })[];
  sleep?: { wakeTime: string; totalSleepMin: number } | null;
};

export type TimelineKind = EntryKind | "sleep";
export type TimelineItem = { time: string; kind: TimelineKind; summary: string; id?: string };

const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const iso = (at: Date | string) => new Date(at).toISOString();
const minutesText = (min: number | null | undefined) => (min ? ` · ${min} min` : "");

/** "7 h 14 min" */
function duration(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** "React hooks · 30 min": a learning without a time, for the timeline's "Learned today" group. */
export type LearnedItem = { id: string; summary: string };

/** The day's learnings, newest added first (by when they were added; the time is never shown). */
export function learnedList(day: Pick<TimelineSource, "learnings">): LearnedItem[] {
  const at = (l: { loggedAt?: Date | string | null }) => (l.loggedAt ? new Date(l.loggedAt).getTime() : 0);
  return [...(day.learnings ?? [])]
    .sort((a, b) => at(b) - at(a))
    .map((l) => ({ id: String(l._id), summary: `${l.topic}${minutesText(l.minutes)}` }));
}

/** Everything logged at a time of day, oldest first (learnings are separate: see learnedList). Shown only to the day's owner. */
export function buildTimeline(day: TimelineSource): TimelineItem[] {
  const items: TimelineItem[] = [];
  const add = (kind: TimelineKind, list: Stamped[] | undefined, summary: (item: never) => string) => {
    for (const item of list ?? []) {
      items.push({ time: iso(item.loggedAt), kind, summary: summary(item as never), ...(item._id != null && { id: String(item._id) }) });
    }
  };

  add("moods", day.moodLogs, (m: { mood: number; energy: number; note?: string | null }) =>
    `Mood ${m.mood}/10 · Energy ${m.energy}/10${m.note ? ` · ${clip(m.note, 60)}` : ""}`,
  );
  add("workouts", day.workouts, (w: Activity & { calories?: number | null }) =>
    `${w.type}${minutesText(w.durationMin)}`,
  );
  add("mental", day.mentalActivities, (a: Activity) => `${a.type}${minutesText(a.durationMin)}`);
  add("outdoor", day.outdoorActivities, (a: Activity) => `${a.type}${minutesText(a.durationMin)}`);
  add("goodThings", day.goodThings, (g: { text: string }) => clip(g.text));
  // Learnings have no time of day: they're listed apart, in learnedList()
  add("presentMoments", day.presentMoments, (p: { text: string }) => clip(p.text));
  // Water isn't on the timeline: it's shown as the day's total on the Water card

  if (day.sleep) {
    items.push({ time: iso(atTime(day.date, day.sleep.wakeTime)), kind: "sleep", summary: `Woke up · slept ${duration(day.sleep.totalSleepMin)}` });
  }

  return items.sort((a, b) => a.time.localeCompare(b.time));
}
