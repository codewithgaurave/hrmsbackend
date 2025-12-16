import Department from "../models/Department.js";

// Create Department (HR Only)
export const createDepartment = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Department name is required" });
    }

    const exists = await Department.findOne({ name });
    if (exists) {
      return res.status(400).json({ message: "Department already exists" });
    }

    const department = await Department.create({
      name,
      description,
      status,
      createdBy: req.employee._id,
    });

    res.status(201).json({ message: "Department created", department });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Departments
export const getDepartmentsWithoutFilters = async (req, res) => {
  try {
    const departments = await Department.find().populate(
      "createdBy",
      "name.first name.last employeeId role"
    );
    res.json(departments);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Departments with filters
export const getDepartments = async (req, res) => {
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

    // Search filter (name or description)
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
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
    const departments = await Department.find(filter)
      .populate("createdBy", "name.first name.last employeeId role")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination info
    const totalCount = await Department.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      departments,
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
    console.error("Get departments error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// Get single Department
export const getDepartmentById = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id).populate(
      "createdBy",
      "name.first name.last employeeId"
    );

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json(department);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update Department (HR Only)
export const updateDepartment = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const updated = await Department.findByIdAndUpdate(
      req.params.id,
      { name, description, status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json({ message: "Department updated", department: updated });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete Department (HR Only)
export const deleteDepartment = async (req, res) => {
  try {
    const deleted = await Department.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json({ message: "Department deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
