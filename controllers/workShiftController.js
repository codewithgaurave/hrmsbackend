import WorkShift from "../models/WorkShift.js";

// Create WorkShift (HR Only)
export const createWorkShift = async (req, res) => {
  try {
    const { name, startTime, endTime, status } = req.body;

    if (!name || !startTime || !endTime) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const newShift = await WorkShift.create({
      name,
      startTime,
      endTime,
      status,
      createdBy: req.employee._id,
    });

    res.status(201).json({ message: "Work shift created", shift: newShift });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all shifts
export const getWorkShiftsWithoutFilters = async (req, res) => {
  try {
    const shifts = await WorkShift.find({createdBy:req.employee._id}).populate("createdBy", "name.first name.last employeeId role");
    res.json(shifts);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all WorkShifts with filters
export const getWorkShifts = async (req, res) => {
  try {
    const {
      search,
      status,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Build filter object
    const filter = { createdBy: req.employee._id };

    // Search filter (name)
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const shifts = await WorkShift.find(filter)
      .populate("createdBy", "name.first name.last employeeId role")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination info
    const totalCount = await WorkShift.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      shifts,
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
    console.error("Get work shifts error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get single shift
export const getWorkShiftById = async (req, res) => {
  try {
    const shift = await WorkShift.findById(req.params.id).populate("createdBy", "name.first name.last employeeId");
    if (!shift) return res.status(404).json({ message: "Work shift not found" });

    res.json(shift);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update shift (HR Only)
export const updateWorkShift = async (req, res) => {
  try {
    const { name, startTime, endTime, status } = req.body;

    const updatedShift = await WorkShift.findByIdAndUpdate(
      req.params.id,
      { name, startTime, endTime, status },
      { new: true },

    );

    if (!updatedShift) return res.status(404).json({ message: "Work shift not found" });

    res.json({ message: "Work shift updated", shift: updatedShift });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete shift (HR Only)
export const deleteWorkShift = async (req, res) => {
  try {
    const deletedShift = await WorkShift.findByIdAndDelete(req.params.id);
    if (!deletedShift) return res.status(404).json({ message: "Work shift not found" });

    res.json({ message: "Work shift deleted",
        deletedShift:deletedShift
     });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
