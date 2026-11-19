import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { FoodModel } from "../models/Food";
import { AppError } from "../utils/AppError";
import { FOOD_MACROS, createFoodSchema, updateFoodSchema } from "../validation/mealSchema";

// Every query filters by req.userId, so users only ever see and change their own foods.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

function parseLimit(value: unknown): number {
  if (value === undefined || value === "") return DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw new AppError(400, `"limit" must be a whole number from 1 to ${MAX_LIMIT}`);
  }
  return n;
}

// Treat the search text literally, so "(" or "." don't act as regex symbols
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function findOwnFood(req: Request) {
  const { id } = req.params;
  // An id that isn't ours (or isn't an id at all) looks the same as one that doesn't exist
  const food = isValidObjectId(id) ? await FoodModel.findOne({ _id: id, userId: req.userId }) : null;
  if (!food) throw new AppError(404, "Food not found");
  return food;
}

/**
 * GET /api/foods?q=&limit=
 * With q: foods whose name contains q (favourites, then most used, first).
 * Without: favourites first, then the most recently used.
 */
export async function listFoods(req: Request, res: Response): Promise<void> {
  const limit = parseLimit(req.query.limit);
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

  const foods = q
    ? await FoodModel.find({ userId: req.userId, name: { $regex: escapeRegex(q), $options: "i" } })
        .sort({ isFavourite: -1, timesUsed: -1, name: 1 })
        .limit(limit)
    : await FoodModel.find({ userId: req.userId })
        .sort({ isFavourite: -1, lastUsedAt: -1, timesUsed: -1, name: 1 })
        .limit(limit);

  res.json({ foods });
}

export async function createFood(req: Request, res: Response): Promise<void> {
  const body = createFoodSchema.parse(req.body ?? {});
  const food = await FoodModel.create({ ...body, userId: req.userId });
  res.status(201).json({ food });
}

export async function updateFood(req: Request, res: Response): Promise<void> {
  const changes = updateFoodSchema.parse(req.body ?? {});
  const food = await findOwnFood(req);

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    // null clears an optional macro
    if (value === null && (FOOD_MACROS as readonly string[]).includes(key)) food.set(key, undefined);
    else food.set(key, value);
  }
  await food.save();

  res.json({ food });
}

/** Deleting a food never changes past meals: each meal item keeps its own copy of the details. */
export async function deleteFood(req: Request, res: Response): Promise<void> {
  const food = await findOwnFood(req);
  await food.deleteOne();
  res.json({ deleted: true });
}
