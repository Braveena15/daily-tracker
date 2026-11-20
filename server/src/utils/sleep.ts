// Sleep from Apple Health: parsing the samples an iOS Shortcut sends, summarising one night,
// and our own sleep score. Pure functions, so every rule is easy to test.
//
// Samples arrive as text, one per line: "startISO;endISO;stage", e.g.
//   2026-11-19T23:10:00+05:30;2026-11-20T01:40:00+05:30;Core
//
// Overlapping intervals are merged before anything is summed. The Watch and the iPhone often
// both record the same night, so the same 2 hours can appear twice; adding them up as-is would
// report 2 hours as 4. Merging turns "23:00–01:00" + "23:30–01:30" into one "23:00–01:30".
import type { ScoreLine } from "./scores";
import { DEFAULT_TIMEZONE, todayInTimezone } from "./dates";

export type SleepStage = "inBed" | "asleep" | "core" | "deep" | "rem" | "awake";
/** start and end are epoch milliseconds; end is always after start. */
export type SleepSample = { start: number; end: number; stage: SleepStage };
type Interval = { start: number; end: number };

const MINUTE = 60_000;
// Asia/Colombo has been a fixed UTC+05:30 since 2006 (no daylight saving)
const LOCAL_OFFSET = "+05:30";

const STAGES: Record<string, SleepStage> = {
  "in bed": "inBed",
  inbed: "inBed",
  asleep: "asleep",
  unspecified: "asleep",
  core: "core",
  deep: "deep",
  rem: "rem",
  awake: "awake",
};
const ASLEEP_STAGES = new Set<SleepStage>(["asleep", "core", "deep", "rem"]);

/** "In Bed", " in  bed ", "Asleep Core" (older Shortcuts) → a stage, or null. */
export function parseStage(text: string): SleepStage | null {
  let key = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (key.startsWith("asleep ")) key = key.slice("asleep ".length); // "asleep core" → "core"
  return STAGES[key] ?? null;
}

/**
 * An ISO date-time as epoch ms, or null. Accepts "T" or a space between date and time, and an
 * offset like "Z", "+05:30" or "+0530". A time without an offset is read as Asia/Colombo time.
 */
export function parseInstant(text: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(text.trim());
  if (!m) return null;
  const [, date, h, min, sec = "00", frac = "", rawOffset] = m;
  const offset = rawOffset ? (rawOffset.toUpperCase() === "Z" ? "Z" : rawOffset.replace(/^([+-]\d{2}):?(\d{2})$/, "$1:$2")) : LOCAL_OFFSET;
  const ms = Date.parse(`${date}T${h!.padStart(2, "0")}:${min}:${sec}${frac}${offset}`);
  return Number.isNaN(ms) ? null : ms;
}

/** Every line that parses; anything else (blank lines, headers, bad dates, unknown stages) is skipped. */
export function parseSleepSamples(text: string): SleepSample[] {
  const samples: SleepSample[] = [];
  for (const line of text.split(/\r?\n|\r/)) {
    const parts = line.split(";");
    if (parts.length !== 3) continue;
    const start = parseInstant(parts[0]!);
    const end = parseInstant(parts[1]!);
    const stage = parseStage(parts[2]!);
    if (start === null || end === null || stage === null || end <= start) continue;
    samples.push({ start, end, stage });
  }
  return samples;
}

/** Overlapping or touching intervals joined into one, sorted by start. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const { start, end } of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else merged.push({ start, end });
  }
  return merged;
}

const minutesOf = (intervals: Interval[]) => intervals.reduce((sum, i) => sum + (i.end - i.start), 0) / MINUTE;

// ---------- Picking the night ----------
// The Shortcut sends the last 2 days of samples, so they can hold two nights (and naps).
// Asleep time is grouped into sessions: a gap of more than 3 hours starts a new one.
// The night for a date is the session whose last asleep sample ends on that date
// (Asia/Colombo); if several do (a nap and the night), the longest is the main sleep.

export const SESSION_GAP_MIN = 3 * 60;

/** A stretch of sleep: from the first asleep minute to the last, and how long was spent asleep. */
export type SleepSession = { start: number; end: number; asleepMin: number };

/** Asleep samples grouped into sessions, oldest first. Awake and In Bed samples don't start or extend a session. */
export function sleepSessions(samples: SleepSample[]): SleepSession[] {
  const sessions: SleepSession[] = [];
  for (const i of mergeIntervals(samples.filter((s) => ASLEEP_STAGES.has(s.stage)))) {
    const last = sessions[sessions.length - 1];
    const minutes = (i.end - i.start) / MINUTE;
    // Merged intervals are sorted and don't overlap, so `last.end` is the latest end so far
    if (last && (i.start - last.end) / MINUTE <= SESSION_GAP_MIN) {
      last.end = i.end;
      last.asleepMin += minutes;
    } else {
      sessions.push({ start: i.start, end: i.end, asleepMin: minutes });
    }
  }
  return sessions;
}

/** The main sleep ending on `date`: the longest session whose last asleep sample ends that day. */
export function sessionEndingOn(samples: SleepSample[], date: string): SleepSession | null {
  const endingThatDay = sleepSessions(samples).filter((s) => todayInTimezone(DEFAULT_TIMEZONE, new Date(s.end)) === date);
  // Longest first; on a tie, the later one
  return endingThatDay.sort((a, b) => b.asleepMin - a.asleepMin || b.end - a.end)[0] ?? null;
}

const localTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
/** Epoch ms → "HH:mm" in Asia/Colombo. */
export const toLocalTime = (ms: number) => localTime.format(ms);

export type NightSummary = {
  totalSleepMin: number;
  deepMin: number;
  remMin: number;
  coreMin: number;
  /** Separate awake periods of 2+ minutes between falling asleep and waking up */
  awakeCount: number;
  /** All awake time between falling asleep and waking up */
  awakeMin: number;
  /** "HH:mm", Asia/Colombo: the first time asleep */
  bedtime: string;
  /** "HH:mm", Asia/Colombo: the last time asleep */
  wakeTime: string;
};

const MIN_AWAKE_PERIOD_MIN = 2;

/**
 * The night ending on `date` (see sessionEndingOn), or null when the samples hold no sleep
 * ending that day. Samples from every other session are ignored. "In Bed" is ignored.
 */
export function summariseNight(samples: SleepSample[], date: string): NightSummary | null {
  const night = sessionEndingOn(samples, date);
  if (!night) return null;
  const inNight = samples
    .map((s) => ({ ...s, start: Math.max(s.start, night.start), end: Math.min(s.end, night.end) }))
    .filter((s) => s.end > s.start);

  const asleep = mergeIntervals(inNight.filter((s) => ASLEEP_STAGES.has(s.stage)));
  if (asleep.length === 0) return null;
  const stageMin = (stage: SleepStage) => Math.round(minutesOf(mergeIntervals(inNight.filter((s) => s.stage === stage))));

  const fellAsleep = asleep[0]!.start;
  const wokeUp = asleep[asleep.length - 1]!.end;
  const awake = mergeIntervals(inNight.filter((s) => s.stage === "awake"))
    .map((i) => ({ start: Math.max(i.start, fellAsleep), end: Math.min(i.end, wokeUp) }))
    .filter((i) => i.end > i.start);

  return {
    totalSleepMin: Math.round(minutesOf(asleep)),
    deepMin: stageMin("deep"),
    remMin: stageMin("rem"),
    coreMin: stageMin("core"),
    awakeCount: awake.filter((i) => (i.end - i.start) / MINUTE >= MIN_AWAKE_PERIOD_MIN).length,
    awakeMin: Math.round(minutesOf(awake)),
    bedtime: toLocalTime(fellAsleep),
    wakeTime: toLocalTime(wokeUp),
  };
}

// ---------- Score ----------
// Duration 50 + bedtime consistency 30 + interruptions 20 = 100, modelled on the weighting
// Apple publishes for its own sleep score. It's our own calculation, not Apple's.

/** "7 h 32 min", "45 min", "8 h". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** 7–9 h → 50; down to 0 at 4 h; above 9 h a small reduction, to 40 at 11 h (and beyond). */
export function durationLine(totalSleepMin: number): ScoreLine {
  const line = { label: "Duration", max: 50 };
  const t = totalSleepMin;
  const slept = formatDuration(t);
  if (t >= 420 && t <= 540) return { ...line, points: 50, reason: `${slept} — in the 7–9 h range ✓` };
  if (t < 420) {
    const points = Math.round(Math.max(0, (50 * (t - 240)) / 180));
    return { ...line, points, reason: `${slept} — under 7 h` };
  }
  const points = Math.round(50 - (10 * (Math.min(t, 660) - 540)) / 120);
  return { ...line, points, reason: `${slept} — over 9 h` };
}

/** "23:40" → minutes after midnight. */
export const clockMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(Math.round(minutes) % 60).padStart(2, "0")}`;

/**
 * The average of clock times on a 24-hour circle, so 23:30 and 00:30 average to 00:00
 * (a plain average would give 12:00).
 */
export function averageClockTime(times: string[]): string {
  const angles = times.map((t) => (clockMinutes(t) / 1440) * 2 * Math.PI);
  const x = angles.reduce((s, a) => s + Math.cos(a), 0);
  const y = angles.reduce((s, a) => s + Math.sin(a), 0);
  const minutes = ((Math.atan2(y, x) / (2 * Math.PI)) * 1440 + 1440) % 1440;
  return toClock(Math.round(minutes) % 1440);
}

/** Minutes between two clock times the short way round midnight: 23:50 and 00:20 are 30 apart. */
export function clockDifference(a: string, b: string): number {
  const d = Math.abs(clockMinutes(a) - clockMinutes(b));
  return Math.min(d, 1440 - d);
}

export const MIN_BASELINE_NIGHTS = 3;

/** ≤ 30 min from your usual bedtime → 30, down to 0 at 2 h or more. Full points until there's a baseline. */
export function consistencyLine(bedtime: string, previousBedtimes: string[]): ScoreLine {
  const line = { label: "Bedtime consistency", max: 30 };
  if (previousBedtimes.length < MIN_BASELINE_NIGHTS) return { ...line, points: 30, reason: "Building your baseline" };

  const usual = averageClockTime(previousBedtimes);
  const diff = clockDifference(bedtime, usual);
  const points = diff <= 30 ? 30 : diff >= 120 ? 0 : Math.round((30 * (120 - diff)) / 90);
  return {
    ...line,
    points,
    reason: `Asleep at ${bedtime}, ${formatDuration(diff)} from your usual ${usual}${diff <= 30 ? " ✓" : ""}`,
  };
}

/** 20, minus 4 for each awake period after the first, minus 1 per 5 awake minutes beyond 10. */
export function interruptionsLine(awakeCount: number, awakeMin: number): ScoreLine {
  const line = { label: "Interruptions", max: 20 };
  const extraWakes = Math.max(0, awakeCount - 1);
  const extraMinutes = Math.floor(Math.max(0, awakeMin - 10) / 5);
  const points = Math.max(0, 20 - 4 * extraWakes - extraMinutes);
  const times = awakeCount === 0 ? "No awake periods" : `Awake ${awakeCount} ${awakeCount === 1 ? "time" : "times"}`;
  return { ...line, points, reason: `${times}, ${formatDuration(awakeMin)} awake${points === 20 ? " ✓" : ""}` };
}

export type SleepScore = { score: number; breakdown: ScoreLine[] };

/** Our sleep score (0–100) for one night. previousBedtimes: "HH:mm" from up to 14 earlier nights. */
export function sleepScore(night: NightSummary, previousBedtimes: string[]): SleepScore {
  const breakdown = [
    durationLine(night.totalSleepMin),
    consistencyLine(night.bedtime, previousBedtimes),
    interruptionsLine(night.awakeCount, night.awakeMin),
  ];
  return { score: breakdown.reduce((s, l) => s + l.points, 0), breakdown };
}

/** Hours for sleepHours, to 2 decimals. */
export const sleepHoursFrom = (totalSleepMin: number) => Math.round((totalSleepMin / 60) * 100) / 100;
