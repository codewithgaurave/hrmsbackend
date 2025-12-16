import express from "express";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import { 
  getDashboardStats, 
  getDashboardAnalytics 
} from "../controllers/dashboardController.js";

const router = express.Router();

// All routes are protected
router.use(authenticateToken);

// Get comprehensive dashboard stats (accessible to all roles with different data)
router.get("/stats", getDashboardStats);

// Get detailed analytics for charts (accessible to HR and Team Leaders)
router.get("/analytics", getDashboardAnalytics);

export default router;