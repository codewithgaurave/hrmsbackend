import express from "express";
import { authenticateToken, requireHRManager, requireTeamLeader } from "../middlewares/authMiddleware.js";
import { 
  punchIn, 
  punchOut, 
  getTodayAttendance, 
  getAttendance, 
  getAttendanceSummary, 
  getAttendanceFilters,
  updateAttendance, 
  getMyAttendances,
  getMyAttendanceSummary,
  getMyAttendanceCalendar,
  getEmployeeAttendances,
  punchInByHr,
  punchOutByHr,
  getMyAttendanceComprehensive
} from "../controllers/attendanceController.js";

const router = express.Router();

// All routes are protected
router.use(authenticateToken);

router.post("/punch-in", punchIn);
router.post("/punch-out", punchOut);
router.post("/:employeeId/punch-in/by-hr", requireHRManager, punchInByHr);
router.post("/:employeeId/punch-out/by-hr", requireHRManager, punchOutByHr);
router.get("/employee/:employeeId/today", requireTeamLeader, getTodayAttendance);
router.get("/", getAttendance);
router.get("/summary", getAttendanceSummary);
router.get("/filters", getAttendanceFilters);
// Add these routes to your existing attendance routes

// Get logged-in employee's all attendances
router.get("/my-attendances", getMyAttendances);

router.get("/today", getTodayAttendance);
// Get detailed analytics summary for logged-in employee
router.get("/my-summary", getMyAttendanceSummary);

// Get calendar view for logged-in employee
router.get("/my-calendar", getMyAttendanceCalendar);

// get attendance details of en employee
router.get("/:employeeId/details", requireTeamLeader, getEmployeeAttendances);

// Update your routes to include the comprehensive endpoint
router.get("/get-my-attendance", getMyAttendanceComprehensive);


router.put("/:id", updateAttendance);

export default router;