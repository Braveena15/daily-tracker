import { Router } from "express";
import { demoConfig, startDemo } from "../demo/controller";
import { demoStartLimiter } from "../middleware/rateLimit";

// Mounted only when DEMO_MODE=true (see app.ts)
export const demoRouter = Router();

demoRouter.get("/config", demoConfig);
demoRouter.post("/start", demoStartLimiter, startDemo);
