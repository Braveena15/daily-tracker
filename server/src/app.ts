import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { healthRouter } from "./routes/healthRoutes";
import { authRouter } from "./routes/authRoutes";
import { profileRouter } from "./routes/profileRoutes";
import { errorHandler, notFound } from "./middleware/errorHandler";

export const app = express();

app.use(helmet());
// Only the client app may call the API with cookies
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);

app.use(notFound);
app.use(errorHandler);
