// controllers/officeLocationController.js
import OfficeLocation from "../models/OfficeLocation.js";

// Create Office Location (HR Only)
export const createOfficeLocation = async (req, res) => {
  console.log("Received data:", req.body);
  
  try {
    const {
      officeName,
      officeAddress,
      latitude,
      longitude,
      officeType,
      branchCode,
      contactPerson
    } = req.body;

    // Validation - coordinates को अलग से check करें
    if (!officeName || !officeAddress || !latitude || !longitude) {
      return res.status(400).json({ 
        success: false,
        message: "Office name, address, latitude, and longitude are required" 
      });
    }

    // Check if office name already exists
    const existingOffice = await OfficeLocation.findOne({ officeName });
    if (existingOffice) {
      return res.status(400).json({
        success: false,
        message: "Office location with this name already exists"
      });
    }

    // Create new office location - schema के according fields use करें
    const officeLocation = await OfficeLocation.create({
      officeName,
      officeAddress,
      latitude: parseFloat(latitude),  // सीधे latitude field में
      longitude: parseFloat(longitude), // सीधे longitude field में
      officeType: officeType || "Office",
      branchCode: branchCode || null,
      contactPerson: contactPerson || null,
      createdBy: req.employee._id
    });

    // Populate createdBy field
    await officeLocation.populate("createdBy", "name.first name.last employeeId role");

    res.status(201).json({
      success: true,
      message: "Office location created successfully",
      officeLocation
    });

  } catch (error) {
    console.error("Create office location error:", error);
    
    // Better error logging
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while creating office location",
      error: error.message
    });
  }
};

// Get all Office Locations without filters
export const getOfficeLocationsWithoutFilters = async (req, res) => {
  try {
    const officeLocations = await OfficeLocation.find()
      .populate("createdBy", "name.first name.last employeeId role")

    return res.status(200).json({
      success: true,
      message: "Office locations fetched successfully",
      officeLocations,
    });

  } catch (error) {
    console.error("Get office locations error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching office locations",
      error: error.message
    });
  }
};

// Get all Office Locations with filters
export const getOfficeLocations = async (req, res) => {
  try {
    const {
      search,
      officeType,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10
    } = req.query;

    // Build filter object
    const filter = {};

    // Search filter (office name or address)
    if (search) {
      filter.$or = [
        { officeName: { $regex: search, $options: "i" } },
        { officeAddress: { $regex: search, $options: "i" } },
        { branchCode: { $regex: search, $options: "i" } }
      ];
    }

    // Office type filter
    if (officeType && officeType !== "All") {
      filter.officeType = officeType;
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const officeLocations = await OfficeLocation.find(filter)
      .populate("createdBy", "name.first name.last employeeId role")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination info
    const totalCount = await OfficeLocation.countDocuments(filter);

    // Get counts for stats
    const officeCount = await OfficeLocation.countDocuments({ ...filter, officeType: "Office" });
    const remoteCount = await OfficeLocation.countDocuments({ ...filter, officeType: "Remote" });
    const hybridCount = await OfficeLocation.countDocuments({ ...filter, officeType: "Hybrid" });

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      success: true,
      message: "Office locations fetched successfully",
      total: totalCount,
      officeLocations,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        limit: limitNum
      },
      stats: {
        office: officeCount,
        remote: remoteCount,
        hybrid: hybridCount,
        total: totalCount
      }
    });

  } catch (error) {
    console.error("Get office locations error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching office locations",
      error: error.message
    });
  }
};

// Get single Office Location by ID
export const getOfficeLocationById = async (req, res) => {
  try {
    const officeLocation = await OfficeLocation.findById(req.params.id)
      .populate("createdBy", "name.first name.last employeeId role");

    if (!officeLocation) {
      return res.status(404).json({
        success: false,
        message: "Office location not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Office location fetched successfully",
      officeLocation
    });

  } catch (error) {
    console.error("Get office location by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching office location",
      error: error.message
    });
  }
};

// Update Office Location (HR Only)
export const updateOfficeLocation = async (req, res) => {
  console.log(req.body)
  try {
    const {
      officeName,
      officeAddress,
      latitude,
      longitude,
      officeType,
      branchCode,
      contactPerson
    } = req.body;

    // Find office location
    let officeLocation = await OfficeLocation.findById(req.params.id);
    if (!officeLocation) {
      return res.status(404).json({
        success: false,
        message: "Office location not found"
      });
    }

    // Check if office name already exists (excluding current one)
    if (officeName && officeName !== officeLocation.officeName) {
      const existingOffice = await OfficeLocation.findOne({ 
        officeName, 
        _id: { $ne: req.params.id } 
      });
      if (existingOffice) {
        return res.status(400).json({
          success: false,
          message: "Office location with this name already exists"
        });
      }
    }

    // Update fields
    const updateFields = {};
    if (officeName) updateFields.officeName = officeName;
    if (officeAddress) updateFields.officeAddress = officeAddress;
    if (officeType) updateFields.officeType = officeType;
    if (branchCode !== undefined) updateFields.branchCode = branchCode;
    if (contactPerson !== undefined) updateFields.contactPerson = contactPerson;

    // Update coordinates if provided
    if (latitude !== undefined || longitude !== undefined) {
      updateFields.coordinates = {
        latitude: latitude !== undefined ? latitude : officeLocation.coordinates.latitude,
        longitude: longitude !== undefined ? longitude : officeLocation.coordinates.longitude
      };
    }

    // Update office location
    officeLocation = await OfficeLocation.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).populate("createdBy", "name.first name.last employeeId role");
console.log(officeLocation)
    res.status(200).json({
      success: true,
      message: "Office location updated successfully",
      officeLocation
    });

  } catch (error) {
    console.error("Update office location error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating office location",
      error: error.message
    });
  }
};

// Delete Office Location (HR Only)
export const deleteOfficeLocation = async (req, res) => {
  try {
    const officeLocation = await OfficeLocation.findById(req.params.id);

    if (!officeLocation) {
      return res.status(404).json({
        success: false,
        message: "Office location not found"
      });
    }

    await OfficeLocation.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Office location deleted successfully"
    });

  } catch (error) {
    console.error("Delete office location error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting office location",
      error: error.message
    });
  }
};