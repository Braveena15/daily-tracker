/// <reference types="vitest/globals" />
// Read-only demo accounts (isDemo: true, DEMO_MODE off): everything loads, nothing changes.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";

let h: Harness;
// Not imported from blockDemoWrites.ts: that would load config/env before the harness sets it
const READ_ONLY_DEMO_MESSAGE = "This is a read-only demo account. Sign up to try all features!";

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

const account = { name: "Demo", email: "demo@example.com", password: "password-123" };

describe("read-only demo account", () => {
  let date: string;

  it("normal accounts can still save", async () => {
    expect((await h.request("POST", "/api/auth/register", account)).status).toBe(201);
    date = (await h.request("GET", "/api/entries/today")).body.date as string;
    expect((await h.request("POST", `/api/entries/${date}/moods`, { mood: 7, energy: 6 })).status).toBe(201);
  });

  it("can log in, sees isDemo, and can read every page's data", async () => {
    await mongoose.connection.db!.collection("users").updateOne({ email: account.email }, { $set: { isDemo: true } });
    await h.request("POST", "/api/auth/logout");
    const login = await h.request("POST", "/api/auth/login", { email: account.email, password: account.password });
    expect(login.status).toBe(200);
    expect(login.body.user.isDemo).toBe(true);
    expect((await h.request("GET", "/api/auth/me")).body.user.isDemo).toBe(true);

    for (const path of ["/api/profile", `/api/entries/${date}`, "/api/meals/stats/daily?days=14", "/api/diary", "/api/thoughts", "/api/expenses"]) {
      expect((await h.request("GET", path)).status, path).toBe(200);
    }
  });

  it("is refused every change with the read-only message", async () => {
    const writes: [string, string, unknown?][] = [
      ["POST", `/api/entries/${date}/moods`, { mood: 5, energy: 5 }],
      ["PUT", "/api/profile", { heightCm: 170 }],
      ["POST", "/api/diary", { body: "Hello" }],
      ["DELETE", "/api/profile/data-before-start"],
      ["POST", "/api/health-sync/token"],
    ];
    for (const [method, path, body] of writes) {
      const res = await h.request(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body).toEqual({ message: READ_ONLY_DEMO_MESSAGE });
    }
  });

  it("can still log out", async () => {
    expect((await h.request("POST", "/api/auth/logout")).status).toBe(200);
  });
});
