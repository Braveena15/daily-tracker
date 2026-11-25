/// <reference types="vitest/globals" />
// The public demo (DEMO_MODE=true), end to end against a real (in-memory) MongoDB:
// "Try the demo" seeds a temporary account, everything expires with it, the restricted features are
// refused, and the AI is never called.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";

// If anything tried to create a Gemini client or call it, these would record it
const gemini = vi.hoisted(() => ({ generate: vi.fn(async () => "AI text"), create: vi.fn() }));
vi.mock("../ai/gemini", () => ({
  createGemini: (...args: unknown[]) => {
    gemini.create(...args);
    return gemini.generate;
  },
}));

const REPO = "https://github.com/example/daily-tracker";
const HOUR = 3_600_000;
let h: Harness;
let models: typeof import("./setup");

beforeAll(async () => {
  // A Gemini key and open registration are set on purpose: demo mode must ignore both
  h = await startHarness({ DEMO_MODE: "true", DEMO_REPO_URL: REPO, GEMINI_API_KEY: "must-not-be-used", ALLOW_REGISTRATION: "true" });
  models = await import("./setup");
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

const db = () => mongoose.connection.db!;
let demoUserId: mongoose.Types.ObjectId;
let demoCookie: string;
let expiresAt: Date;

describe("demo mode", () => {
  it("tells the pages the demo is on and keeps normal registration closed", async () => {
    expect((await h.request("GET", "/api/demo/config")).body).toEqual({ enabled: true, repoUrl: REPO, ttlHours: 24 });
    const register = await h.request("POST", "/api/auth/register", { name: "A", email: "a@example.com", password: "password-123" });
    expect(register.status).toBe(403);
  });

  it("starts a demo: a new temporary account with ~60 days of sample data, logged in", async () => {
    const before = Date.now();
    const res = await h.request("POST", "/api/demo/start");
    expect(res.status).toBe(201);
    expect(res.cookie).toMatch(/^token=/);
    const { user } = res.body;
    expect(user.isDemo).toBe(true);
    expect(user.email).toMatch(/^explorer-[0-9a-f]{12}@demo\.invalid$/);
    expect(user.name).toMatch(/\w+ \w+/);
    expiresAt = new Date(user.expiresAt);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * HOUR - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * HOUR);
    demoUserId = new mongoose.Types.ObjectId(user.id as string);
    demoCookie = res.cookie!;

    // Logged in: the visitor's own data comes back through the normal API
    expect((await h.request("GET", "/api/auth/me")).body.user.id).toBe(user.id);
    const mine = { userId: demoUserId };
    const entries = await db().collection("dailyentries").find(mine).toArray();
    expect(entries.length).toBeGreaterThan(40);
    expect(entries.some((e) => e.moodLogs.length > 1)).toBe(true);
    expect(entries.some((e) => e.workouts.length > 0)).toBe(true);
    expect(entries.every((e) => e.waterLogs.length > 0)).toBe(true);
    expect(entries.every((e) => e.sleep?.score >= 0 && e.sleep.deepMin > 0 && e.sleep.remMin > 0 && e.sleep.breakdown.length === 3)).toBe(true);
    expect(entries.some((e) => (e.healthSnapshots ?? []).length > 0)).toBe(false);
    expect(entries.every((e) => e.sleepHoursSource === "watch")).toBe(true);
    expect(entries.some((e) => e.goodThings.length > 0 && e.learnings.length > 0 && e.presentMoments.length > 0)).toBe(true);
    expect(entries.filter((e) => e.dailyPurposes?.length > 0).length).toBeGreaterThan(20);

    const meals = await db().collection("mealdays").find(mine).toArray();
    expect(meals.length).toBeGreaterThan(40);
    expect(meals[0]!.items[0]).toEqual(expect.objectContaining({ proteinG: expect.any(Number), fiberG: expect.any(Number) }));
    expect(await db().collection("diaryentries").countDocuments(mine)).toBe(5);
    expect(await db().collection("thoughtlogs").countDocuments(mine)).toBe(3);
    expect(await db().collection("weeklygoals").countDocuments(mine)).toBe(7);
    expect(await db().collection("purposes").countDocuments(mine)).toBe(1);

    // Encrypted like real data, and readable through the API
    const diary = await h.request("GET", "/api/diary");
    expect(diary.body.entries.map((e: { title: string }) => e.title)).toContain("A slow Sunday");
    const stored = await db().collection("diaryentries").findOne(mine);
    expect(stored!.title).not.toContain(" ");
    const purpose = await h.request("GET", "/api/purpose");
    expect(purpose.body.purpose.coreValues).toContain("Curiosity");
    const today = await h.request("GET", "/api/entries/today");
    expect(today.status).toBe(200);
    expect(today.body.entry.dailyPurposes[0].text).toMatch(/\w/);
    const scores = await h.request("GET", `/api/scores/${today.body.entry.date}`);
    expect(scores.body.logged).toBe(true);
  });

  it("gives every seeded document the account's expiry, with a TTL index in every collection", async () => {
    for (const model of models.USER_OWNED_MODELS) {
      const indexes = await model.collection.indexes();
      expect(indexes).toContainEqual(expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }));
    }
    const user = await db().collection("users").findOne({ _id: demoUserId });
    expect(user!.expiresAt).toEqual(expiresAt);
    for (const name of ["dailyentries", "mealdays", "foods", "diaryentries", "thoughtlogs", "purposes", "weeklygoals"]) {
      const docs = await db().collection(name).find({ userId: demoUserId }).toArray();
      expect(docs.length, name).toBeGreaterThan(0);
      expect(docs.every((d) => d.expiresAt?.getTime() === expiresAt.getTime()), name).toBe(true);
    }
  });

  it("gives documents the visitor creates the same expiry (new documents and upserts)", async () => {
    const diary = await h.request("POST", "/api/diary", { title: "Hello", body: "Trying the demo" });
    expect(diary.status).toBe(201);
    const created = await db().collection("diaryentries").findOne({ userId: demoUserId, _id: new mongoose.Types.ObjectId(diary.body.entry.id as string) });
    expect(created!.expiresAt).toEqual(expiresAt);

    const quote = await h.request("POST", "/api/quotes", { text: "Small steps.", category: "calm" });
    expect(quote.status).toBe(201);
    expect((await db().collection("quotes").findOne({ userId: demoUserId }))!.expiresAt).toEqual(expiresAt);

    // An upsert: a day with no meals yet gets a new meal day
    const loggedMealDays = new Set((await db().collection("mealdays").find({ userId: demoUserId }).toArray()).map((d) => d.date as string));
    const entries = await db().collection("dailyentries").find({ userId: demoUserId }).sort({ date: 1 }).toArray();
    const emptyDate = entries.map((e) => e.date as string).find((d) => !loggedMealDays.has(d));
    if (emptyDate) {
      const food = await db().collection("foods").findOne({ userId: demoUserId });
      const meal = await h.request("PUT", `/api/meals/${emptyDate}`, {
        items: [{ mealType: "lunch", foodId: String(food!._id), name: food!.name, servingDescription: food!.servingDescription, servings: 1, kcalPerServing: food!.kcalPerServing }],
      });
      expect(meal.status).toBe(200);
      expect((await db().collection("mealdays").findOne({ userId: demoUserId, date: emptyDate }))!.expiresAt).toEqual(expiresAt);
    }

    // AI messages and usage are upserts too
    await h.request("POST", "/api/ai/boost");
    expect((await db().collection("aimessages").findOne({ userId: demoUserId }))!.expiresAt).toEqual(expiresAt);
  });

  it("still lets the visitor log things as normal", async () => {
    const date = (await h.request("GET", "/api/entries/today")).body.entry.date as string;
    expect((await h.request("POST", `/api/entries/${date}/moods`, { mood: 8, energy: 7 })).status).toBe(201);
    expect((await h.request("POST", `/api/entries/${date}/water`, { amountMl: 250 })).status).toBe(201);
    expect((await h.request("GET", "/api/progress/weight")).status).toBe(200);
    expect((await h.request("GET", "/api/profile")).status).toBe(200);
  });

  it("refuses the restricted features", async () => {
    const refused = [
      ["POST", "/api/health-sync/token"],
      ["DELETE", "/api/health-sync/token"],
      ["GET", "/api/health-sync/status"],
      ["POST", "/api/health-sync"],
      ["DELETE", "/api/profile/data-before-start"],
      ["PUT", "/api/auth/password"],
      ["PUT", "/api/profile/email"],
      ["DELETE", "/api/auth/me"],
      ["DELETE", "/api/profile"],
      ["DELETE", "/api/account"],
      ["GET", "/api/profile/export"],
      ["GET", "/api/export"],
    ];
    for (const [method, path] of refused) {
      const res = await h.request(method!, path!, method === "DELETE" && path!.includes("data-before") ? { confirm: "DELETE" } : undefined);
      expect([res.status, res.body?.demo], `${method} ${path}`).toEqual([403, true]);
    }
    // Refused even without a login, and before anything else runs
    h.setCookie(null);
    expect((await h.request("POST", "/api/health-sync")).status).toBe(403);
    h.setCookie(demoCookie);
    expect(await db().collection("users").findOne({ _id: demoUserId, healthSyncTokenHash: { $exists: true } })).toBeNull();
  });

  it("never calls the AI: every AI feature gives a pre-written example reply", async () => {
    const status = await h.request("GET", "/api/ai/status");
    expect(status.body).toEqual(expect.objectContaining({ configured: false, enabled: false, demo: true }));

    const date = (await h.request("GET", "/api/entries/today")).body.entry.date as string;
    for (const [method, path] of [
      ["POST", "/api/ai/boost?regenerate=true"],
      ["POST", `/api/ai/daily/${date}`],
      ["GET", "/api/ai/weekly"],
    ] as const) {
      const res = await h.request(method, path);
      expect(res.status, path).toBe(200);
      expect(res.body.message.source, path).toBe("fallback");
      expect(res.body.message.content.length, path).toBeGreaterThan(10);
    }

    const thought = await db().collection("thoughtlogs").findOne({ userId: demoUserId });
    const friend = await h.request("POST", `/api/ai/friend/${String(thought!._id)}`, { consent: true });
    expect(friend.status).toBe(200);

    expect(gemini.create).not.toHaveBeenCalled();
    expect(gemini.generate).not.toHaveBeenCalled();
  });

  it("says the demo is busy at 300 active demo accounts", async () => {
    const future = new Date(Date.now() + HOUR);
    const fillers = Array.from({ length: 300 }, (_, i) => ({ name: "Filler", email: `filler-${i}@demo.invalid`, passwordHash: "x", isDemo: true, expiresAt: future }));
    await db().collection("users").insertMany(fillers);
    const res = await h.request("POST", "/api/demo/start");
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/busy/i);
    await db().collection("users").deleteMany({ name: "Filler" });
  });

  it("removes expired demo accounts and all their data, and their login stops working", async () => {
    h.setCookie(null);
    const res = await h.request("POST", "/api/demo/start");
    expect(res.status).toBe(201);
    const oldId = new mongoose.Types.ObjectId(res.body.user.id as string);
    const past = new Date(Date.now() - 1000);
    for (const model of models.USER_OWNED_MODELS) {
      await model.collection.updateMany({ $or: [{ _id: oldId }, { userId: oldId }] }, { $set: { expiresAt: past } });
    }
    // Its login is refused straight away, even before the cleanup runs
    expect((await h.request("GET", "/api/entries/today")).status).toBe(401);

    expect(await models.deleteExpiredDemoData()).toBe(1);
    for (const model of models.USER_OWNED_MODELS) {
      expect(await model.collection.countDocuments({ $or: [{ _id: oldId }, { userId: oldId }] })).toBe(0);
    }
    // The other demo account is untouched
    expect(await db().collection("dailyentries").countDocuments({ userId: demoUserId })).toBeGreaterThan(40);
  });

  it("allows 5 demo starts per IP address an hour", async () => {
    // Starts so far: the first demo, the busy one and the expired one. Two more are allowed.
    expect((await h.request("POST", "/api/demo/start")).status).toBe(201);
    expect((await h.request("POST", "/api/demo/start")).status).toBe(201);
    const limited = await h.request("POST", "/api/demo/start");
    expect(limited.status).toBe(429);
    expect(limited.body.message).toMatch(/try again/i);
  });
});
