// "What matters to me today": up to 5 things a day, each with how strongly it's felt (intensity 0–10),
// and optional focus values, plus one evening note for the whole day. Older purposes may still hold
// intentions in the database; they're no longer read or shown.
// Pure functions: the encrypter is passed in, so they can be tested with a test key.
//
// Stored: each purpose's text and the evening note are encrypted.
// focusValues (words from the user's core values), done flags, times and intensities are not.
import type { FieldCrypto } from "./crypto";
import { addDays } from "./dates";

type StoredDate = Date | string | null | undefined;

export type StoredDayPurpose = {
  _id?: unknown;
  text?: string | null;
  focusValues?: string[] | null;
  intensity?: number | null;
  createdAt?: StoredDate;
  updatedAt?: StoredDate;
};

/** The purpose fields of a stored DailyEntry */
export type StoredDayPurposes = {
  dailyPurposes?: StoredDayPurpose[] | null;
  dailyReflectionNote?: string | null;
};

export type DayPurpose = {
  id: string;
  text: string;
  focusValues: string[];
  /** "How strongly do I feel this today?" 0–10; null only on purposes from before intensity existed */
  intensity: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** A day's purposes as the API returns them (decrypted, for the owner only) */
export type DayPurposes = {
  /** In the order they were added */
  purposes: DayPurpose[];
  /** The one evening note for the whole day ("" when there is none) */
  reflectionNote: string;
};

/** A day holds up to 5 purposes. */
export const MAX_PURPOSES = 5;
export const canAddPurpose = (count: number) => count < MAX_PURPOSES;

const iso = (d: StoredDate) => (d ? new Date(d).toISOString() : null);

/** The stored form of some text: encrypted, or undefined when empty. */
export function sealText(crypto: FieldCrypto, text: string | null | undefined): string | undefined {
  const trimmed = (text ?? "").trim();
  return trimmed ? crypto.encrypt(trimmed) : undefined;
}

/** For the API: everything decrypted. Text that can't be decrypted (wrong key) shows as empty. */
export function openDayPurposes(crypto: FieldCrypto, stored: StoredDayPurposes | null | undefined): DayPurposes {
  const open = (value: string | null | undefined) => (value ? (crypto.tryDecrypt(value) ?? "") : "");
  return {
    purposes: (stored?.dailyPurposes ?? []).map((p) => ({
      id: String(p._id),
      text: open(p.text),
      focusValues: [...(p.focusValues ?? [])],
      intensity: typeof p.intensity === "number" ? p.intensity : null,
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
    })),
    reflectionNote: open(stored?.dailyReflectionNote),
  };
}

/** True when the day has anything purpose-related worth showing. */
export const hasDayPurposes = (d: DayPurposes | null | undefined): d is DayPurposes =>
  !!d && (d.purposes.length > 0 || d.reflectionNote.trim() !== "");

const intensitiesOf = (purposes: DayPurpose[]) => purposes.flatMap((p) => (p.intensity === null ? [] : [p.intensity]));

/** "2 things · avg intensity 7/10": the counts behind every summary. */
export function daySummary(d: DayPurposes) {
  const intensities = intensitiesOf(d.purposes);
  return {
    purposes: d.purposes.length,
    intensities,
    /** 1 decimal, null without intensities */
    avgIntensity: average(intensities),
  };
}

const average = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

/** Focus values must be some of the user's core values (matched ignoring case, spelled as in the core values). */
export function pickFocusValues(chosen: string[], coreValues: string[]): { values: string[]; unknown: string[] } {
  const byLower = new Map(coreValues.map((v) => [v.trim().toLowerCase(), v.trim()]));
  const values: string[] = [];
  const unknown: string[] = [];
  for (const value of chosen) {
    const match = byLower.get(value.trim().toLowerCase());
    if (!match) unknown.push(value);
    else if (!values.includes(match)) values.push(match);
  }
  return { values, unknown };
}

// ---------- Purpose versions ----------

export type Goal = { title: string; why: string };
export type PurposeContent = { purposeStatement: string; coreValues: string[]; longTermGoals: Goal[] };
export type StoredPurpose = {
  purposeStatement?: string | null;
  coreValues?: string[] | null;
  longTermGoals?: { title: string; why?: string | null }[] | null;
  updatedAt?: Date | string | null;
} | null;

/** The purpose as the API returns it (with defaults for anything missing). */
export function toPurposeContent(doc: StoredPurpose): PurposeContent {
  return {
    purposeStatement: doc?.purposeStatement ?? "",
    coreValues: [...(doc?.coreValues ?? [])],
    longTermGoals: (doc?.longTermGoals ?? []).map((g) => ({ title: g.title, why: g.why ?? "" })),
  };
}

/** True when nothing has been written yet. */
export const isEmptyPurpose = (p: PurposeContent) =>
  p.purposeStatement.trim() === "" && p.coreValues.length === 0 && p.longTermGoals.length === 0;

/** True when the statement, values or goals differ (ignoring surrounding spaces). */
export function purposeChanged(a: PurposeContent, b: PurposeContent): boolean {
  const norm = (p: PurposeContent) =>
    JSON.stringify([p.purposeStatement.trim(), p.coreValues, p.longTermGoals.map((g) => [g.title.trim(), g.why.trim()])]);
  return norm(a) !== norm(b);
}

export type PurposeVersion = { statement: string; coreValues: string[]; goals: string; savedAt: Date; replacedAt: Date };

/**
 * When a save changes the purpose, the version it replaces (statement and goals encrypted), dated
 * when that version was saved. Null when nothing changed or nothing had been saved before.
 */
export function previousVersion(crypto: FieldCrypto, previous: StoredPurpose, next: PurposeContent, now: Date): PurposeVersion | null {
  const before = toPurposeContent(previous);
  if (isEmptyPurpose(before) || !purposeChanged(before, next)) return null;
  return {
    statement: crypto.encrypt(before.purposeStatement.trim()),
    coreValues: before.coreValues,
    goals: crypto.encrypt(JSON.stringify(before.longTermGoals)),
    savedAt: previous?.updatedAt ? new Date(previous.updatedAt) : now,
    replacedAt: now,
  };
}

export type OpenedVersion = { statement: string; coreValues: string[]; goals: Goal[]; savedAt: string };

function openGoals(crypto: FieldCrypto, stored: string | null | undefined): Goal[] {
  const json = crypto.tryDecrypt(stored);
  if (!json) return [];
  try {
    const goals = JSON.parse(json) as unknown;
    return Array.isArray(goals)
      ? goals.map((g: { title?: unknown; why?: unknown }) => ({ title: String(g.title ?? ""), why: String(g.why ?? "") }))
      : [];
  } catch {
    return [];
  }
}

/** Earlier versions for the API: decrypted, newest first. Older entries have no goals. */
export function openHistory(
  crypto: FieldCrypto,
  history: { statement: string; coreValues?: string[] | null; goals?: string | null; savedAt: Date | string }[],
): OpenedVersion[] {
  return [...history]
    .map((h) => ({
      statement: crypto.tryDecrypt(h.statement) ?? "",
      coreValues: [...(h.coreValues ?? [])],
      goals: openGoals(crypto, h.goals),
      savedAt: new Date(h.savedAt).toISOString(),
    }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

// ---------- The "Daily purposes" list ----------

/**
 * The dates GET /api/purpose/days covers: from the journey start (or `from`, if later) up to and
 * including today, all as Asia/Colombo "YYYY-MM-DD" strings. `to` can't go past today.
 * Without `from`, the last 30 days.
 */
export function purposeDaysRange(
  query: { from?: string; to?: string },
  start: string,
  today: string,
): { from: string; to: string } {
  const to = query.to && query.to < today ? query.to : today;
  const wanted = query.from ?? addDays(to, -29);
  return { from: wanted < start ? start : wanted, to };
}

export type PurposeList<T> = {
  /** Today's purpose, shown first (editable until midnight); null when today has none */
  today: T | null;
  /** Earlier days, newest first (locked) */
  past: T[];
  /** Only when there are no daily purposes at all */
  isEmpty: boolean;
  /** "Set today's purpose" is offered only while today has none */
  canSetToday: boolean;
};

/** Splits the list into today and past days. Days after today are ignored. */
export function splitPurposeDays<T extends { date: string }>(days: T[], today: string): PurposeList<T> {
  const todays = days.find((d) => d.date === today) ?? null;
  const past = days.filter((d) => d.date < today).sort((a, b) => b.date.localeCompare(a.date));
  return { today: todays, past, isEmpty: todays === null && past.length === 0, canSetToday: todays === null };
}

// ---------- Stats ----------

export type PurposeStats = {
  daysWithPurpose: number;
  /** All purposes across the days */
  purposesTotal: number;
  /** Across every purpose with an intensity; 1 decimal, null without any */
  avgIntensity: number | null;
  /** Most-chosen focus values (counted once per day), most first (ties alphabetical), up to 3 */
  topValues: { value: string; days: number }[];
};

export function purposeStats(days: (DayPurposes | null)[]): PurposeStats {
  const set = days.filter((d): d is DayPurposes => !!d && d.purposes.length > 0);
  const purposes = set.flatMap((d) => d.purposes);
  const counts = new Map<string, number>();
  for (const d of set) for (const v of new Set(d.purposes.flatMap((p) => p.focusValues))) counts.set(v, (counts.get(v) ?? 0) + 1);

  return {
    daysWithPurpose: set.length,
    purposesTotal: purposes.length,
    avgIntensity: average(intensitiesOf(purposes)),
    topValues: [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([value, n]) => ({ value, days: n })),
  };
}

// ---------- Recurring purposes and suggestions ----------

/** The same wording, ignoring case and extra spaces: "  Be  patient " and "be patient" match. */
export const normalizePurpose = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

export type RecurringPurpose = {
  /** The most recent wording */
  text: string;
  /** Days it appeared on */
  count: number;
  /** 1 decimal, null when none of its days had an intensity */
  avgIntensity: number | null;
  lastDate: string;
  /** Its intensity on each of the last 30 days (oldest first), null on days it didn't appear */
  last30: (number | null)[];
};

/**
 * What matters to you again and again: the days' purposes grouped by their normalized text, with
 * how many days each appeared, its average intensity and its last 30 days ending on `today`.
 * Most frequent first (then most recent). Purposes without text are left out.
 */
export function recurringPurposes(days: (DayPurposes & { date: string })[], today: string): RecurringPurpose[] {
  const groups = new Map<string, { text: string; lastDate: string; byDate: Map<string, number | null> }>();
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const p of day.purposes) {
      const key = normalizePurpose(p.text);
      if (!key) continue;
      const wording = p.text.trim().replace(/\s+/g, " ");
      const group = groups.get(key) ?? { text: wording, lastDate: day.date, byDate: new Map() };
      // Days are oldest first, so the latest wording wins (extra spaces tidied, your capitals kept)
      group.text = wording;
      group.lastDate = day.date;
      // The same thing twice in one day counts once, at its stronger intensity
      const before = group.byDate.get(day.date);
      const value = p.intensity ?? null;
      group.byDate.set(day.date, before === undefined || before === null ? value : value === null ? before : Math.max(before, value));
      groups.set(key, group);
    }
  }
  const window = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  return [...groups.values()]
    .map((g) => ({
      text: g.text,
      count: g.byDate.size,
      avgIntensity: average([...g.byDate.values()].filter((v): v is number => v !== null)),
      lastDate: g.lastDate,
      last30: window.map((d) => g.byDate.get(d) ?? null),
    }))
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate) || a.text.localeCompare(b.text));
}

/** Wordings you've used before, to reuse while typing: one per normalized text, most used first (then most recent). */
export function purposeSuggestions(days: (DayPurposes & { date: string })[], limit = 50): string[] {
  return recurringPurposes(days, days.map((d) => d.date).sort().at(-1) ?? "1970-01-01")
    .slice(0, limit)
    .map((r) => r.text);
}

/** The suggestions that match what's typed so far (ignoring case and extra spaces), leaving out an exact match. */
export function matchSuggestions(suggestions: string[], typed: string, limit = 5): string[] {
  const q = normalizePurpose(typed);
  if (!q) return [];
  return suggestions.filter((s) => normalizePurpose(s).includes(q) && normalizePurpose(s) !== q).slice(0, limit);
}

// ---------- AI ----------

/**
 * What the AI may know about a day's purposes: how many, and the intensity numbers. Never a
 * purpose's text, the evening note or the focus value words.
 */
export function purposeFacts(d: DayPurposes | null) {
  if (!d || d.purposes.length === 0) return { set: false };
  const { purposes, intensities, avgIntensity } = daySummary(d);
  return { set: true, purposes, intensities, avgIntensity };
}

/** Every user-written purpose text, for the crisis check only (never sent anywhere). */
export const purposeText = (d: DayPurposes | null): string[] =>
  d ? [...d.purposes.map((p) => p.text), d.reflectionNote] : [];
