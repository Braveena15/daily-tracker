/// <reference types="vitest/globals" />
// Without DEMO_MODE=true (the personal deployment) nothing about the demo exists: no demo routes,
// no expiry on any document, no TTL index, no restrictions, and the AI is used as normal.
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";

// No module mocking and no vi.fn() call history: both were unreliable in full runs on Windows (now
// and then the real module loaded, or the recorded calls were gone by the last test). The harness
// swaps the app's Gemini client for this fake after start-up, and it counts its own calls.
let aiCalls = 0;
const generate = async () => {
  aiCalls++;
  return "A kind note from the AI.";
};

let h: Harness;
let models: typeof import("./setup");

beforeAll(async () => {
  // DEMO_MODE left at its default ("false"); DEMO_REPO_URL set, which alone must change nothing
  h = await startHarness(
    { ALLOW_REGISTRATION: "true", GEMINI_API_KEY: "test-key", DEMO_REPO_URL: "https://github.com/example/daily-tracker" },
    { aiGenerate: generate },
  );
  models = await import("./setup");
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

const db = () => mongoose.connection.db!;

describe("DEMO_MODE off", () => {
  it("has no demo routes", async () => {
    expect((await h.request("GET", "/api/demo/config")).status).toBe(404);
    expect((await h.request("POST", "/api/demo/start")).status).toBe(404);
  });

  it("registers normal accounts, with no demo fields and nothing that expires", async () => {
    const res = await h.request("POST", "/api/auth/register", { name: "Sam", email: "sam@example.com", password: "password-123" });
    expect(res.status).toBe(201);
    expect(res.body.user.isDemo).toBe(false);
    expect(res.body.user).not.toHaveProperty("expiresAt");

    const date = (await h.request("GET", "/api/entries/today")).body.date as string;
    expect((await h.request("POST", `/api/entries/${date}/moods`, { mood: 7, energy: 6 })).status).toBe(201);
    expect((await h.request("POST", "/api/diary", { body: "Personal entry" })).status).toBe(201);
    await h.request("POST", "/api/ai/boost");

    for (const name of ["users", "dailyentries", "diaryentries", "aimessages", "aiusages"]) {
      expect(await db().collection(name).countDocuments(), name).toBeGreaterThan(0);
      expect(await db().collection(name).countDocuments({ expiresAt: { $exists: true } }), name).toBe(0);
    }
  });

  it("creates no TTL index anywhere", async () => {
    for (const model of models.USER_OWNED_MODELS) {
      const indexes = await model.collection.indexes().catch(() => []);
      expect(indexes.some((i) => "expiresAt" in i.key || i.expireAfterSeconds !== undefined)).toBe(false);
    }
  });

  it("keeps Apple Watch sync and data clean-up available", async () => {
    expect((await h.request("POST", "/api/health-sync/token")).status).toBe(201);
    expect((await h.request("GET", "/api/health-sync/status")).status).toBe(200);
    expect((await h.request("DELETE", "/api/profile/data-before-start", { confirm: "DELETE" })).status).toBe(200);
  });

  it("uses the AI as before", async () => {
    // With a key and DEMO_MODE off, the Gemini client is created as usual
    expect(h.aiClientCreated).toBe(true);
    const status = await h.request("GET", "/api/ai/status");
    expect(status.body.configured).toBe(true);
    expect(status.body).not.toHaveProperty("demo");
    expect(aiCalls).toBeGreaterThan(0);
    const stored = await db().collection("aimessages").findOne({ type: "boost" });
    expect(stored!.source).toBe("ai");
  });
});
