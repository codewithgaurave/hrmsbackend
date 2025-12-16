import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    eventType: {
      type: String,
      enum: [
        "Holiday",
        "Meeting",
        "Training",
        "Celebration",
        "Maintenance",
        "Other",
      ],
      default: "Other",
    },

    // Date and Time
    startDate: {
      type: Date,
      required: [true, "Event start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "Event end date is required"],
    },

    // Related Office
    officeLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OfficeLocation",
      required: true,
    },

    // Who created the event (HR / Manager)
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    // Optional fields
    isAllDay: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries on calendar fetch
eventSchema.index({ startDate: 1, endDate: 1 });
eventSchema.index({ officeLocation: 1 });
eventSchema.index({ eventType: 1 });

export default mongoose.model("Event", eventSchema);
