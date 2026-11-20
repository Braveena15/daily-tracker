/// <reference types="vitest/globals" />
import { cacheControlFor, isClientPage } from "./serveClient";

describe("isClientPage", () => {
  it("sends index.html for app pages", () => {
    expect(isClientPage("GET", "/")).toBe(true);
    expect(isClientPage("GET", "/today")).toBe(true);
    expect(isClientPage("GET", "/diary/665f1c2e9b1d4a0012345678")).toBe(true);
    expect(isClientPage("HEAD", "/review")).toBe(true);
  });

  it("never handles the API", () => {
    expect(isClientPage("GET", "/api")).toBe(false);
    expect(isClientPage("GET", "/api/health")).toBe(false);
    expect(isClientPage("GET", "/api/entries/2026-11-20")).toBe(false);
  });

  it("lets other methods and missing files fall through to a 404", () => {
    expect(isClientPage("POST", "/today")).toBe(false);
    expect(isClientPage("GET", "/assets/index-missing.js")).toBe(false);
    expect(isClientPage("GET", "/favicon.ico")).toBe(false);
  });

  it("treats /apiary as a page, not the API", () => {
    expect(isClientPage("GET", "/apiary")).toBe(true);
  });
});

describe("cacheControlFor", () => {
  it("caches hashed build files forever", () => {
    expect(cacheControlFor("/app/client/dist/assets/index-DgG-0Qn8.js")).toBe("public, max-age=31536000, immutable");
    expect(cacheControlFor("C:\\app\\client\\dist\\assets\\index-DQ1ip73Q.css")).toBe("public, max-age=31536000, immutable");
  });

  it("makes the browser check everything else, so updates arrive", () => {
    expect(cacheControlFor("/app/client/dist/index.html")).toBe("no-cache");
    expect(cacheControlFor("/app/client/dist/sw.js")).toBe("no-cache");
    expect(cacheControlFor("/app/client/dist/manifest.webmanifest")).toBe("no-cache");
    expect(cacheControlFor("/app/client/dist/pwa-192x192.png")).toBe("no-cache");
  });
});
