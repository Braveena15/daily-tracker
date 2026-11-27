import { Router } from "express";
import { countDataBeforeStart, deleteDataBeforeStart, getProfile, getSummary, updateProfile } from "../controllers/profileController";
import { exportMyData } from "../controllers/exportController";
import { dismissMilestones, getMilestones } from "../controllers/milestoneController";
import { requireAuth } from "../middleware/requireAuth";

export const profileRouter = Router();

// Every profile route needs a logged-in user
profileRouter.use(requireAuth);

profileRouter.get("/", getProfile);
profileRouter.put("/", updateProfile);
profileRouter.get("/summary", getSummary);
// Optional clean-up of data dated before the journey start
profileRouter.get("/data-before-start", countDataBeforeStart);
profileRouter.delete("/data-before-start", deleteDataBeforeStart);
// Settings → Data: everything the user wrote, decrypted, as one JSON file
profileRouter.get("/export", exportMyData);
// Milestone notes closed on any device
profileRouter.get("/milestones", getMilestones);
profileRouter.post("/milestones/dismissed", dismissMilestones);
