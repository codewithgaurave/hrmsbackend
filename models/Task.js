import mongoose from "mongoose";

const taskHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["New", "Assigned", "In Progress", "Pending", "Completed", "Approved", "Rejected"],
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  remarks: {
    type: String,
    trim: true,
    required: true
  }
});

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true
    },
    status: {
      type: String,
      enum: ["New", "Assigned", "In Progress", "Pending", "Completed", "Approved", "Rejected"],
      default: "New"
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Urgent"],
      default: "Medium"
    },
    dueDate: {
      type: Date
    },
    deadline: {
      type: Date,
      required: true
    },
    statusRemarks: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    taskHistory: [taskHistorySchema]
  },
  {
    timestamps: true
  }
);

// Enhanced middleware to automatically log ALL changes
taskSchema.pre("save", async function (next) {
  if (this.isNew) {
    // For new task, initial history entry
    this.taskHistory.push({
      status: "New",
      updatedBy: this.assignedBy,
      remarks: "Task created",
      updatedAt: new Date()
    });
  } else {
    const statusChanged = this.isModified("status");
    const otherFieldsChanged = this.isModified(["title", "description", "assignedTo", "priority", "dueDate", "deadline"]);
    
    if (statusChanged || otherFieldsChanged) {
      const historyEntry = {
        status: this.status,
        updatedBy: this.assignedTo, // This will be overridden in controller if needed
        updatedAt: new Date(),
        remarks: this.statusRemarks || `Status changed to ${this.status}`
      };

      // Add remarks for other field changes
      if (otherFieldsChanged && !statusChanged) {
        const modifiedFields = [];
        
        if (this.isModified("title")) modifiedFields.push("title");
        if (this.isModified("description")) modifiedFields.push("description");
        if (this.isModified("assignedTo")) modifiedFields.push("assignedTo");
        if (this.isModified("priority")) modifiedFields.push("priority");
        if (this.isModified("dueDate")) modifiedFields.push("dueDate");
        if (this.isModified("deadline")) modifiedFields.push("deadline");
        
        historyEntry.remarks = `Updated fields: ${modifiedFields.join(", ")}`;
      }

      this.taskHistory.push(historyEntry);
    }
  }
  next();
});

// Virtual for deadline status
taskSchema.virtual('deadlineStatus').get(function() {
  if (this.status === 'Completed' || this.status === 'Approved') {
    return 'completed';
  }
  if (this.deadline && new Date() > this.deadline) {
    return 'overdue';
  }
  if (this.deadline) {
    const timeDiff = this.deadline.getTime() - new Date().getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    if (daysDiff <= 1) return 'urgent';
    if (daysDiff <= 3) return 'approaching';
  }
  return 'normal';
});

// Index for better query performance
taskSchema.index({ deadline: 1 });
taskSchema.index({ status: 1, deadline: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });

const Task = mongoose.model("Task", taskSchema);
export default Task;