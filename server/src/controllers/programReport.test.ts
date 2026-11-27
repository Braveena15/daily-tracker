/// <reference types="vitest/globals" />
// The program report: an ended-early program covers only day 1 → endedOnDay, consistency is over
// the days completed, and the wording is warm.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";
import { addDays } from "../utils/dates";

let h: Harness;
let today: string;
let id: string;
const programs = () => mongoose.connection.db!.collection("programs");

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  await h.request("POST", "/api/auth/register", { name: "Rae", email: "rae@example.com", password: "password-123" });
  today = (await h.request("GET", "/api/entries/today")).body.date;
  const start = addDays(today, -19);
  const res = await h.request("POST", "/api/programs", {
    name: "100-day transformation",
    lengthDays: 100,
    startDate: start,
    baseline: { weightKg: 80, ratings: { discipline: 4 }, habits: [] },
    goals: { goalWeightKg: 70, ratings: { discipline: 8 } },
    plan: { waterMl: 2000 },
  });
  id = res.body.program.id;
  // Logged on days 1–4 and 6, and again on days 10–20 (after it "ended" on day 7)
  for (const day of [1, 2, 3, 4, 6, ...Array.from({ length: 11 }, (_, i) => 10 + i)]) {
    const date = addDays(start, day - 1);
    expect((await h.request("POST", `/api/entries/${date}/moods`, { mood: day < 8 ? 5 : 9, energy: 6 })).status).toBe(201);
  }
  await h.request("PUT", `/api/entries/${addDays(start, 2)}/daily`, { weightKg: 79 });
  await h.request("PUT", `/api/entries/${addDays(start, 15)}/daily`, { weightKg: 75 });
  // Ended early on day 7
  await programs().updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { status: "ended_early", endedOn: addDays(start, 6), endedOnDay: 7, endedAt: new Date() } },
  );
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

describe("GET /api/programs/:id/report", () => {
  it("covers only days 1–7 of a program ended early on day 7", async () => {
    const res = await h.request("GET", `/api/programs/${id}/report`);
    expect(res.status).toBe(200);
    const r = res.body;
    expect(r.title).toBe("7 of 100 days — what you achieved");
    expect(r.range).toMatchObject({ days: 7, partial: true });
    expect(r.stats.daysLogged).toBe(5);
    expect(r.stats.consistency).toBe(71); // 5 of the 7 days completed, not of 100
    expect(r.stats.weeks.map((w: { week: number; partial: boolean }) => [w.week, w.partial])).toEqual([[1, false]]);
    // Only the weight logged inside the 7 days; mood never sees the later 9s
    expect(r.weight).toMatchObject({ before: 80, latest: 79, change: -1, progress: 10 });
    expect(r.stats.totals.avgMood).toBe(5);
    expect(r.improvements).toContain("−1.0 kg");
    expect(JSON.stringify(r)).not.toMatch(/fail/i);
  });
});
