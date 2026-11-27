import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { UserModel } from "../models/User";

export const READ_ONLY_DEMO_MESSAGE = "This is a read-only demo account. Sign up to try all features!";

// Read-only demo accounts (isDemo: true on a normal deployment, e.g. for recruiters): every page
// loads, but nothing can be created, changed or deleted. Use after requireAuth (or requireSyncToken).
//
// With DEMO_MODE=true, isDemo marks the temporary "Try the demo" accounts instead, which are meant
// to be written to (see demo/), so this does nothing there.
export function blockDemoWrites(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || env.demoMode) return next();

  UserModel.findById(req.userId)
    .select("isDemo")
    .lean()
    .then((user) => {
      if (user?.isDemo) {
        res.status(403).json({ message: READ_ONLY_DEMO_MESSAGE });
        return;
      }
      next();
    })
    .catch(next);
}
