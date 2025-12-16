import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
  // Employee Reference
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: [true, "Employee is required"]
  },

  // Date Information
  date: {
    type: Date,
    required: [true, "Attendance date is required"],
    index: true
  },

  // Punch-in Information
  punchIn: {
    timestamp: {
      type: Date,
      required: [true, "Punch-in time is required"]
    },
    coordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true }
    },
  },

  // Punch-out Information
  punchOut: {
    timestamp: {
      type: Date
    },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number }
    },
  },

  // Work Duration Calculations
  totalWorkHours: {
    type: Number, // in hours
    default: 0
  },
  overtimeHours: {
    type: Number, // in hours
    default: 0
  },

  // Attendance Status
  status: {
    type: String,
    enum: [
      "Present",
      "Absent",
      "Half Day",
      "Late",
      "Early Departure",
      "Holiday",
      "Week Off",
      "On Leave"
    ],
    default: "Present"
  },

  // Early Departure Information
  earlyDepartureMinutes: {
    type: Number,
    default: 0
  },
  earlyDepartureReason: {
    type: String,
    trim: true,
    maxlength: 500
  },

  // Shift Information
  shift: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "WorkShift",
    required: true
  },

  // Location Validation
  isWithinOfficeLocation: {
    type: Boolean,
    default: false
  },
  officeLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OfficeLocation",
    required: true
  },

  isActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

// Compound Index for unique attendance per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

// Index for better query performance
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ employee: 1, date: -1 });
attendanceSchema.index({ officeLocation: 1 });
attendanceSchema.index({ status: 1 });

// Virtual for calculating work hours
attendanceSchema.virtual('calculatedWorkHours').get(function() {
  if (!this.punchIn || !this.punchOut || !this.punchIn.timestamp || !this.punchOut.timestamp) {
    return 0;
  }
  
  const diffMs = this.punchOut.timestamp - this.punchIn.timestamp;
  return diffMs / (1000 * 60 * 60); // Convert ms to hours
});

// Pre-save middleware to calculate work hours
attendanceSchema.pre('save', function(next) {
  if (this.punchIn && this.punchOut && this.punchIn.timestamp && this.punchOut.timestamp) {
    const workHours = this.calculatedWorkHours;
    this.totalWorkHours = Math.max(0, workHours);
    
    // Calculate overtime (assuming 8 hours standard work day)
    const standardHours = 8;
    this.overtimeHours = Math.max(0, workHours - standardHours);
  }
  
  // Auto-calculate status
  this.calculateAttendanceStatus();
  next();
});

// Static method to get attendance summary for an employee
attendanceSchema.statics.getEmployeeSummary = async function(employeeId, startDate, endDate) {
  const summary = await this.aggregate([
    {
      $match: {
        employee: new mongoose.Types.ObjectId(employeeId),
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalHours: { $sum: "$totalWorkHours" },
        totalOvertime: { $sum: "$overtimeHours" }
      }
    }
  ]);
  
  return summary;
};

// Method to calculate attendance status
attendanceSchema.methods.calculateAttendanceStatus = function() {
  if (!this.punchIn || !this.punchIn.timestamp) {
    this.status = "Absent";
    return;
  }

  const punchInTime = this.punchIn.timestamp;
  const scheduledStart = new Date(punchInTime);
  scheduledStart.setHours(9, 0, 0, 0); // Default 9:00 AM
  
  // Calculate late minutes
  const lateDiff = punchInTime - scheduledStart;
  const lateMinutes = Math.max(0, lateDiff / (1000 * 60)); // Convert to minutes

  // Calculate early departure if punched out
  let earlyDepartureMinutes = 0;
  if (this.punchOut && this.punchOut.timestamp) {
    const punchOutTime = this.punchOut.timestamp;
    const scheduledEnd = new Date(punchOutTime);
    scheduledEnd.setHours(18, 0, 0, 0); // Default 6:00 PM
    
    const earlyDiff = scheduledEnd - punchOutTime;
    earlyDepartureMinutes = Math.max(0, earlyDiff / (1000 * 60)); // Convert to minutes
    this.earlyDepartureMinutes = earlyDepartureMinutes;
  }

  // Determine status
  if (lateMinutes > 30) {
    this.status = "Late";
  } else if (earlyDepartureMinutes > 30) {
    this.status = "Early Departure";
  } else if (this.totalWorkHours < 4) {
    this.status = "Half Day";
  } else {
    this.status = "Present";
  }
};

const Attendance = mongoose.model("Attendance", attendanceSchema);
export default Attendance;