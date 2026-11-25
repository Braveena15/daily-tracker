// The day's purposes ("What do I want today to be about?"): up to 5 a day, each with its own focus
// values, up to 5 intentions and an evening rating, plus one evening note for the whole day.
// Pure functions: the encrypter is passed in, so they can be tested with a test key.
//
// Stored: each purpose's text, each intention's text and the evening note are encrypted.
// focusValues (words from the user's core values), done flags, times and ratings are not.
import type { FieldCrypto } from "./crypto";
import { addDays } from "./dates";

type StoredDate = Date | string | null | undefined;

export type StoredIntention = { _id?: unknown; text: string; done?: boolean | null; doneAt?: StoredDate };

export type StoredDayPurpose = {
  _id?: unknown;
  text?: string | null;
  focusValues?: string[] | null;
  intentions?: StoredIntention[] | null;
  rating?: number | null;
  createdAt?: StoredDate;
  updatedAt?: StoredDate;
};

/** The purpose fields of a stored DailyEntry */
export type StoredDayPurposes = {
  dailyPurposes?: StoredDayPurpose[] | null;
  dailyReflectionNote?: string | null;
};

export type Intention = { id: string; text: string; done: boolean; doneAt: string | null };

export type DayPurpose = {
  id: string;
  text: string;
  focusValues: string[];
  intentions: Intention[];
  /** "How well did I live this purpose today?" 1–5, null until rated */
  rating: number | null;
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

/** A day holds up to 5 purposes, and each purpose up to 5 intentions. */
export const MAX_PURPOSES = 5;
export const MAX_INTENTIONS = 5;
export const canAddPurpose = (count: number) => count < MAX_PURPOSES;
export const canAddIntention = (count: number) => count < MAX_INTENTIONS;

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
      intentions: (p.intentions ?? []).map((i) => ({ id: String(i._id), text: open(i.text), done: Boolean(i.done), doneAt: iso(i.doneAt) })),
      rating: typeof p.rating === "number" ? p.rating : null,
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
    })),
    reflectionNote: open(stored?.dailyReflectionNote),
  };
}

/** True when the day has anything purpose-related worth showing. */
export const hasDayPurposes = (d: DayPurposes | null | undefined): d is DayPurposes =>
  !!d && (d.purposes.length > 0 || d.reflectionNote.trim() !== "");

/** "3 purposes · 5 of 8 intentions done": the counts behind every summary. */
export function daySummary(d: DayPurposes) {
  const intentions = d.purposes.flatMap((p) => p.intentions);
  const ratings = d.purposes.flatMap((p) => (p.rating === null ? [] : [p.rating]));
  return {
    purposes: d.purposes.length,
    intentions: intentions.length,
    intentionsDone: intentions.filter((i) => i.done).length,
    ratings,
    /** 1 decimal, null without ratings */
    avgRating: average(ratings),
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
  intentionsTotal: number;
  intentionsDone: number;
  /** Whole-number percent, null without intentions */
  intentionsDonePercent: number | null;
  /** Across every rated purpose; 1 decimal, null without ratings */
  avgRating: number | null;
  /** Most-chosen focus values (counted once per day), most first (ties alphabetical), up to 3 */
  topValues: { value: string; days: number }[];
};

export function purposeStats(days: (DayPurposes | null)[]): PurposeStats {
  const set = days.filter((d): d is DayPurposes => !!d && d.purposes.length > 0);
  const purposes = set.flatMap((d) => d.purposes);
  const intentions = purposes.flatMap((p) => p.intentions);
  const done = intentions.filter((i) => i.done).length;
  const ratings = purposes.flatMap((p) => (p.rating === null ? [] : [p.rating]));
  const counts = new Map<string, number>();
  for (const d of set) for (const v of new Set(d.purposes.flatMap((p) => p.focusValues))) counts.set(v, (counts.get(v) ?? 0) + 1);

  return {
    daysWithPurpose: set.length,
    purposesTotal: purposes.length,
    intentionsTotal: intentions.length,
    intentionsDone: done,
    intentionsDonePercent: intentions.length ? Math.round((done / intentions.length) * 100) : null,
    avgRating: average(ratings),
    topValues: [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([value, n]) => ({ value, days: n })),
  };
}

// ---------- AI ----------

/**
 * What the AI may know about a day's purposes: how many, how many intentions and how many done,
 * the ratings, and the chosen value words (only words the AI may see: `safeValue` turns anything
 * else into "other value"). Never a purpose's text, an intention's text or the evening note.
 */
export function purposeFacts(d: DayPurposes | null, safeValue: (value: string) => string) {
  if (!d || d.purposes.length === 0) return { set: false };
  const { purposes, intentions, intentionsDone, ratings, avgRating } = daySummary(d);
  return {
    set: true,
    purposes,
    intentions,
    intentionsDone,
    ratings,
    avgRating,
    focusValues: [...new Set(d.purposes.flatMap((p) => p.focusValues).map(safeValue))],
  };
}

/** Every user-written purpose text, for the crisis check only (never sent anywhere). */
export const purposeText = (d: DayPurposes | null): string[] =>
  d ? [...d.purposes.flatMap((p) => [p.text, ...p.intentions.map((i) => i.text)]), d.reflectionNote] : [];
