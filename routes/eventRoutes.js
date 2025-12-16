import express from "express";
import { authenticateToken, requireHRManager } from "../middlewares/authMiddleware.js";
import { createEvent, deleteEvent, getAllEvents, getEventById, getMyEvents, updateEvent } from "../controllers/eventControllers.js";


const router = express.Router();

router.use(authenticateToken);

router.post("/", requireHRManager, createEvent);
router.get("/my-events", getMyEvents);
router.get("/all", requireHRManager, getAllEvents);
router.get("/:id", getEventById);
router.put("/:id", requireHRManager, updateEvent);
router.delete("/:id", requireHRManager, deleteEvent);

export default router;