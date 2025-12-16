import mongoose from "mongoose";

const workShiftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    startTime: {
      type: String, // format: "09:00"
      required: true,
    },
    endTime: {
      type: String, // format: "17:00"
      required: true,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
    },
  },
  { timestamps: true }
);

const WorkShift = mongoose.model("WorkShift", workShiftSchema);
export default WorkShift;
