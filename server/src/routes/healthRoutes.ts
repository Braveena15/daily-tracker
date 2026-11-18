import { Router } from "express";
import { dbStatus } from "../config/db";

export const healthRouter = Router();

// Health check: tells us the server and database are working
healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", db: dbStatus() });
});
