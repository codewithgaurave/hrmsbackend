import express from "express";
import {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController.js";
import { authenticateToken, requireHRManager } from "../middlewares/authMiddleware.js";


const router = express.Router();

// HR Only
router.post("/", authenticateToken, requireHRManager, createDepartment);

// Authenticated users can view
router.get("/", authenticateToken, getDepartments);
router.get("/:id", authenticateToken, getDepartmentById);

// HR Only
router.put("/:id", authenticateToken, requireHRManager, updateDepartment);
router.delete("/:id", authenticateToken, requireHRManager, deleteDepartment);

export default router;
