import LeavePolicy from '../models/LeavePolicy.js';

// Create LeavePolicy (HR Only)
export const createLeavePolicy = async (req, res) => {
  try {
    const { leaveType, maxLeavesPerYear, genderRestriction, carryForward, description } = req.body;

    if (!leaveType || !maxLeavesPerYear) {
      return res.status(400).json({ message: "Leave type and max leaves per year are required" });
    }

    // Check if leave policy already exists for this type
    const existingPolicy = await LeavePolicy.findOne({ leaveType });
    if (existingPolicy) {
      return res.status(400).json({ message: `Leave policy for ${leaveType} already exists` });
    }

    const newPolicy = await LeavePolicy.create({
      leaveType,
      maxLeavesPerYear,
      genderRestriction,
      carryForward,
      description,
      createdBy: req.employee._id,
    });

    res.status(201).json({ message: "Leave policy created successfully", policy: newPolicy });
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all leave policies without filters
export const getLeavePoliciesWithoutFilters = async (req, res) => {
  try {
    const policies = await LeavePolicy.find({ createdBy: req.employee._id })
      .populate("createdBy", "name.first name.last employeeId role");
    res.json(policies);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all LeavePolicies with filters
export const getLeavePolicies = async (req, res) => {
  try {
    const {
      search,
      leaveType,
      genderRestriction,
      carryForward,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Build filter object
    const filter = { createdBy: req.employee._id };

    // Search filter (leaveType or description)
    if (search) {
      filter.$or = [
        { leaveType: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    // Leave Type filter
    if (leaveType) {
      filter.leaveType = leaveType;
    }

    // Gender Restriction filter
    if (genderRestriction) {
      filter.genderRestriction = genderRestriction;
    }

    // Carry Forward filter
    if (carryForward) {
      filter.carryForward = carryForward;
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    console.log(filter)
    // Execute query with pagination
    const policies = await LeavePolicy.find(filter)
      .populate("createdBy", "name.first name.last employeeId role")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination info
    const totalCount = await LeavePolicy.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);
    console.log(totalCount)

    res.json({
      policies,
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
    console.error("Get leave policies error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get single policy
export const getLeavePolicyById = async (req, res) => {
  try {
    const policy = await LeavePolicy.findById(req.params.id)
      .populate("createdBy", "name.first name.last employeeId role");
    
    if (!policy) return res.status(404).json({ message: "Leave policy not found" });

    res.json(policy);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get policy by type
export const getLeavePolicyByType = async (req, res) => {
  try {
    const { leaveType } = req.params;
    
    const policy = await LeavePolicy.findOne({ 
      leaveType,
      createdBy: req.employee._id 
    }).populate("createdBy", "name.first name.last employeeId role");

    if (!policy) {
      return res.status(404).json({ message: `Leave policy for ${leaveType} not found` });
    }

    res.json(policy);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update policy (HR Only)
export const updateLeavePolicy = async (req, res) => {
  try {
    const { leaveType, maxLeavesPerYear, genderRestriction, carryForward, description } = req.body;

    // Check if leave policy exists
    const existingPolicy = await LeavePolicy.findById(req.params.id);
    if (!existingPolicy) {
      return res.status(404).json({ message: "Leave policy not found" });
    }

    // Check if leave type is being changed and if new type already exists
    if (leaveType && leaveType !== existingPolicy.leaveType) {
      const typeExists = await LeavePolicy.findOne({ 
        leaveType, 
        _id: { $ne: req.params.id },
        createdBy: req.employee._id 
      });
      
      if (typeExists) {
        return res.status(400).json({ message: `Leave policy for ${leaveType} already exists` });
      }
    }

    const updatedPolicy = await LeavePolicy.findByIdAndUpdate(
      req.params.id,
      { 
        leaveType, 
        maxLeavesPerYear, 
        genderRestriction, 
        carryForward, 
        description 
      },
      { new: true, runValidators: true }
    ).populate("createdBy", "name.first name.last employeeId role");

    res.json({ message: "Leave policy updated successfully", policy: updatedPolicy });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete policy (HR Only)
export const deleteLeavePolicy = async (req, res) => {
  try {
    const deletedPolicy = await LeavePolicy.findByIdAndDelete(req.params.id);
    
    if (!deletedPolicy) return res.status(404).json({ message: "Leave policy not found" });

    res.json({ 
      message: "Leave policy deleted successfully",
      deletedPolicy: deletedPolicy
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get available leave policies for employee (with gender filtering)
export const getAvailableLeavePolicies = async (req, res) => {
  try {
    const employee = req.employee;
    
    let query = {};
    
    // Filter by gender restriction if applicable
    if (employee.gender && employee.gender !== 'Other') {
      query.$or = [
        { genderRestriction: 'All' },
        { genderRestriction: employee.gender }
      ];
    } else {
      query.genderRestriction = 'All';
    }

    const availablePolicies = await LeavePolicy.find(query)
      .populate("createdBy", "name.first name.last employeeId role")
      .sort({ leaveType: 1 });

    res.json(availablePolicies);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};