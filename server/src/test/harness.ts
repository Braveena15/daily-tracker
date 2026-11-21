// Integration-test helpers: a throwaway in-memory MongoDB, the real Express app on a random port,
// and a tiny cookie-keeping client. Not a test file itself.
//
// Every environment variable the server reads is set here before the app is imported, so a
// developer's server/.env (which dotenv only uses for variables that aren't set) is never used.
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server-core";

export type Harness = {
  request: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any; cookie: string | null }>;
  /** The login cookie from the last response that set one */
  cookie: string | null;
  setCookie: (cookie: string | null) => void;
  stop: () => Promise<void>;
};

export async function startHarness(env: Record<string, string>): Promise<Harness> {
  const mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "test",
    PORT: "4999", // unused: the harness listens on a random port
    MONGODB_URI: mongo.getUri("daily-tracker-test"),
    JWT_SECRET: "t".repeat(48),
    DIARY_ENCRYPTION_KEY: "ab".repeat(32),
    ALLOW_REGISTRATION: "false",
    GEMINI_API_KEY: "",
    GEMINI_MODEL: "gemini-2.5-flash",
    AI_DATA_MODE: "minimal",
    AI_DAILY_LIMIT: "20",
    DEMO_MODE: "false",
    DEMO_REPO_URL: "",
    ...env,
  });

  const { connectDB } = await import("../config/db");
  const { app } = await import("../app");
  await connectDB();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const harness: Harness = {
    cookie: null,
    setCookie: (cookie) => {
      harness.cookie = cookie;
    },
    async request(method, path, body) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(body !== undefined && { "Content-Type": "application/json" }),
          ...(harness.cookie && { Cookie: harness.cookie }),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get("set-cookie");
      const cookie = setCookie?.match(/^token=[^;]+/)?.[0] ?? null;
      if (cookie && !cookie.endsWith("=")) harness.cookie = cookie;
      return { status: res.status, body: await res.json().catch(() => null), cookie };
    },
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
  return harness;
}
