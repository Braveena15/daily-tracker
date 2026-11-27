/// <reference types="vitest/globals" />
// "Delete everything and start fresh": all of my data goes (files too), my account, profile and
// settings stay, and nobody else's data is touched.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";
import { addDays } from "../utils/dates";

let h: Harness;
let me: string;
let other: string;
let today: string;
const db = () => mongoose.connection.db!;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 3)]);

async function fillAccount(cookie: string) {
  h.setCookie(cookie);
  await h.request("POST", `/api/entries/${today}/moods`, { mood: 6, energy: 6 });
  await h.request("POST", "/api/diary", { body: "Dear diary" });
  await h.request("POST", "/api/thoughts", { thought: "A thought" });
  await h.request("PUT", "/api/purpose", { purposeStatement: "Live well", coreValues: ["Health"] });
  const expense = (await h.request("POST", "/api/expenses", { date: today, category: "food", title: "Lunch", amount: 10 })).body.expense;
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(JPEG)], { type: "image/jpeg" }), "r.jpg");
  expect((await fetch(`${h.base}/api/expenses/${expense.id}/receipts`, { method: "POST", headers: { Cookie: cookie }, body: form })).status).toBe(201);
  const program = (await h.request("POST", "/api/programs", { name: "Fresh", lengthDays: 30, startDate: addDays(today, -2) })).body.program;
  const photo = new FormData();
  photo.append("files", new Blob([new Uint8Array(JPEG)], { type: "image/jpeg" }), "p.jpg");
  expect((await fetch(`${h.base}/api/programs/${program.id}/photos/baseline`, { method: "POST", headers: { Cookie: cookie }, body: photo })).status).toBe(201);
}

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  await h.request("POST", "/api/auth/register", { name: "Me", email: "me@example.com", password: "password-123" });
  me = h.cookie!;
  await h.request("POST", "/api/auth/register", { name: "Other", email: "other@example.com", password: "password-123" });
  other = h.cookie!;
  today = (await h.request("GET", "/api/entries/today")).body.date;
  await fillAccount(me);
  await fillAccount(other);
  h.setCookie(me);
  await h.request("PUT", "/api/profile", { heightCm: 172, waterGoalMl: 2500 });
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

describe("DELETE /api/account/data", () => {
  it("counts what would be deleted", async () => {
    const res = await h.request("GET", "/api/account/data");
    expect(res.body.counts).toMatchObject({ days: 1, diaryEntries: 1, thoughtLogs: 1, purposes: 1, expenses: 1, programs: 1, receiptFiles: 1, photoFiles: 1 });
  });

  it("needs DELETE typed in", async () => {
    expect((await h.request("DELETE", "/api/account/data", {})).status).toBe(400);
    expect((await h.request("DELETE", "/api/account/data", { confirm: "delete" })).status).toBe(400);
  });

  it("deletes all my data and files, keeps my account and settings, and leaves other users alone", async () => {
    const otherId = (await db().collection("users").findOne({ email: "other@example.com" }))!._id;
    const meId = (await db().collection("users").findOne({ email: "me@example.com" }))!._id;
    const res = await h.request("DELETE", "/api/account/data", { confirm: "DELETE" });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toMatchObject({ days: 1, programs: 1, receiptFiles: 1, photoFiles: 1 });

    for (const name of ["dailyentries", "diaryentries", "thoughtlogs", "purposes", "expenses", "programs", "mealdays", "weeklygoals", "aimessages"]) {
      expect(await db().collection(name).countDocuments({ userId: meId }), name).toBe(0);
    }
    for (const bucket of ["receipts", "programPhotos"]) {
      expect(await db().collection(`${bucket}.files`).countDocuments({ "metadata.userId": meId }), bucket).toBe(0);
      expect(await db().collection(`${bucket}.files`).countDocuments({ "metadata.userId": otherId }), bucket).toBe(1);
    }
    // The other account is untouched
    for (const name of ["dailyentries", "diaryentries", "thoughtlogs", "purposes", "expenses", "programs"]) {
      expect(await db().collection(name).countDocuments({ userId: otherId }), name).toBe(1);
    }
    // Still logged in, with the profile and settings kept
    const profile = (await h.request("GET", "/api/profile")).body;
    expect(profile.profile.heightCm).toBe(172);
    expect(profile.goals.waterGoalMl).toBe(2500);
    expect((await h.request("GET", "/api/programs/active")).body.program).toBeNull();
  });
});
