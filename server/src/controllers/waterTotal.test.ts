/// <reference types="vitest/globals" />
// PUT /api/entries/:date/water/total end to end, against a real (in-memory) MongoDB: the day's
// drinks become one entry with exactly the typed total (none for 0), within 0 to 2 × the goal.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";
import { addDays } from "../utils/dates";

let h: Harness;
let today: string;

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  expect((await h.request("POST", "/api/auth/register", { name: "Sam", email: "water@example.com", password: "password-123" })).status).toBe(201);
  today = (await h.request("GET", "/api/entries/today")).body.date;
  // A 2 L goal: the day's total can be 0–4000 ml
  expect((await h.request("PUT", "/api/profile", { waterGoalMl: 2000 })).status).toBe(200);
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

const total = (date: string, totalMl: unknown) => h.request("PUT", `/api/entries/${date}/water/total`, { totalMl });

describe("setting the day's water total", () => {
  it("replaces the day's drinks with one entry of exactly the total", async () => {
    await h.request("POST", `/api/entries/${today}/water`, { amountMl: 250 });
    await h.request("POST", `/api/entries/${today}/water`, { amountMl: 500 });

    const res = await total(today, 1800);
    expect(res.status).toBe(200);
    expect(res.body.waterTotalMl).toBe(1800);
    expect(res.body.entry.waterLogs).toHaveLength(1);
    expect(res.body.entry.waterLogs[0].amountMl).toBe(1800);
    // Water isn't on the day's timeline any more
    expect(res.body.timeline.some((t: { kind: string }) => t.kind === "water")).toBe(false);

    // Adding a glass afterwards still adds on top of the total
    const more = await h.request("POST", `/api/entries/${today}/water`, { amountMl: 250 });
    expect(more.body.waterTotalMl).toBe(2050);
  });

  it("reads litres as typed", async () => {
    const res = await total(today, "1.5 L");
    expect(res.status).toBe(200);
    expect(res.body.waterTotalMl).toBe(1500);
  });

  it("clears the day with 0", async () => {
    const res = await total(today, 0);
    expect(res.status).toBe(200);
    expect(res.body.waterTotalMl).toBe(0);
    expect(res.body.entry.waterLogs).toEqual([]);
  });

  it("allows up to 2 × the goal, and refuses more, less than 0 or nonsense", async () => {
    expect((await total(today, 4000)).body.waterTotalMl).toBe(4000);
    const tooMuch = await total(today, 4001);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.message).toMatch(/0 to 4000 ml/);
    expect((await total(today, -1)).status).toBe(400);
    expect((await total(today, "a lot")).status).toBe(400);
    expect((await total(today, 7000)).status).toBe(400); // over the 6000 ml cap whatever the goal
    // Unchanged after the refusals
    expect((await h.request("GET", `/api/entries/${today}`)).body.waterTotalMl).toBe(4000);
  });

  it("never goes above 6000 ml, even with a big goal", async () => {
    await h.request("PUT", "/api/profile", { waterGoalMl: 4000 });
    expect((await total(today, 6000)).status).toBe(200);
    expect((await total(today, 6001)).status).toBe(400);
    await h.request("PUT", "/api/profile", { waterGoalMl: 2000 });
  });

  it("works for past days, but not future ones or days before the journey start", async () => {
    const yesterday = addDays(today, -1);
    const res = await total(yesterday, "2 L");
    expect(res.status).toBe(200);
    expect(res.body.waterTotalMl).toBe(2000);

    expect((await total(addDays(today, 1), 500)).status).toBe(400);

    expect((await h.request("PUT", "/api/profile", { journeyStartDate: today })).status).toBe(200);
    const before = await total(yesterday, 500);
    expect(before.status).toBe(400);
    expect(before.body.message).toMatch(/before your journey/);
  });

  it("keeps the weekly figures working from the total", async () => {
    const res = await h.request("GET", "/api/progress/water?days=7");
    const day = res.body.days.find((d: { date: string }) => d.date === today);
    expect(day.ml).toBe(6000); // from the 6000 ml test above
    expect(res.body.waterGoalDays).toBeGreaterThanOrEqual(1);
  });

  it("only changes the user's own day", async () => {
    const entries = mongoose.connection.db!.collection("dailyentries");
    expect(await entries.countDocuments({ date: today })).toBe(1);
  });
});
