// Production: serves the built React app (client/dist) from the same server as the API.
// - Files that exist (JS, CSS, icons, the service worker…) are sent as they are.
// - Any other GET outside /api gets index.html, so React Router can show /today, /diary/123…
// - /api is never touched here: unknown API routes still get the JSON 404.
import fs from "node:fs";
import path from "node:path";
import express, { Router, type RequestHandler } from "express";

const YEAR_SECONDS = 365 * 24 * 60 * 60;

/** True for a request that should get the app's index.html. */
export function isClientPage(method: string, urlPath: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (urlPath === "/api" || urlPath.startsWith("/api/")) return false;
  // "/assets/missing.js" should be a 404, not a page of HTML
  return !path.posix.basename(urlPath).includes(".");
}

/**
 * Cache-Control for a file in client/dist. Files in /assets have a content hash in their
 * name, so they can be cached forever. Everything else (index.html, sw.js, the manifest,
 * icons) must be checked on every load, or a new version would never reach the browser.
 */
export function cacheControlFor(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 2] === "assets" ? `public, max-age=${YEAR_SECONDS}, immutable` : "no-cache";
}

export function serveClient(distDir: string): RequestHandler {
  const indexHtml = path.join(distDir, "index.html");
  if (!fs.existsSync(indexHtml)) {
    console.warn(`⚠️  ${indexHtml} not found. Run "npm run build" in the repo root, or the app's pages won't load.`);
  }

  const router = Router();
  router.use(
    express.static(distDir, {
      index: false, // "/" goes to the page handler below
      setHeaders: (res, filePath) => res.setHeader("Cache-Control", cacheControlFor(filePath)),
    }),
  );
  router.use((req, res, next) => {
    if (!isClientPage(req.method, req.path)) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml, (err) => err && next(err));
  });
  return router;
}
