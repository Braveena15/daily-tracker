/// <reference types="vitest/globals" />
// Missed-day reasons end to end: only today or yesterday, the note encrypted, and a reason never
// makes a day "logged" (history, streaks and the weekly review stay the same).
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";
import { addDays } from "../utils/dates";

let h: Harness;
let today: string;

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  expect((await h.request("POST", "/api/auth/register", { name: "Sam", email: "missed@example.com", password: "password-123" })).status).toBe(201);
  today = (await h.request("GET", "/api/entries/today")).body.date;
  await h.request("PUT", "/api/profile", { journeyStartDate: addDays(today, -6) });
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

const reason = (date: string, body: unknown) => h.request("PUT", `/api/entries/${date}/missed-reason`, body);

describe("missed-day reasons", () => {
  it("can be noted for yesterday and today only", async () => {
    const res = await reason(addDays(today, -1), { category: "busy", note: "Long day at work" });
    expect(res.status).toBe(200);
    expect(res.body.entry.missedReason).toMatchObject({ category: "busy", note: "Long day at work" });
    expect((await reason(today, { category: "unwell" })).status).toBe(200);
    expect((await reason(addDays(today, -2), { category: "busy" })).status).toBe(400);
    expect((await reason(addDays(today, 1), { category: "busy" })).status).toBe(400);
    expect((await reason(addDays(today, -1), { category: "lazy" })).status).toBe(400);
  });

  it("stores the note encrypted", async () => {
    const raw = await mongoose.connection.db!.collection("dailyentries").findOne({ date: addDays(today, -1) });
    expect(JSON.stringify(raw)).not.toMatch(/Long day at work/);
  });

  it("doesn't make the day logged: history, streak and the weekly review stay the same", async () => {
    const yesterday = addDays(today, -1);
    const list = (await h.request("GET", `/api/entries?from=${addDays(today, -6)}&to=${today}`)).body;
    expect(list.entries).toEqual([]);
    expect(list.missed.map((m: { date: string; category: string; note: string }) => [m.date, m.category, m.note])).toEqual(
      expect.arrayContaining([
        [yesterday, "busy", "Long day at work"],
        [today, "unwell", ""],
      ]),
    );
    expect((await h.request("GET", `/api/entries/${yesterday}`)).body.logged).toBe(false);
    expect((await h.request("GET", "/api/entries/stats/streak")).body.current).toBe(0);

    const review = (await h.request("GET", "/api/progress/weekly-review")).body;
    expect(review.thisWeek.daysLogged).toBe(0);
    expect(review.metrics.daysLogged).toMatchObject({ value: null, daysWithData: 0 });
    const y = review.days.find((d: { date: string }) => d.date === yesterday);
    expect(y).toMatchObject({ logged: false, missedReason: { category: "busy", note: "Long day at work" } });
  });

  it("averages mood per day first in the weekly review, ignoring days without a check-in", async () => {
    const twoDaysAgo = addDays(today, -2);
    // Two days ago: 4 and 6 (average 5); three days ago: 9 → weekly (5 + 9) / 2 = 7
    await h.request("POST", `/api/entries/${twoDaysAgo}/moods`, { mood: 4, energy: 4 });
    await h.request("POST", `/api/entries/${twoDaysAgo}/moods`, { mood: 6, energy: 6 });
    await h.request("POST", `/api/entries/${addDays(today, -3)}/moods`, { mood: 9, energy: 8 });
    const review = (await h.request("GET", "/api/progress/weekly-review")).body;
    expect(review.metrics.mood).toMatchObject({ value: 7, daysWithData: 2, daysInWeekSoFar: 7 });
    expect(review.metrics.daysLogged.value).toBe(2);
  });

  it("is cleared with DELETE (today or yesterday only)", async () => {
    const res = await h.request("DELETE", `/api/entries/${today}/missed-reason`);
    expect(res.status).toBe(200);
    expect(res.body.entry.missedReason).toBeNull();
    expect((await h.request("DELETE", `/api/entries/${addDays(today, -3)}/missed-reason`)).status).toBe(400);
  });
});
