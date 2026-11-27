/// <reference types="vitest/globals" />
// /api/programs end to end, against a real (in-memory) MongoDB: one active program, ending early
// and undoing it within 24 hours, encrypted text, daily habits, and photos only their owner can see.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";
import { addDays } from "../utils/dates";

let h: Harness;
let alice: string;
let bob: string;
let today: string;

const programs = () => mongoose.connection.db!.collection("programs");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  await h.request("POST", "/api/auth/register", { name: "Alice", email: "alice@example.com", password: "password-123" });
  alice = h.cookie!;
  await h.request("POST", "/api/auth/register", { name: "Bob", email: "bob@example.com", password: "password-123" });
  bob = h.cookie!;
  h.setCookie(alice);
  today = (await h.request("GET", "/api/entries/today")).body.date;
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

const newProgram = (over: Record<string, unknown> = {}) => ({
  name: "100-day transformation",
  lengthDays: 100,
  startDate: addDays(today, -13),
  baseline: { weightKg: 80, ratings: { confidence: 4, discipline: 4 }, habits: ["late nights"], text: "I want energy for my kids" },
  goals: { goalWeightKg: 72, ratings: { discipline: 8 }, focusAreas: ["physical", "mental"], notes: "Run 5 km" },
  plan: { waterMl: 2500, sleepHours: 7.5, workoutsPerWeek: 4, learningMinutes: 20, customHabits: ["No sugar", "Stretch"] },
  ...over,
});

async function upload(id: string, slot: string, cookie: string) {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(JPEG)], { type: "image/jpeg" }), "me.jpg");
  const res = await fetch(`${h.base}/api/programs/${id}/photos/${slot}`, { method: "POST", headers: { Cookie: cookie }, body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe("programs", () => {
  let id: string;

  it("creates a program: day 14 of 100, 87 days left, text stored encrypted", async () => {
    const res = await h.request("POST", "/api/programs", newProgram());
    expect(res.status).toBe(201);
    id = res.body.program.id;
    expect(res.body.program.clock).toMatchObject({ dayNumber: 14, daysLeft: 87, phase: "running" });
    expect(res.body.program.baseline.text).toBe("I want energy for my kids");
    expect(res.body.program.plan.customHabits.map((x: { label: string }) => x.label)).toEqual(["No sugar", "Stretch"]);

    const stored = await programs().findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(JSON.stringify(stored)).not.toContain("energy for my kids");
    expect(JSON.stringify(stored)).not.toContain("Run 5 km");
  });

  it("allows only one active program", async () => {
    const res = await h.request("POST", "/api/programs", newProgram({ name: "Second" }));
    expect(res.status).toBe(409);
    expect((await h.request("GET", "/api/programs/active")).body.program.id).toBe(id);
  });

  it("ticks daily habits on a day of the program (only known habit ids)", async () => {
    const program = (await h.request("GET", `/api/programs/${id}`)).body.program;
    const [sugar] = program.plan.customHabits;
    const res = await h.request("PUT", `/api/programs/habits/${today}`, { done: [sugar.id, "made-up"] });
    expect(res.body.done).toEqual([sugar.id]);
    expect((await h.request("GET", `/api/entries/${today}`)).body.entry.programHabitsDone).toEqual([sugar.id]);
    // A tick alone doesn't count as logging the day
    expect((await h.request("GET", `/api/entries/${today}`)).body.logged).toBe(false);
    expect((await h.request("PUT", `/api/programs/habits/${addDays(today, -30)}`, { done: [] })).status).toBe(400);
  });

  it("photos: only the owner can see them", async () => {
    const res = await upload(id, "baseline", alice);
    expect(res.status).toBe(201);
    const fileId = res.body.program.baseline.photos[0].fileId;

    const mine = await fetch(`${h.base}/api/program-photos/${fileId}`, { headers: { Cookie: alice } });
    expect(mine.status).toBe(200);
    expect(Buffer.from(await mine.arrayBuffer()).equals(JPEG)).toBe(true);
    expect(mine.headers.get("cache-control")).toContain("no-store");

    expect((await fetch(`${h.base}/api/program-photos/${fileId}`, { headers: { Cookie: bob } })).status).toBe(404);
    expect((await fetch(`${h.base}/api/program-photos/${fileId}`)).status).toBe(401);
    expect((await upload(id, "baseline", bob)).status).toBe(404);
    // Stored encrypted
    const chunk = await mongoose.connection.db!.collection("programPhotos.chunks").findOne({});
    expect(Buffer.from(chunk!.data.buffer).includes(JPEG.subarray(4, 40))).toBe(false);
  });

  it("a check-in can be skipped", async () => {
    const res = await h.request("PUT", `/api/programs/${id}/check-ins/midpoint`, { skipped: true });
    expect(res.status).toBe(200);
    expect(res.body.program.midpoint.skipped).toBe(true);
  });

  it("ends early on day 14, with an encrypted note, and can be undone within 24 hours", async () => {
    const end = await h.request("POST", `/api/programs/${id}/end`, { reason: "too busy", note: "Work got hectic" });
    expect(end.body.program).toMatchObject({ status: "ended_early", endedOn: today, endedOnDay: 14, endReason: "too busy", canUndoEnd: true });
    expect(JSON.stringify(await programs().findOne({ _id: new mongoose.Types.ObjectId(id) }))).not.toContain("hectic");
    expect((await h.request("GET", "/api/programs/active")).body).toMatchObject({ program: null, latestEnded: { id, endedOnDay: 14 } });

    const undo = await h.request("POST", `/api/programs/${id}/undo-end`);
    expect(undo.body.program).toMatchObject({ status: "active", endedOnDay: null, clock: { dayNumber: 14, daysLeft: 87 } });
  });

  it("can't be undone after 24 hours, or once a new program has started", async () => {
    await h.request("POST", `/api/programs/${id}/end`, {});
    await programs().updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { endedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    expect((await h.request("POST", `/api/programs/${id}/undo-end`)).status).toBe(400);

    await programs().updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { endedAt: new Date() } });
    const next = await h.request("POST", "/api/programs", newProgram({ name: "Fresh start", startDate: today, lengthDays: 30 }));
    expect(next.status).toBe(201);
    expect((await h.request("POST", `/api/programs/${id}/undo-end`)).status).toBe(409);
    // The final check-in is still possible for the ended one
    expect((await h.request("PUT", `/api/programs/${id}/check-ins/final`, { weightKg: 78.5, ratings: { discipline: 6 }, habits: [], text: "Proud" })).body.program.final.weightKg).toBe(78.5);
  });

  it("other users never see or change it", async () => {
    h.setCookie(bob);
    expect((await h.request("GET", `/api/programs/${id}`)).status).toBe(404);
    expect((await h.request("POST", `/api/programs/${id}/end`, {})).status).toBe(404);
    expect((await h.request("GET", "/api/programs")).body.programs).toEqual([]);
    h.setCookie(alice);
  });

  it("an active program past its last day is marked completed when read", async () => {
    const active = (await h.request("GET", "/api/programs/active")).body.program;
    await programs().updateOne({ _id: new mongoose.Types.ObjectId(active.id) }, { $set: { startDate: addDays(today, -40) } });
    expect((await h.request("GET", "/api/programs/active")).body.program).toBeNull();
    expect((await h.request("GET", `/api/programs/${active.id}`)).body.program.status).toBe("completed");
  });
});
