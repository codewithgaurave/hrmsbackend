import express from "express";
import {
  createAnnouncement,
  getAllAnnouncements,
  getMyAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementStatus,
  getAnnouncementStats
} from "../controllers/announcementController.js";
import { authenticateToken, requireHRManager, requireTeamLeader } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(authenticateToken);

router.get("/my-announcements", getMyAnnouncements);
router.get("/stats", requireTeamLeader, getAnnouncementStats);
router.get("/", requireTeamLeader, getAllAnnouncements);
router.get("/:id", getAnnouncementById);
router.post("/", requireTeamLeader, createAnnouncement);
router.put("/:id", requireTeamLeader, updateAnnouncement);
router.patch("/:id/toggle-status", requireTeamLeader, toggleAnnouncementStatus);
router.delete("/:id", requireTeamLeader, deleteAnnouncement);

export default router;