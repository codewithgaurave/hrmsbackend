import mongoose from "mongoose";

const OfficeLocationSchema = new mongoose.Schema(
  {
    officeName: {
      type: String,
      required: [true, 'Office name is required'],
      trim: true,
    },
    officeAddress: {
      type: String,
      required: [true, 'Office address is required'],
      trim: true,
    },
    latitude: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },
    
    officeType: {
      type: String,
      enum: ["Remote", "Office", "Hybrid"],
      default: "Office",
    },

    // Optional: organization-wise code or branch identifier
    branchCode: {
      type: String,
      trim: true,
      default: null,
    },

    // Optional contact person for this office
    contactPerson: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("OfficeLocation", OfficeLocationSchema);
