import { Router } from "express";
import {
  createSyncToken,
  healthSync,
  revokeSyncToken,
  syncStatus,
  testSyncConnection,
} from "../controllers/healthSyncController";
import { healthSyncRateLimit } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";
import { requireSyncToken } from "../middleware/requireSyncToken";

export const healthSyncRouter = Router();

// Called by the iOS Shortcut: Bearer token only (no cookies), 30 requests an hour per token
healthSyncRouter.post("/", healthSyncRateLimit, requireSyncToken, blockDemoWrites, healthSync);

// Managing the token needs the normal login
healthSyncRouter.get("/status", requireAuth, syncStatus);
healthSyncRouter.get("/test", requireAuth, testSyncConnection);
healthSyncRouter.post("/token", requireAuth, blockDemoWrites, createSyncToken);
healthSyncRouter.delete("/token", requireAuth, blockDemoWrites, revokeSyncToken);
