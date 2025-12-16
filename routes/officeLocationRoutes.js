// routes/officeLocationRoutes.js
import express from "express";
import {
  createOfficeLocation,
  getOfficeLocations,
  getOfficeLocationById,
  updateOfficeLocation,
  deleteOfficeLocation,
  getOfficeLocationsWithoutFilters,
} from "../controllers/officeLocationController.js";
import { authenticateToken, requireHRManager } from "../middlewares/authMiddleware.js";

const router = express.Router();

// HR Only routes
router.post("/", authenticateToken, requireHRManager, createOfficeLocation);
router.put("/:id", authenticateToken, requireHRManager, updateOfficeLocation);
router.delete("/:id", authenticateToken, requireHRManager, deleteOfficeLocation);

// Authenticated users can view
router.get("/without-filters", authenticateToken, getOfficeLocationsWithoutFilters);
router.get("/", authenticateToken, getOfficeLocations);
router.get("/:id", authenticateToken, getOfficeLocationById);

export default router;