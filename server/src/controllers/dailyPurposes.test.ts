/// <reference types="vitest/globals" />
// Several purposes a day, end to end against a real (in-memory) MongoDB: up to 5 purposes, each with
// its own intentions and rating, one evening note, the midnight lock on every write route, text
// encrypted at rest, and the migration from the older single purpose.
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

  it("adds purposes with focus values, up to 5, and refuses a 6th kindly", async () => {
    const res = await h.request("POST", `${base()}/purposes`, { text: "Be present with family", focusValues: ["family"] });
    expect(res.status).toBe(201);
    expect(res.body.entry.dailyPurposes).toHaveLength(1);
    expect(res.body.entry.dailyPurposes[0]).toMatchObject({ text: "Be present with family", focusValues: ["Family"], intentions: [], rating: null });
    first = res.body.entry.dailyPurposes[0].id;

    for (const text of ["Finish the report calmly", "Move my body", "Rest well", "Learn one thing"]) {
      expect((await h.request("POST", `${base()}/purposes`, { text })).status).toBe(201);
    }
    const sixth = await h.request("POST", `${base()}/purposes`, { text: "One too many" });
    expect(sixth.status).toBe(400);
    expect(sixth.body.message).toMatch(/5 purposes/);
    expect((await h.request("GET", base())).body.entry.dailyPurposes).toHaveLength(5);
  });

  it("only takes focus values from the core values", async () => {
    const res = await h.request("PATCH", `${base()}/purposes/${first}`, { focusValues: ["Courage"] });
    expect(res.status).toBe(400);
  });

  it("edits text, focus values and the rating of one purpose only", async () => {
    const res = await h.request("PATCH", `${base()}/purposes/${first}`, { text: "Be fully present with family", focusValues: ["Family", "Health"], rating: 4 });
    expect(res.status).toBe(200);
    const [p, second] = res.body.entry.dailyPurposes;
    expect(p).toMatchObject({ text: "Be fully present with family", focusValues: ["Family", "Health"], rating: 4 });
    expect(second.rating).toBeNull();
    const cleared = await h.request("PATCH", `${base()}/purposes/${first}`, { rating: null });
    expect(cleared.body.entry.dailyPurposes[0].rating).toBeNull();
    expect((await h.request("PATCH", `${base()}/purposes/${first}`, { rating: 6 })).status).toBe(400);
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
    expect(res.body.stats).toMatchObject({ daysWithPurpose: 1, purposesTotal: 5, intentionsTotal: 5, intentionsDone: 1 });
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
    ["POST", `/api/entries/${date}/purposes`, { text: "Late purpose" }],
    ["PATCH", `/api/entries/${date}/purposes/${pid}`, { rating: 5 }],
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
        rating: 4,
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      },
    ]);
    expect(day.dailyReflectionNote).toBe("Mostly patient");
  });
});
