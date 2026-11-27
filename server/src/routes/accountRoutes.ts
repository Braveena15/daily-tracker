import { Router } from "express";
import { countAccountData, deleteAccountData } from "../controllers/accountDataController";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";

// "Delete everything and start fresh" (blocked in the public demo, see demo/restrictions.ts)
export const accountRouter = Router().use(requireAuth, blockDemoWrites);
accountRouter.get("/data", countAccountData);
accountRouter.delete("/data", deleteAccountData);
