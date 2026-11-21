// Demo only: features that make no sense (or aren't safe) for a shared public demo, refused by the
// server whatever the page does. Everything else works normally on the visitor's own sample data.
//
// Some of these routes don't exist in the app yet (email, password, account deletion, export);
// they're listed so that adding one later can't accidentally open it up in the demo.
import type { NextFunction, Request, Response } from "express";

type Rule = { methods?: string[]; match: (path: string) => boolean; message: string };

const under = (prefix: string) => (path: string) => path === prefix || path.startsWith(`${prefix}/`);

export const DEMO_RULES: Rule[] = [
  { match: under("/api/health-sync"), message: "Apple Watch sync is turned off in the demo." },
  { methods: ["DELETE"], match: under("/api/profile/data-before-start"), message: "Deleting data is turned off in the demo." },
  { match: (p) => /^\/api\/(auth|profile)\/(email|password|account)(\/|$)/.test(p), message: "Account settings can't be changed in the demo." },
  { methods: ["DELETE"], match: (p) => p === "/api/auth/me" || p === "/api/profile", message: "Deleting the account is turned off in the demo." },
  { match: (p) => under("/api/account")(p) || /^\/api\/(profile\/)?export(\/|$)/.test(p), message: "This is turned off in the demo." },
];

export function demoRuleFor(method: string, path: string): Rule | undefined {
  return DEMO_RULES.find((rule) => (!rule.methods || rule.methods.includes(method)) && rule.match(path));
}

export function demoRestrictions(req: Request, res: Response, next: NextFunction): void {
  const rule = demoRuleFor(req.method, req.path);
  if (!rule) return next();
  res.status(403).json({ message: rule.message, demo: true });
}
