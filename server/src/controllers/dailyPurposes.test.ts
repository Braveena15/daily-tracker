/// <reference types="vitest/globals" />
// "What matters to me today", end to end against a real (in-memory) MongoDB: up to 5 purposes, each
// with an intensity (0–10) and its own intentions, one evening note, the midnight lock on every write
// route, text encrypted at rest, suggestions, recurring purposes, and the migrations from older data.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";
import { addDays } from "../utils/dates";

let h: Harness;
let today: string;
let userId: mongoose.Types.ObjectId;

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  const res = await h.request("POST", "/api/auth/register", { name: "Sam", email: "purposes@example.com", password: "password-123" });
  expect(res.status).toBe(201);
  userId = new mongoose.Types.ObjectId(String(res.body.user.id));
  today = (await h.request("GET", "/api/entries/today")).body.date;
  expect((await h.request("PUT", "/api/purpose", { purposeStatement: "Live kindly", coreValues: ["Family", "Health", "Growth"], longTermGoals: [] })).status).toBe(200);
}, 120_000);

afterAll(async () => {
  vi.useRealTimers();
  await h?.stop();
});

const entries = () => mongoose.connection.db!.collection("dailyentries");
const base = () => `/api/entries/${today}`;

describe("today's purposes", () => {
  let first: string;

  it("needs an intensity from 0 to 10 when adding", async () => {
    const missing = await h.request("POST", `${base()}/purposes`, { text: "Be present with family" });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe("Choose how strongly you feel this (0–10)");
    for (const intensity of [-1, 11, 7.5, "8"]) {
      expect((await h.request("POST", `${base()}/purposes`, { text: "Be present", intensity })).status, String(intensity)).toBe(400);
    }
    // There's no rating any more
    expect((await h.request("POST", `${base()}/purposes`, { text: "Be present", intensity: 5, rating: 4 })).status).toBe(400);
  });

  it("adds purposes with an intensity and focus values, up to 5, and refuses a 6th kindly", async () => {
    const res = await h.request("POST", `${base()}/purposes`, { text: "Be present with family", intensity: 8, focusValues: ["family"] });
    expect(res.status).toBe(201);
    expect(res.body.entry.dailyPurposes).toHaveLength(1);
    expect(res.body.entry.dailyPurposes[0]).toMatchObject({ text: "Be present with family", intensity: 8, focusValues: ["Family"], intentions: [] });
    expect(res.body.entry.dailyPurposes[0]).not.toHaveProperty("rating");
    first = res.body.entry.dailyPurposes[0].id;

    for (const [text, intensity] of [["Finish the report calmly", 6], ["Move my body", 0], ["Rest well", 10], ["Learn one thing", 5]] as const) {
      expect((await h.request("POST", `${base()}/purposes`, { text, intensity })).status).toBe(201);
    }
    const sixth = await h.request("POST", `${base()}/purposes`, { text: "One too many", intensity: 5 });
    expect(sixth.status).toBe(400);
    expect(sixth.body.message).toMatch(/5 purposes/);
    expect((await h.request("GET", base())).body.entry.dailyPurposes).toHaveLength(5);
  });

  it("only takes focus values from the core values", async () => {
    const res = await h.request("PATCH", `${base()}/purposes/${first}`, { focusValues: ["Courage"] });
    expect(res.status).toBe(400);
  });

  it("edits the text, intensity and focus values of one purpose only — and has no rating", async () => {
    const res = await h.request("PATCH", `${base()}/purposes/${first}`, { text: "Be fully present with family", intensity: 9, focusValues: ["Family", "Health"] });
    expect(res.status).toBe(200);
    const [p, second] = res.body.entry.dailyPurposes;
    expect(p).toMatchObject({ text: "Be fully present with family", intensity: 9, focusValues: ["Family", "Health"] });
    expect(second.intensity).toBe(6);
    expect((await h.request("PATCH", `${base()}/purposes/${first}`, { intensity: 11 })).status).toBe(400);
    expect((await h.request("PATCH", `${base()}/purposes/${first}`, { intensity: null })).status).toBe(400);
    expect((await h.request("PATCH", `${base()}/purposes/${first}`, { rating: 4 })).status).toBe(400);
  });

  it("keeps each purpose's intentions apart, up to 5 per purpose", async () => {
    const day = (await h.request("GET", base())).body.entry;
    const second = day.dailyPurposes[1].id;

    for (const text of ["Call Amma", "Dinner without phones", "Read a story", "Walk together", "Say thank you"]) {
      expect((await h.request("POST", `${base()}/purposes/${first}/intentions`, { text })).status).toBe(201);
    }
    const sixth = await h.request("POST", `${base()}/purposes/${first}/intentions`, { text: "One more" });
    expect(sixth.status).toBe(400);
    // The other purpose still has room
    const other = await h.request("POST", `${base()}/purposes/${second}/intentions`, { text: "Outline section 2" });
    expect(other.status).toBe(201);
    const [p1, p2] = other.body.entry.dailyPurposes;
    expect(p1.intentions).toHaveLength(5);
    expect(p2.intentions.map((i: { text: string }) => i.text)).toEqual(["Outline section 2"]);

    // Ticking one intention touches only that one
    const iid = p1.intentions[0].id;
    const ticked = await h.request("PATCH", `${base()}/purposes/${first}/intentions/${iid}`, { done: true });
    expect(ticked.status).toBe(200);
    expect(ticked.body.entry.dailyPurposes[0].intentions[0]).toMatchObject({ done: true, doneAt: expect.any(String) });
    expect(ticked.body.entry.dailyPurposes[0].intentions[1].done).toBe(false);

    // An intention can't be reached through another purpose
    expect((await h.request("PATCH", `${base()}/purposes/${second}/intentions/${iid}`, { done: false })).status).toBe(404);
    expect((await h.request("DELETE", `${base()}/purposes/${second}/intentions/${iid}`)).status).toBe(404);

    const removed = await h.request("DELETE", `${base()}/purposes/${first}/intentions/${p1.intentions[4].id}`);
    expect(removed.body.entry.dailyPurposes[0].intentions).toHaveLength(4);
  });

  it("saves one evening note for the day, and clears it when empty", async () => {
    const res = await h.request("PUT", `${base()}/reflection-note`, { note: "A calm, good day" });
    expect(res.status).toBe(200);
    expect(res.body.entry.dailyReflectionNote).toBe("A calm, good day");
    expect((await h.request("PUT", `${base()}/reflection-note`, { note: "x".repeat(1001) })).status).toBe(400);
  });

  it("stores every text encrypted and returns it decrypted", async () => {
    const raw = await entries().findOne({ userId, date: today });
    const json = JSON.stringify(raw);
    expect(json).not.toMatch(/present with|the report|Call Amma|without phones|calm, good/);
    expect(raw!.dailyPurposes[0].focusValues).toEqual(["Family", "Health"]); // value words aren't secret
    const day = (await h.request("GET", base())).body.entry;
    expect(day.dailyPurposes[0].text).toBe("Be fully present with family");
    expect(day.dailyPurposes[0].intentions[0].text).toBe("Call Amma");
    expect(day.dailyReflectionNote).toBe("A calm, good day");
    expect(day).not.toHaveProperty("dailyPurpose");
  });

  it("lists every purpose of the day in GET /api/purpose/days, with stats across them", async () => {
    const res = await h.request("GET", "/api/purpose/days");
    expect(res.status).toBe(200);
    expect(res.body.today.purposes).toHaveLength(5);
    expect(res.body.today.reflectionNote).toBe("A calm, good day");
    expect(res.body.stats).toMatchObject({ daysWithPurpose: 1, purposesTotal: 5, intentionsTotal: 5, intentionsDone: 1, avgIntensity: 6 });
    // (9 + 6 + 0 + 10 + 5) / 5 = 6, and every purpose shows up once as a recurring one
    expect(res.body.recurring).toHaveLength(5);
    expect(res.body.recurring[0]).toMatchObject({ count: 1 });
  });

  it("shows the first 3 of today's purposes on Lift me up", async () => {
    const res = await h.request("GET", "/api/lift-me-up");
    expect(res.body.todayPurposes).toHaveLength(3);
    expect(res.body.todayPurposeCount).toBe(5);
  });

  it("deletes one purpose with its intentions", async () => {
    const res = await h.request("DELETE", `${base()}/purposes/${first}`);
    expect(res.status).toBe(200);
    expect(res.body.entry.dailyPurposes).toHaveLength(4);
    expect(res.body.entry.dailyPurposes.some((p: { id: string }) => p.id === first)).toBe(false);
    expect((await h.request("DELETE", `${base()}/purposes/${first}`)).status).toBe(404);
    expect((await h.request("PATCH", `${base()}/purposes/not-an-id`, { rating: 3 })).status).toBe(404);
  });
});

describe("the midnight lock", () => {
  const writes = (date: string, pid: string, iid: string): [string, string, unknown?][] => [
    ["POST", `/api/entries/${date}/purposes`, { text: "Late purpose", intensity: 5 }],
    ["PATCH", `/api/entries/${date}/purposes/${pid}`, { intensity: 7 }],
    ["DELETE", `/api/entries/${date}/purposes/${pid}`],
    ["POST", `/api/entries/${date}/purposes/${pid}/intentions`, { text: "Late intention" }],
    ["PATCH", `/api/entries/${date}/purposes/${pid}/intentions/${iid}`, { done: true }],
    ["DELETE", `/api/entries/${date}/purposes/${pid}/intentions/${iid}`],
    ["PUT", `/api/entries/${date}/reflection-note`, { note: "Late note" }],
  ];

  it("locks every write route once the day has ended, and refuses future days", async () => {
    const id = new mongoose.Types.ObjectId().toHexString();
    for (const [method, path, body] of writes(addDays(today, -1), id, id)) {
      const res = await h.request(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.message).toMatch(/locked/);
    }
    for (const [method, path, body] of writes(addDays(today, 1), id, id)) {
      expect((await h.request(method, path, body)).status, `${method} ${path}`).toBe(400);
    }
  });

  it("locks today's purposes after midnight (Asia/Colombo)", async () => {
    const day = (await h.request("GET", base())).body.entry;
    const p = day.dailyPurposes.find((x: { intentions: unknown[] }) => x.intentions.length > 0);
    const iid = p.intentions[0].id;

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${addDays(today, 1)}T00:01:00+05:30`));
    try {
      for (const [method, path, body] of writes(today, p.id, iid)) {
        expect((await h.request(method, path, body)).status, `${method} ${path}`).toBe(403);
      }
      // Still readable, unchanged
      const after = (await h.request("GET", base())).body.entry;
      expect(after.dailyPurposes).toHaveLength(day.dailyPurposes.length);
      expect(after.dailyReflectionNote).toBe("A calm, good day");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("migration from one purpose a day", () => {
  it("moves the old purpose, its intentions, rating and note — and is safe to run twice", async () => {
    const { fieldCrypto } = await import("../config/encryption");
    const { migrateDailyPurposes } = await import("../services/migrations");
    const date = addDays(today, -3);
    const at = new Date(`${date}T07:00:00+05:30`);
    await entries().insertOne({
      userId,
      date,
      moodLogs: [],
      dailyPurpose: {
        text: fieldCrypto.encrypt("Be patient"),
        focusValues: ["Family"],
        intentions: [{ _id: new mongoose.Types.ObjectId(), text: fieldCrypto.encrypt("Breathe first"), done: true, doneAt: at }],
        reflection: { rating: 4, note: fieldCrypto.encrypt("Mostly patient"), at },
        setAt: at,
        updatedAt: at,
      },
      createdAt: at,
      updatedAt: at,
    });

    const first = await migrateDailyPurposes();
    expect(first).toEqual({ scanned: 1, days: 1, purposes: 1, intentions: 1, ratings: 1, notes: 1 });
    expect((await entries().findOne({ userId, date }))!.dailyPurposes[0]).toMatchObject({ legacyRating: 4 });
    const second = await migrateDailyPurposes();
    expect(second).toEqual({ scanned: 0, days: 0, purposes: 0, intentions: 0, ratings: 0, notes: 0 });

    const raw = await entries().findOne({ userId, date });
    expect(raw).not.toHaveProperty("dailyPurpose");
    expect(JSON.stringify(raw)).not.toMatch(/Be patient|Breathe first|Mostly/);

    const day = (await h.request("GET", `/api/entries/${date}`)).body.entry;
    expect(day.dailyPurposes).toEqual([
      {
        id: expect.any(String),
        text: "Be patient",
        focusValues: ["Family"],
        intentions: [{ id: expect.any(String), text: "Breathe first", done: true, doneAt: at.toISOString() }],
        // The old rating is kept (as legacyRating) but never shown; older purposes have no intensity
        intensity: null,
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      },
    ]);
    expect(day.dailyReflectionNote).toBe("Mostly patient");
  });
});

describe("suggestions and recurring purposes", () => {
  it("suggests wordings used on earlier days, one per text ignoring case and spaces, most used first", async () => {
    const { fieldCrypto } = await import("../config/encryption");
    const purpose = (text: string, intensity: number | null) => ({
      _id: new mongoose.Types.ObjectId(),
      text: fieldCrypto.encrypt(text),
      ...(intensity !== null && { intensity }),
      focusValues: [],
      intentions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // The days list starts at the journey start; begin it a month ago so these earlier days count
    await h.request("PUT", "/api/profile", { journeyStartDate: addDays(today, -30) });
    // Two earlier days: "Be patient" twice (written differently), "Walk outside" once. The migration
    // test above also left "Be patient" (no intensity) three days ago, which is the latest wording.
    await entries().insertMany([
      { userId, date: addDays(today, -5), dailyPurposes: [purpose("Be patient", 6), purpose("Walk outside", 4)] },
      { userId, date: addDays(today, -4), dailyPurposes: [purpose("  be   PATIENT ", 8)] },
    ]);

    const res = await h.request("GET", "/api/purpose/suggestions");
    expect(res.status).toBe(200);
    expect(res.body.suggestions[0]).toBe("Be patient");
    expect(res.body.suggestions).toContain("Walk outside");
    expect(res.body.suggestions.filter((t: string) => t.toLowerCase() === "be patient")).toHaveLength(1);
    // Stored text stays encrypted
    expect(JSON.stringify(await entries().findOne({ userId, date: addDays(today, -4) }))).not.toMatch(/PATIENT/);
  });

  it("groups recurring purposes by their wording, with times, average intensity and the last 30 days", async () => {
    const res = await h.request("GET", "/api/purpose/days");
    const patient = res.body.recurring.find((r: { text: string }) => r.text.toLowerCase().includes("patient"));
    // Days −5 (6), −4 (8) and −3 (from before intensity existed: no number)
    expect(patient).toMatchObject({ text: "Be patient", count: 3, avgIntensity: 7, lastDate: addDays(today, -3) });
    expect(patient.last30).toHaveLength(30);
    expect(patient.last30.slice(-6, -3)).toEqual([6, 8, null]);
    expect(patient.last30.at(-1)).toBeNull();
    expect(res.body.recurring[0].count).toBeGreaterThanOrEqual(res.body.recurring.at(-1).count);
  });

  it("migrates old evening ratings to legacyRating, safely twice", async () => {
    const { migratePurposeRatings } = await import("../services/migrations");
    const date = addDays(today, -8);
    await entries().insertOne({ userId, date, dailyPurposes: [{ _id: new mongoose.Types.ObjectId(), text: "x", rating: 3, focusValues: [], intentions: [] }] });
    expect(await migratePurposeRatings()).toMatchObject({ days: 1, ratings: 1 });
    expect(await migratePurposeRatings()).toEqual({ days: 0, ratings: 0 });
    const stored = (await entries().findOne({ userId, date }))!.dailyPurposes[0];
    expect(stored).toMatchObject({ legacyRating: 3 });
    expect(stored).not.toHaveProperty("rating");
    const day = (await h.request("GET", `/api/entries/${date}`)).body.entry.dailyPurposes[0];
    expect(day.intensity).toBeNull();
    expect(day).not.toHaveProperty("legacyRating");
  });
});
