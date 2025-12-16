import express from "express";
import {
  createTask,
  getAllTasks,
  getMyTasks,
  updateTaskStatus,
  reviewTask,
  updateTask,
  deleteTask,
  getTaskStats,
  getAssignableEmployees,
  getDeadlineAlerts,
  getTaskById,
  restoreTask
} from "../controllers/taskController.js";

import {
  authenticateToken,
  requireTeamLeader,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

// Create a task (HR or Team Leader)
router.post("/", authenticateToken, requireTeamLeader, createTask);

// Get all tasks (HR or Team Leader)
router.get("/", authenticateToken, requireTeamLeader, getAllTasks);

// Get my tasks (Employee)
router.get("/my", authenticateToken, getMyTasks);


// Get task statistics
router.get("/stats", authenticateToken, getTaskStats);

// Get assignable employees
router.get("/assignable-employees", authenticateToken, requireTeamLeader, getAssignableEmployees);

// Get deadline alerts
router.get("/alerts/deadline", authenticateToken, getDeadlineAlerts);

// Get task by ID
router.get("/:id", authenticateToken, getTaskById);

// Update task status (Employee - Only for assigned tasks)
router.put("/:id/status", authenticateToken, updateTaskStatus);

// Approve/Reject task (HR/Team Leader - Only for completed tasks)
router.put("/:id/review", authenticateToken, requireTeamLeader, reviewTask);

// Update task details (HR/Team Leader)
router.put("/:id", authenticateToken, requireTeamLeader, updateTask);

// Soft delete (HR / Team Leader)
router.delete("/:id", authenticateToken, requireTeamLeader, deleteTask);
router.patch("/:id", authenticateToken, requireTeamLeader, restoreTask);

export default router;