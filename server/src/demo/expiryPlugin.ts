// Adds `expiresAt` to a user-owned schema. In the demo, MongoDB's TTL index on it (created at startup
// by demo/setup.ts, only when DEMO_MODE=true) deletes each document once its account has expired,
// even while the server is asleep.
//
// New documents get the demo account's expiry from the request context (demo/context.ts):
// - created with save()/create()
// - created by an upsert (findOneAndUpdate, updateOne, updateMany with { upsert: true })
// Outside a demo request there's no context, so nothing is added: a normal deployment never sets
// the field and has no TTL index, and its data is never deleted.
import type { Query, Schema } from "mongoose";
import { currentDemoExpiry } from "./context";

type Update = Record<string, unknown> & { $setOnInsert?: Record<string, unknown> };

export function demoExpiryPlugin(schema: Schema): void {
  if (!schema.path("expiresAt")) schema.add({ expiresAt: { type: Date } });

  schema.pre("save", function () {
    const expiresAt = currentDemoExpiry();
    if (expiresAt && this.isNew && !this.get("expiresAt")) this.set("expiresAt", expiresAt);
  });

  schema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function (this: Query<unknown, unknown>) {
    const expiresAt = currentDemoExpiry();
    if (!expiresAt || !this.getOptions().upsert) return;
    const update = this.getUpdate();
    // Aggregation-pipeline updates aren't used for upserts in this app
    if (!update || Array.isArray(update)) return;
    const u = update as Update;
    this.setUpdate({ ...u, $setOnInsert: { ...u.$setOnInsert, expiresAt } });
  });
}
