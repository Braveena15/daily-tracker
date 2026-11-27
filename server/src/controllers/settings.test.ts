/// <reference types="vitest/globals" />
// Settings: "Export my data" (decrypted, own data only, no receipt files) and the Apple Watch "Test connection".
import mongoose from "mongoose";
import { startHarness, type Harness } from "../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await startHarness({ ALLOW_REGISTRATION: "true" });
  expect((await h.request("POST", "/api/auth/register", { name: "Ada", email: "export@example.com", password: "password-123" })).status).toBe(201);
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

describe("GET /api/profile/export", () => {
  it("returns my diary, thoughts, purpose and expenses decrypted", async () => {
    expect((await h.request("POST", "/api/diary", { title: "Secret title", body: "Secret body" })).status).toBe(201);
    expect((await h.request("POST", "/api/thoughts", { thought: "A worried thought" })).status).toBe(201);
    expect((await h.request("PUT", "/api/purpose", { purposeStatement: "Live well", coreValues: ["Health"] })).status).toBe(200);
    expect((await h.request("POST", "/api/expenses", { date: (await h.request("GET", "/api/entries/today")).body.date, category: "food", title: "Lunch out", amount: 12 })).status).toBe(201);

    // Stored encrypted…
    const stored = await mongoose.connection.db!.collection("diaryentries").findOne({});
    expect(JSON.stringify(stored)).not.toContain("Secret body");

    // …exported readable
    const res = await h.request("GET", "/api/profile/export");
    expect(res.status).toBe(200);
    expect(res.body.diary[0]).toMatchObject({ title: "Secret title", body: "Secret body" });
    expect(res.body.thoughtLogs[0].thought).toBe("A worried thought");
    expect(res.body.purpose.purposeStatement).toBe("Live well");
    expect(res.body.expenses[0]).toMatchObject({ title: "Lunch out", amount: 12, receiptFiles: [] });
    expect(res.body.expenses[0].receipts).toBeUndefined();
    expect(res.body.account.email).toBe("export@example.com");
    expect(JSON.stringify(res.body)).not.toContain("userId");
  });
});

describe("GET /api/health-sync/test", () => {
  it("reports OK and whether a token is active", async () => {
    expect((await h.request("GET", "/api/health-sync/test")).body).toMatchObject({ ok: true, hasToken: false });
    await h.request("POST", "/api/health-sync/token");
    expect((await h.request("GET", "/api/health-sync/test")).body).toMatchObject({ ok: true, hasToken: true });
  });

  it("lists this computer's LAN addresses outside production, never localhost", async () => {
    const { lanAddresses } = (await h.request("GET", "/api/health-sync/status")).body;
    expect(Array.isArray(lanAddresses)).toBe(true);
    expect(lanAddresses).not.toContain("127.0.0.1");
  });
});
