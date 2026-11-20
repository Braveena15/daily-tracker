import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { bearerToken, hashSyncToken } from "../utils/syncToken";

// 10 login attempts per IP address every 15 minutes.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
});

// AI routes: a burst limit on top of the per-user daily limit, so a stuck page can't hammer them.
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "That's a lot of requests — please wait a moment and try again." },
});

// Apple Health sync: 30 requests an hour per token. The key is the token's hash, so raw tokens
// are never kept in memory. Requests without a token are counted per IP address instead.
export const healthSyncRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token = bearerToken(req.headers.authorization);
    return token ? `token:${hashSyncToken(token)}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  message: { ok: false, message: "Too many syncs: the limit is 30 an hour. Please try again later." },
});
