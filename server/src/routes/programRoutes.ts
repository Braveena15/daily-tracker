import { Router } from "express";
import {
  addPhotos,
  createProgram,
  deleteUpcomingProgram,
  downloadPhoto,
  endProgram,
  getActiveProgram,
  getProgram,
  getProgramProgress,
  getProgramReport,
  listPrograms,
  photoUpload,
  removePhoto,
  saveCheckIn,
  setHabitsDone,
  undoEndProgram,
  updateBaseline,
  updateProgram,
} from "../controllers/programsController";
import { requireAuth } from "../middleware/requireAuth";
import { blockDemoWrites } from "../middleware/blockDemoWrites";

// Every program route needs a logged-in user (and read-only demo accounts can only read)
export const programsRouter = Router().use(requireAuth, blockDemoWrites);
// Fixed paths before "/:id"
programsRouter.get("/", listPrograms);
programsRouter.post("/", createProgram);
programsRouter.get("/active", getActiveProgram);
programsRouter.put("/habits/:date", setHabitsDone);
programsRouter.get("/:id", getProgram);
programsRouter.get("/:id/progress", getProgramProgress);
programsRouter.get("/:id/report", getProgramReport);
programsRouter.put("/:id", updateProgram);
programsRouter.delete("/:id", deleteUpcomingProgram);
programsRouter.put("/:id/baseline", updateBaseline);
programsRouter.put("/:id/check-ins/:kind", saveCheckIn);
programsRouter.post("/:id/end", endProgram);
programsRouter.post("/:id/undo-end", undoEndProgram);
programsRouter.post("/:id/photos/:slot", photoUpload, addPhotos);
programsRouter.delete("/:id/photos/:slot/:fileId", removePhoto);

// Photos: only ever streamed to their owner, never cached
export const programPhotosRouter = Router().use(requireAuth);
programPhotosRouter.get("/:fileId", downloadPhoto);
