// Today's purpose ("What do I want today to be about?"), its intentions and the evening reflection.
// Pure functions: the encrypter is passed in, so they can be tested with a test key.
//
// Stored: the purpose text, each intention's text and the reflection note are encrypted.
// focusValues (words from the user's core values), done flags, times and the rating are not.
import type { FieldCrypto } from "./crypto";
import { addDays } from "./dates";

export type StoredDailyPurpose = {
  text?: string | null;
  focusValues?: string[] | null;
  intentions?: { _id?: unknown; text: string; done?: boolean | null; doneAt?: Date | string | null }[] | null;
  reflection?: { rating: number; note?: string | null; at: Date | string } | null;
  setAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type DailyPurpose = {
  text: string;
  focusValues: string[];
  intentions: { id: string; text: string; done: boolean; doneAt: string | null }[];
  reflection: { rating: number; note: string; at: string } | null;
  setAt: string | null;
  updatedAt: string | null;
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** The stored form of some text: encrypted, or undefined when empty. */
export function sealText(crypto: FieldCrypto, text: string | null | undefined): string | undefined {
  const trimmed = (text ?? "").trim();
  return trimmed ? crypto.encrypt(trimmed) : undefined;
}

/** For the API: everything decrypted. Text that can't be decrypted (wrong key) shows as empty. */
export function openDailyPurpose(crypto: FieldCrypto, stored: StoredDailyPurpose | null | undefined): DailyPurpose | null {
  if (!stored) return null;
  const open = (value: string | null | undefined) => (value ? (crypto.tryDecrypt(value) ?? "") : "");
  return {
    text: open(stored.text),
    focusValues: [...(stored.focusValues ?? [])],
    intentions: (stored.intentions ?? []).map((i) => ({
      id: String(i._id),
      text: open(i.text),
      done: Boolean(i.done),
      doneAt: iso(i.doneAt),
    })),
    reflection: stored.reflection
      ? { rating: stored.reflection.rating, note: open(stored.reflection.note), at: iso(stored.reflection.at)! }
      : null,
    setAt: iso(stored.setAt),
    updatedAt: iso(stored.updatedAt),
  };
}

/** True when the day has anything purpose-related worth showing. */
export function hasDailyPurpose(p: DailyPurpose | null): p is DailyPurpose {
  return !!p && (p.text.trim() !== "" || p.focusValues.length > 0 || p.intentions.length > 0 || p.reflection !== null);
}

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

export const MAX_INTENTIONS = 5;

/** A day holds up to 5 intentions. */
export const canAddIntention = (count: number) => count < MAX_INTENTIONS;

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
  intentionsTotal: number;
  intentionsDone: number;
  /** Whole-number percent, null without intentions */
  intentionsDonePercent: number | null;
  /** 1 decimal, null without reflections */
  avgRating: number | null;
  /** Most-chosen focus values, most first (ties alphabetical), up to 3 */
  topValues: { value: string; days: number }[];
};

export function purposeStats(days: (DailyPurpose | null)[]): PurposeStats {
  const set = days.filter(hasDailyPurpose);
  const intentions = set.flatMap((d) => d.intentions);
  const done = intentions.filter((i) => i.done).length;
  const ratings = set.flatMap((d) => (d.reflection ? [d.reflection.rating] : []));
  const counts = new Map<string, number>();
  for (const d of set) for (const v of new Set(d.focusValues)) counts.set(v, (counts.get(v) ?? 0) + 1);

  return {
    daysWithPurpose: set.length,
    intentionsTotal: intentions.length,
    intentionsDone: done,
    intentionsDonePercent: intentions.length ? Math.round((done / intentions.length) * 100) : null,
    avgRating: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
    topValues: [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([value, n]) => ({ value, days: n })),
  };
}

// ---------- AI ----------

/**
 * What the AI may know about a day's purpose: whether one was set, how many intentions and how
 * many done, the rating, and the chosen value words (only words the AI may see: `safeValue`
 * turns anything else into "other value"). Never the purpose text, intention text or notes.
 */
export function purposeFacts(p: DailyPurpose | null, safeValue: (value: string) => string) {
  if (!hasDailyPurpose(p)) return { set: false };
  return {
    set: true,
    intentions: p.intentions.length,
    intentionsDone: p.intentions.filter((i) => i.done).length,
    rating: p.reflection?.rating ?? null,
    focusValues: [...new Set(p.focusValues.map(safeValue))],
  };
}

/** Every user-written purpose text, for the crisis check only (never sent anywhere). */
export const purposeText = (p: DailyPurpose | null): string[] =>
  p ? [p.text, ...p.intentions.map((i) => i.text), p.reflection?.note ?? ""] : [];
