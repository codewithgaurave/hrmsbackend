import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    audience: {
      allEmployees: { type: Boolean, default: true },
      departments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Department" }],
      designations: [{ type: mongoose.Schema.Types.ObjectId, ref: "Designation" }],
      roles: [{ type: String, enum: ["HR_Manager", "Team_Leader", "Employee"] }],
    },

    category: {
      type: String,
    },

    isActive: { type: Boolean, default: true },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },
  },
  { timestamps: true }
);

// Indexes for better performance
announcementSchema.index({ category: 1 });
announcementSchema.index({ isActive: 1 });
announcementSchema.index({ expiresAt: 1 });

const Announcement = mongoose.model("Announcement", announcementSchema);
export default Announcement;
