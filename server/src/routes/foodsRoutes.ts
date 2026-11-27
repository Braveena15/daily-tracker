import { Router } from "express";
import { createFood, deleteFood, listFoods, updateFood } from "../controllers/foodsController";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";

export const foodsRouter = Router();

foodsRouter.use(requireAuth, blockDemoWrites);

foodsRouter.get("/", listFoods);
foodsRouter.post("/", createFood);
foodsRouter.put("/:id", updateFood);
foodsRouter.delete("/:id", deleteFood);
