import EmploymentStatus from "../models/EmploymentStatus.js";

// Create Employment Status (HR Only)
export const createEmploymentStatus = async (req, res) => {
  try {
    const { title, description, status } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const exists = await EmploymentStatus.findOne({ title });
    if (exists) {
      return res.status(400).json({ message: "Employment status already exists" });
    }

    const empStatus = await EmploymentStatus.create({
      title,
      description,
      status,
      createdBy: req.employee._id,
    });

    res.status(201).json({ message: "Employment status created", employmentStatus: empStatus });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Employment Statuses
export const getEmploymentStatusesWithoutFilters = async (req, res) => {
  try {
    const statuses = await EmploymentStatus.find().populate(
      "createdBy",
      "name.first name.last employeeId role"
    );
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Employment Statuses with filters
export const getEmploymentStatuses = async (req, res) => {
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
    const employmentStatuses = await EmploymentStatus.find(filter)
      .populate("createdBy", "name.first name.last employeeId role")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination info
    const totalCount = await EmploymentStatus.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      employmentStatuses,
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
    console.error("Get employment statuses error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get single Employment Status
export const getEmploymentStatusById = async (req, res) => {
  try {
    const status = await EmploymentStatus.findById(req.params.id).populate(
      "createdBy",
      "name.first name.last employeeId"
    );

    if (!status) {
      return res.status(404).json({ message: "Employment status not found" });
    }

    res.json(status);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update Employment Status (HR Only)
export const updateEmploymentStatus = async (req, res) => {
  try {
    const { title, description, status } = req.body;

    const updated = await EmploymentStatus.findByIdAndUpdate(
      req.params.id,
      { title, description, status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Employment status not found" });
    }

    res.json({ message: "Employment status updated", employmentStatus: updated });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete Employment Status (HR Only)
export const deleteEmploymentStatus = async (req, res) => {
  try {
    const deleted = await EmploymentStatus.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Employment status not found" });
    }

    res.json({ message: "Employment status deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
