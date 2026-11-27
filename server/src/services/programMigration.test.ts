/// <reference types="vitest/globals" />
// Old journey settings → a Program: once per user, safe to run twice, and the History floor
// becomes the earliest program start.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";
import { addDays, todayInTimezone } from "../utils/dates";

let h: Harness;
let mig: typeof import("./programMigration");
let journey: typeof import("./journey");
let today: string;

const users = () => mongoose.connection.db!.collection("users");
const programs = () => mongoose.connection.db!.collection("programs");
const entries = () => mongoose.connection.db!.collection("dailyentries");

async function register(email: string): Promise<string> {
  const res = await h.request("POST", "/api/auth/register", { name: "Kim", email, password: "password-123" });
  expect(res.status).toBe(201);
  return String((await users().findOne({ email }))!._id);
}

async function logDay(userId: string, date: string, extra: Record<string, unknown> = {}) {
  await entries().insertOne({
    userId: new mongoose.Types.ObjectId(userId),
    date,
    moodLogs: [{ mood: 7, energy: 6, loggedAt: new Date() }],
    ...extra,
  });
}

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  mig = await import("./programMigration");
  journey = await import("./journey");
  today = todayInTimezone();
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

describe("migrateJourneysToPrograms", () => {
  it("creates one active program from a chosen journey start, with baseline and goals, and is safe to run twice", async () => {
    const id = await register("chosen@example.com");
    const start = addDays(today, -9);
    await users().updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { journeyStartDate: start, journeyLengthDays: 90, currentWeightKg: 80, goalWeightKg: 72 } });
    await logDay(id, addDays(start, 1), { weightKg: 81.5 });

    await mig.migrateJourneysToPrograms(today);
    await mig.migrateJourneysToPrograms(today);
    const list = await programs().find({ userId: new mongoose.Types.ObjectId(id) }).toArray();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ startDate: start, lengthDays: 90, status: "active", migrated: true, name: "90-day transformation" });
    expect(list[0]!.baseline.weightKg).toBe(81.5);
    expect(list[0]!.goals.goalWeightKg).toBe(72);
    expect(list[0]!.plan.waterMl).toBe(2000);
  });

  it("uses the first entry when no date was chosen; users without data get no program", async () => {
    const withData = await register("first@example.com");
    await logDay(withData, addDays(today, -3));
    const empty = await register("empty@example.com");

    await mig.migrateJourneysToPrograms(today);
    expect(await programs().findOne({ userId: new mongoose.Types.ObjectId(withData) })).toMatchObject({ startDate: addDays(today, -3), lengthDays: 100 });
    expect(await programs().countDocuments({ userId: new mongoose.Types.ObjectId(empty) })).toBe(0);
  });

  it("a journey past its last day is completed if they were still logging at the end, else abandoned", async () => {
    const done = await register("done@example.com");
    const start = addDays(today, -40);
    await users().updateOne({ _id: new mongoose.Types.ObjectId(done) }, { $set: { journeyStartDate: start, journeyLengthDays: 30 } });
    await logDay(done, addDays(start, 27));
    const stopped = await register("stopped@example.com");
    await users().updateOne({ _id: new mongoose.Types.ObjectId(stopped) }, { $set: { journeyStartDate: start, journeyLengthDays: 30 } });
    await logDay(stopped, addDays(start, 2));

    await mig.migrateJourneysToPrograms(today);
    expect((await programs().findOne({ userId: new mongoose.Types.ObjectId(done) }))!.status).toBe("completed");
    expect((await programs().findOne({ userId: new mongoose.Types.ObjectId(stopped) }))!.status).toBe("abandoned");
  });

  it("the History floor is the earliest program start", async () => {
    const id = await register("floor@example.com");
    await users().updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { journeyStartDate: addDays(today, -2) } });
    await logDay(id, addDays(today, -20));
    expect(await journey.journeyStart(id)).toBe(addDays(today, -2));
    await programs().insertOne({ userId: new mongoose.Types.ObjectId(id), name: "Old", lengthDays: 30, startDate: addDays(today, -15), status: "completed" });
    expect(await journey.journeyStart(id)).toBe(addDays(today, -15));
  });
});
