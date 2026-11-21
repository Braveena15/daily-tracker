import mongoose from "mongoose";
import { env } from "./env";
import { runMigrations } from "../services/migrations";
import { prepareDemoDatabase } from "../demo/setup";

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("✅ MongoDB connected");
    await runMigrations();
    // Demo only: TTL indexes, and expired demo accounts removed
    if (env.demoMode) await prepareDemoDatabase();
  } catch (err) {
    // Keep the server running so /api/health can report the database as disconnected.
    console.error("❌ MongoDB error:", err instanceof Error ? err.message : err);
  }
}

export function dbStatus(): string {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return states[mongoose.connection.readyState] ?? "unknown";
}
