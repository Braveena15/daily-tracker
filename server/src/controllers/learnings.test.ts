/// <reference types="vitest/globals" />
// Learnings have no time of day: no "time" is taken, none is shown, and the day's timeline lists
// them apart ("Learned today"). The learning score is unchanged.
import { startHarness, type Harness } from "../test/harness";
import { addDays } from "../utils/dates";

let h: Harness;
let today: string;

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  expect((await h.request("POST", "/api/auth/register", { name: "Sam", email: "learn@example.com", password: "password-123" })).status).toBe(201);
  today = (await h.request("GET", "/api/entries/today")).body.date;
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

describe("learnings without a time", () => {
  it("adds a learning without a time and lists it apart from the timeline, newest first", async () => {
    await h.request("POST", `/api/entries/${today}/moods`, { mood: 7, energy: 6 });
    expect((await h.request("POST", `/api/entries/${today}/learnings`, { topic: "React hooks", minutes: 30 })).status).toBe(201);
    const res = await h.request("POST", `/api/entries/${today}/learnings`, { topic: "Spanish verbs", details: "Ser vs estar, with examples" });
    expect(res.status).toBe(201);
    expect(res.body.learned).toEqual([
      { id: expect.any(String), summary: "Spanish verbs" },
      { id: expect.any(String), summary: "React hooks · 30 min" },
    ]);
    expect(res.body.timeline.some((t: { kind: string }) => t.kind === "learnings")).toBe(false);
    expect(res.body.timeline.some((t: { kind: string }) => t.kind === "moods")).toBe(true);
  });

  it("refuses a time for a learning (there's no time field any more)", async () => {
    expect((await h.request("POST", `/api/entries/${today}/learnings`, { topic: "Late", time: "08:00" })).status).toBe(400);
    const id = (await h.request("GET", `/api/entries/${today}`)).body.entry.learnings[0].id;
    expect((await h.request("PATCH", `/api/entries/${today}/learnings/${id}`, { time: "09:00" })).status).toBe(400);
    const edited = await h.request("PATCH", `/api/entries/${today}/learnings/${id}`, { minutes: 45 });
    expect(edited.status).toBe(200);
  });

  it("back-fills a past day without a time", async () => {
    const yesterday = addDays(today, -1);
    const res = await h.request("POST", `/api/entries/${yesterday}/learnings`, { topic: "Mongo indexes", minutes: 20 });
    expect(res.status).toBe(201);
    expect(res.body.learned).toEqual([{ id: expect.any(String), summary: "Mongo indexes · 20 min" }]);
  });

  it("keeps the learning score: entries, minutes and depth", async () => {
    const scores = (await h.request("GET", `/api/scores/${today}`)).body;
    const text = JSON.stringify(scores);
    expect(text).toContain("2 learnings logged");
    expect(text).toMatch(/Learning time/);
  });
});
