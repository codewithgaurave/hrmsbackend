import express from "express";
import {
  createDesignation,
  getDesignations,
  getDesignationById,
  updateDesignation,
  deleteDesignation,
} from "../controllers/designationController.js";
import { authenticateToken, requireHRManager } from "../middlewares/authMiddleware.js";


const router = express.Router();

// HR Only
router.post("/", authenticateToken, requireHRManager, createDesignation);

// Anyone authenticated can view
router.get("/", authenticateToken, getDesignations);
router.get("/:id", authenticateToken, getDesignationById);

// HR Only
router.put("/:id", authenticateToken, requireHRManager, updateDesignation);
router.delete("/:id", authenticateToken, requireHRManager, deleteDesignation);

export default router;
