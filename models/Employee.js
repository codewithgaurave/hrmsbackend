import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema({
  // Basic Information
  employeeId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  name: {
    first: { 
      type: String, 
      required: true,
      trim: true
    },
    last: { 
      type: String, 
      required: true,
      trim: true
    }
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  mobile: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true
  },
  alternateMobile: { 
    type: String,
    trim: true
  },
  whatsappNumber: { 
    type: String,
    trim: true
  },
  gender: { 
    type: String, 
    enum: ["Male", "Female", "Other"],
    required: true
  },
  dob: { 
    type: Date 
  },
  
  // Address Information
  address: {
    street: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      trim: true,
      default: "India"
    },
    pincode: {
      type: String,
      trim: true
    }
  },

coordinates: {
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
},


  // Employment Details - Updated with References
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    required: true
  },
  designation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Designation", 
    required: true
  },
  employmentStatus: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "EmploymentStatus",
    required: true
  },
  officeLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OfficeLocation",
    required: true
  },
  workShift: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "WorkShift",
    required: true
  },

  // Role and Hierarchy
  role: {
    type: String,
    enum: ["HR_Manager", "Team_Leader", "Employee"],
    default: "Employee"
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee"
  },
  
  // Compensation
  salary: { 
    type: Number, 
    required: true 
  },
  
  // Additional Employment Details
  dateOfJoining: { 
    type: Date, 
    default: Date.now 
  },
  dateOfLeaving: {
    type: Date
  },
  leavingReason: {
    type: String,
    trim: true
  },
  
  // System Fields
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  password: { 
    type: String, 
    required: true 
  },

  // Additional Personal Information
  personalEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  emergencyContact: {
    name: {
      type: String,
      trim: true
    },
    relationship: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    }
  },
  bloodGroup: {
    type: String,
    enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", null],
    default: null
  },
  maritalStatus: {
    type: String,
    enum: ["Single", "Married", "Divorced", "Widowed", null],
    default: null
  },
  
  // Documents and Verification
  profilePicture: {
    type: String, // URL or file path
    default: null
  },
  aadharNumber: {
    type: String,
    trim: true
  },
  panNumber: {
    type: String,
    trim: true
  },
  
  // Bank Details
  bankDetails: {
    accountNumber: {
      type: String,
      trim: true
    },
    bankName: {
      type: String,
      trim: true
    },
    ifscCode: {
      type: String,
      trim: true
    },
    branchName: {
      type: String,
      trim: true
    }
  }

}, { 
  timestamps: true 
});

// Index for better query performance
employeeSchema.index({ department: 1 });
employeeSchema.index({ designation: 1 });
employeeSchema.index({ manager: 1 });
employeeSchema.index({ isActive: 1 });

// Virtual for full name
employeeSchema.virtual('fullName').get(function() {
  return `${this.name.first} ${this.name.last}`;
});

// Ensure virtual fields are serialized
employeeSchema.set('toJSON', { virtuals: true });

const Employee = mongoose.model("Employee", employeeSchema);
export default Employee;

