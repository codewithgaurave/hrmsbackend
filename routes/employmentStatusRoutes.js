import express from "express";
import {
  createEmploymentStatus,
  getEmploymentStatuses,
  getEmploymentStatusById,
  updateEmploymentStatus,
  deleteEmploymentStatus,
} from "../controllers/employmentStatusController.js";
import { authenticateToken, requireHRManager } from "../middlewares/authMiddleware.js";


const router = express.Router();

// HR Only
router.post("/", authenticateToken, requireHRManager, createEmploymentStatus);

// Authenticated users can view
router.get("/", authenticateToken, getEmploymentStatuses);
router.get("/:id", authenticateToken, getEmploymentStatusById);

// HR Only
router.put("/:id", authenticateToken, requireHRManager, updateEmploymentStatus);
router.delete("/:id", authenticateToken, requireHRManager, deleteEmploymentStatus);

export default router;
