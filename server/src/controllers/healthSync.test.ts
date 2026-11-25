/// <reference types="vitest/globals" />
// POST /api/health-sync end to end, against a real (in-memory) MongoDB: only sleep is taken from the
// watch, steps and calories are entered by hand, and sleep you enter is never overwritten by a sync.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";
import { addDays } from "../utils/dates";

let h: Harness;
let today: string;
let token: string;

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  expect((await h.request("POST", "/api/auth/register", { name: "Sam", email: "sync@example.com", password: "password-123" })).status).toBe(201);
  today = (await h.request("GET", "/api/entries/today")).body.date;
  token = (await h.request("POST", "/api/health-sync/token")).body.token;
  expect(token).toBeTruthy();
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

/** The Shortcut's request: a Bearer token, no login cookie. */
async function sync(body: unknown) {
  const res = await fetch(`${h.base}/api/health-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
/** One night: asleep from 23:00 the evening before to 06:30 on `date` (7 h 30 min of Core sleep). */
const samples = (date: string) => `${addDays(date, -1)}T23:00:00+05:30;${date}T06:30:00+05:30;Core`;

const day = async (date: string) => (await h.request("GET", `/api/entries/${date}`)).body.entry;
const raw = (date: string) => mongoose.connection.db!.collection("dailyentries").findOne({ date });

describe("POST /api/health-sync", () => {
  it("accepts steps, calories, exercise, workouts and weight without an error, but stores none of them", async () => {
    const res = await sync({
      date: today,
      steps: 8234,
      stepsWatch: 6120,
      stepsPhone: "lots", // not even validated any more
      activeCalories: 512,
      restingCalories: 1650,
      exerciseMinutes: 41,
      workouts: [{ type: "Running", durationMin: 30 }],
      weightKg: 72.4,
    });
    expect(res.status).toBe(200);
    expect(res.body.updatedFields).toEqual([]);
    expect(res.body.ignoredFields).toEqual(["steps", "stepsWatch", "stepsPhone", "activeCalories", "restingCalories", "exerciseMinutes", "workouts", "weightKg"]);
    expect(await raw(today)).toBeNull(); // nothing was written to the day
  });

  it("keeps steps and active calories exactly as typed on the Today page", async () => {
    await h.request("PUT", `/api/entries/${today}/daily`, { steps: 4000, activeCalories: 150 });
    await sync({ date: today, steps: 9000, activeCalories: 600, sleepSamples: samples(today) });
    const stored = await raw(today);
    expect(stored).toMatchObject({ steps: 4000, activeCalories: 150 });
    expect(stored!.healthSnapshots ?? []).toEqual([]);
    expect(stored).not.toHaveProperty("restingCalories");
  });

  it("stores the watch's sleep: night, hours and score", async () => {
    const entry = await day(today);
    expect(entry.sleep).toMatchObject({ totalSleepMin: 450, source: "watch" });
    expect(entry).toMatchObject({ sleepHours: 7.5, sleepHoursSource: "watch", sleepScoreSource: "auto" });
    expect(entry.sleepScoreValue).toBe(entry.sleep.score);
    // No sync entries on the timeline
    const { timeline } = (await h.request("GET", `/api/entries/${today}`)).body;
    expect(timeline.some((t: { kind: string }) => t.kind === "sync")).toBe(false);
  });

  it("never overwrites sleep you entered yourself", async () => {
    expect((await h.request("PUT", `/api/entries/${today}/daily`, { sleepHours: 6, sleepScoreValue: 65 })).status).toBe(200);
    const res = await sync({ date: today, sleepSamples: samples(today) });
    expect(res.body.keptFields).toEqual(["sleepHours"]);
    const entry = await day(today);
    expect(entry).toMatchObject({ sleepHours: 6, sleepHoursSource: "manual", sleepScoreValue: 65, sleepScoreSource: "manual" });
    expect(entry.sleep.totalSleepMin).toBe(450); // the night's stages are still there to show
  });

  it("clearing your own values goes back to the watch's", async () => {
    await h.request("PUT", `/api/entries/${today}/daily`, { sleepHours: null, sleepScoreValue: null });
    const entry = await day(today);
    expect(entry).toMatchObject({ sleepHours: 7.5, sleepHoursSource: "watch", sleepScoreSource: "auto" });
  });

  it("without watch data, the hours and score you enter are what the day uses (scores included)", async () => {
    const yesterday = addDays(today, -1);
    await h.request("POST", `/api/entries/${yesterday}/moods`, { mood: 7, energy: 6 });
    expect((await h.request("PUT", `/api/entries/${yesterday}/daily`, { sleepHours: 8, sleepScoreValue: 90 })).status).toBe(200);
    const entry = await day(yesterday);
    expect(entry).toMatchObject({ sleepHours: 8, sleepHoursSource: "manual", sleepScoreValue: 90, sleepScoreSource: "manual" });
    expect(entry.sleep).toBeUndefined();

    // The Physical score's sleep line uses them
    const scores = (await h.request("GET", `/api/scores/${yesterday}`)).body;
    expect(JSON.stringify(scores)).toContain("Sleep score 90/100 (8 h)");
  });

  it("still fills plain sleepHours only on a day without any", async () => {
    const twoDaysAgo = addDays(today, -2);
    expect((await sync({ date: twoDaysAgo, sleepHours: "7,25" })).body.updatedFields).toEqual(["sleepHours"]);
    expect((await sync({ date: twoDaysAgo, sleepHours: 9 })).body.keptFields).toEqual(["sleepHours"]);
    expect((await day(twoDaysAgo)).sleepHours).toBe(7.25);
  });

  it("still rejects bad sleep data with a clear message", async () => {
    const res = await sync({ date: today, sleepHours: 30 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/sleepHours must be between 0 and 24/);
  });
});
