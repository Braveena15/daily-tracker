import { Router } from "express";
import { createFood, deleteFood, listFoods, updateFood } from "../controllers/foodsController";
import { requireAuth } from "../middleware/requireAuth";

export const foodsRouter = Router();

foodsRouter.use(requireAuth);

foodsRouter.get("/", listFoods);
foodsRouter.post("/", createFood);
foodsRouter.put("/:id", updateFood);
foodsRouter.delete("/:id", deleteFood);
