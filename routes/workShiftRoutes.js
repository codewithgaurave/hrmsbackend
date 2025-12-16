import express from "express";
import {
  createWorkShift,
  getWorkShifts,
  getWorkShiftById,
  updateWorkShift,
  deleteWorkShift,
  getWorkShiftsWithoutFilters,
} from "../controllers/workShiftController.js";
import { authenticateToken, requireHRManager } from "../middlewares/authMiddleware.js";



const router = express.Router();

// HR Only can create
router.post("/", authenticateToken, requireHRManager, createWorkShift);

// Anyone authenticated can see shifts
router.get("/without-filters", authenticateToken, requireHRManager, getWorkShiftsWithoutFilters);
router.get("/", authenticateToken, requireHRManager, getWorkShifts);
router.get("/:id", authenticateToken, getWorkShiftById);

// HR Only can update/delete
router.put("/:id", authenticateToken, requireHRManager, updateWorkShift);
router.delete("/:id", authenticateToken, requireHRManager, deleteWorkShift);

export default router;
