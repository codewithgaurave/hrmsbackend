import Designation from "../models/Designation.js";

// Create Designation (HR Only)
export const createDesignation = async (req, res) => {
  try {
    const { title, description, status } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const exists = await Designation.findOne({ title });
    if (exists) {
      return res.status(400).json({ message: "Designation already exists" });
    }

    const designation = await Designation.create({
      title,
      description,
      status,
      createdBy: req.employee._id,
    });

    res.status(201).json({ message: "Designation created", designation });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Designations
export const getDesignationsWithoutFilters = async (req, res) => {
  try {
    const designations = await Designation.find().populate(
      "createdBy",
      "name.first name.last employeeId role"
    );
    res.json(designations);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Designations with filters
export const getDesignations = async (req, res) => {
  try {
    const {
      search,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
      createdBy
    } = req.query;

    // Build filter object
    const filter = {};

    // Search filter (title or description)
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Created by filter
    if (createdBy) {
      filter.createdBy = createdBy;
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const designations = await Designation.find(filter)
      .populate("createdBy", "name.first name.last employeeId role")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination info
    const totalCount = await Designation.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      designations,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error("Get designations error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get single Designation
export const getDesignationById = async (req, res) => {
  try {
    const designation = await Designation.findById(req.params.id).populate(
      "createdBy",
      "name.first name.last employeeId"
    );

    if (!designation) {
      return res.status(404).json({ message: "Designation not found" });
    }

    res.json(designation);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update Designation (HR Only)
export const updateDesignation = async (req, res) => {
  try {
    const { title, description, status } = req.body;

    const updated = await Designation.findByIdAndUpdate(
      req.params.id,
      { title, description, status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Designation not found" });
    }

    res.json({ message: "Designation updated", designation: updated });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete Designation (HR Only)
export const deleteDesignation = async (req, res) => {
  try {
    const deleted = await Designation.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Designation not found" });
    }

    res.json({ message: "Designation deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
