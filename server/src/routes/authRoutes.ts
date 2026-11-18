import { Router } from "express";
import { login, logout, me, register } from "../controllers/authController";
import { requireAuth } from "../middleware/requireAuth";
import { loginLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", loginLimiter, login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
