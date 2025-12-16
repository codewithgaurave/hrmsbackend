import express from "express";
import {
  createLeave,
  getLeaves,
  getLeaveById,
  updateLeaveStatus,
  cancelLeave,
  getMyLeaves,
  getMyAndTeamLeaves,
  getMyAndTeamLeavesWithoutFilters,
  getLeaveBalance,
  getAvailableLeaveTypes
} from "../controllers/leaveController.js";
import { authenticateToken, canAccessEmployee, requireHRManager, requireTeamLeader } from "../middlewares/authMiddleware.js";


const router = express.Router();

// Employee creates leave
router.post("/", authenticateToken, createLeave);

// Get leaves
router.get("/", authenticateToken, requireHRManager,  getLeaves);
router.get("/my-teams-leaves", authenticateToken, canAccessEmployee,  getMyAndTeamLeaves);
router.get("/my-leaves", authenticateToken, getMyLeaves);
router.get("/:id", authenticateToken, getLeaveById);
router.get('/available-types', getAvailableLeaveTypes);
router.get('/balance', getLeaveBalance);
router.get('/balance/:employeeId', getLeaveBalance);
router.get('/team/without-filters', getMyAndTeamLeavesWithoutFilters);
// HR approves/rejects leave
router.put("/:id/status", authenticateToken, requireTeamLeader, updateLeaveStatus);


// Employee cancels pending leave
router.delete("/:id", authenticateToken, cancelLeave);

export default router;
