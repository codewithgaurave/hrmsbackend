import express from "express";
import { 
  getEmployeeQuickStats, 
  getTeamLeaderQuickStats 
} from "../controllers/quickStats.js";
import { 
  authenticateToken, 
  requireTeamLeader 
} from "../middlewares/authMiddleware.js";

const router = express.Router();

// Get employee quick stats (for regular employees)
router.get("/employee", authenticateToken, getEmployeeQuickStats);

// Get team leader quick stats (for Team Leaders and HR Managers)
router.get("/team-leader", authenticateToken, requireTeamLeader, getTeamLeaderQuickStats);

export default router;