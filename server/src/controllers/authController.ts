import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserModel } from "../models/User";
import { AppError } from "../utils/AppError";
import { clearAuthCookie, setAuthCookie } from "../utils/jwt";
import { env } from "../config/env";

const BCRYPT_ROUNDS = 12;

const emailField = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Please enter a valid email address" }));

const registerSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  email: emailField,
  password: z
    .string({ error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    // bcrypt only uses the first 72 bytes of a password
    .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "Password must be 72 characters or less"),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string({ error: "Password is required" }).min(1, "Password is required"),
});

// Compared against when the email doesn't exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export async function register(req: Request, res: Response): Promise<void> {
  if (!env.allowRegistration) {
    throw new AppError(403, "Registration is currently closed");
  }

  const { name, email, password } = registerSchema.parse(req.body);

  if (await UserModel.exists({ email })) {
    throw new AppError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await UserModel.create({ name, email, passwordHash });

  setAuthCookie(res, user.id);
  res.status(201).json({ user });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);

  const user = await UserModel.findOne({ email }).select("+passwordHash");
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    throw new AppError(401, "Invalid email or password");
  }

  setAuthCookie(res, user.id);
  res.json({ user });
}

export function logout(_req: Request, res: Response): void {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId);

  if (!user) {
    // Valid token, but the account no longer exists
    clearAuthCookie(res);
    throw new AppError(401, "Please log in to continue");
  }

  res.json({ user });
}
