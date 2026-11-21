/// <reference types="vitest/globals" />
import { demoRuleFor } from "./restrictions";

describe("demo restrictions", () => {
  it.each([
    ["POST", "/api/health-sync"],
    ["POST", "/api/health-sync/token"],
    ["DELETE", "/api/health-sync/token"],
    ["GET", "/api/health-sync/status"],
    ["DELETE", "/api/profile/data-before-start"],
    ["PUT", "/api/auth/password"],
    ["PATCH", "/api/auth/email"],
    ["PUT", "/api/profile/password"],
    ["DELETE", "/api/auth/account"],
    ["DELETE", "/api/auth/me"],
    ["DELETE", "/api/profile"],
    ["DELETE", "/api/account"],
    ["GET", "/api/export"],
    ["GET", "/api/profile/export"],
  ])("refuses %s %s", (method, path) => {
    expect(demoRuleFor(method, path)).toBeDefined();
  });

  it.each([
    ["GET", "/api/profile"],
    ["PUT", "/api/profile"],
    ["GET", "/api/profile/data-before-start"],
    ["GET", "/api/auth/me"],
    ["POST", "/api/auth/logout"],
    ["POST", "/api/entries/2026-11-21/moods"],
    ["PUT", "/api/meals/2026-11-21"],
    ["POST", "/api/diary"],
    ["DELETE", "/api/diary/abc"],
    ["GET", "/api/health"],
    ["POST", "/api/ai/boost"],
    ["GET", "/api/health-syncing"],
    ["GET", "/api/exports-not-a-route"],
  ])("allows %s %s", (method, path) => {
    expect(demoRuleFor(method, path)).toBeUndefined();
  });
});
