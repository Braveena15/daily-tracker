import rateLimit from "express-rate-limit";

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
