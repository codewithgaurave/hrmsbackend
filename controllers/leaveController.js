// controllers/leaveController.js
import Employee from "../models/Employee.js";
import Leave from "../models/Leave.js";
import LeavePolicy from "../models/LeavePolicy.js";

// Helper function to calculate working days between two dates (excluding weekends)
const calculateWorkingDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Sunday (0) and Saturday (6)
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
};

// Helper function to get employee's used leaves for a specific type and year
const getUsedLeaves = async (employeeId, leaveType, year) => {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31);
  
  const leaves = await Leave.find({
    employee: employeeId,
    leaveType,
    status: "Approved",
    startDate: { $gte: startOfYear },
    endDate: { $lte: endOfYear }
  });
  
  // Calculate total working days from all approved leaves
  return leaves.reduce((total, leave) => {
    return total + calculateWorkingDays(leave.startDate, leave.endDate);
  }, 0);
};


// Helper function to calculate total calendar days (including weekends)
const calculateTotalDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const timeDiff = end.getTime() - start.getTime();
  const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates
  return dayDiff;
};

// Helper function to get employee's used leaves DAYS for a specific type and year
const getUsedLeaveDays = async (employeeId, leaveType, year) => {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31);
  
  const leaves = await Leave.find({
    employee: employeeId,
    leaveType,
    status: "Approved",
    startDate: { $gte: startOfYear },
    endDate: { $lte: endOfYear }
  });
  
  // Calculate total calendar days from all approved leaves
  return leaves.reduce((total, leave) => {
    return total + calculateTotalDays(leave.startDate, leave.endDate);
  }, 0);
};

// Helper function to calculate comprehensive leave statistics
const calculateLeaveStatistics = async (employeeId, year) => {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31);

  // Get all leaves for the employee in the current year
  const allLeaves = await Leave.find({
    employee: employeeId,
    startDate: { $gte: startOfYear },
    endDate: { $lte: endOfYear }
  }).lean();

  // Calculate statistics by REQUEST COUNT
  const requestStats = {
    total: allLeaves.length,
    approved: allLeaves.filter(leave => leave.status === "Approved").length,
    pending: allLeaves.filter(leave => leave.status === "Pending").length,
    rejected: allLeaves.filter(leave => leave.status === "Rejected").length
  };

  // Calculate statistics by DAY COUNT
  const dayStats = {
    totalRequested: allLeaves.reduce((total, leave) => {
      return total + calculateTotalDays(leave.startDate, leave.endDate);
    }, 0),
    totalApproved: allLeaves.reduce((total, leave) => {
      if (leave.status === "Approved") {
        return total + calculateTotalDays(leave.startDate, leave.endDate);
      }
      return total;
    }, 0),
    totalPending: allLeaves.reduce((total, leave) => {
      if (leave.status === "Pending") {
        return total + calculateTotalDays(leave.startDate, leave.endDate);
      }
      return total;
    }, 0),
    totalRejected: allLeaves.reduce((total, leave) => {
      if (leave.status === "Rejected") {
        return total + calculateTotalDays(leave.startDate, leave.endDate);
      }
      return total;
    }, 0)
  };

  return {
    requestStats,
    dayStats
  };
};

// Helper function to calculate total experience
const calculateExperience = (dateOfJoining) => {
  if (!dateOfJoining) return "0 years";
  
  const joinDate = new Date(dateOfJoining);
  const today = new Date();
  
  let years = today.getFullYear() - joinDate.getFullYear();
  let months = today.getMonth() - joinDate.getMonth();
  
  if (months < 0) {
    years--;
    months += 12;
  }
  
  return `${years} years ${months} months`;
};



//  Create Leave Controller
export const createLeave = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;

    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({
        message: "Leave type, start date, and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res
        .status(400)
        .json({ message: "End date must be after or same as start date" });
    }

    if (start < new Date().setHours(0, 0, 0, 0)) {
      return res
        .status(400)
        .json({ message: "Cannot apply for leave in the past" });
    }

    //  Check leave policy
    const leavePolicy = await LeavePolicy.findOne({ leaveType });
    if (!leavePolicy) {
      return res.status(400).json({
        message: `Leave Policy for ${leaveType} not found || Select leaveType according to our LeavePolicy`,
      });
    }

    //  Gender restriction check
    if (
      leavePolicy.genderRestriction !== "All" &&
      leavePolicy.genderRestriction !== req.employee.gender
    ) {
      return res.status(400).json({
        message: `This leave type is restricted to ${leavePolicy.genderRestriction} employees only`,
      });
    }

    //  Calculate total requested days
    const totalDays = calculateTotalDays(start, end);
    if (totalDays <= 0) {
      return res
        .status(400)
        .json({ message: "Leave must include at least one day" });
    }

    //  Get this year
    const currentYear = new Date().getFullYear();

    //  Count used leave days for same type
    const usedDays = await getUsedLeaveDays(req.employee._id, leaveType, currentYear);

    const availableDays = leavePolicy.maxLeavesPerYear - usedDays;

    //  If requested exceeds available
    if (totalDays > availableDays) {
      return res.status(400).json({
        message: `Insufficient ${leaveType} leave balance. Available: ${availableDays} days, Requested: ${totalDays} days`,
      });
    }

    //  Check overlapping leave requests (Pending / Approved)
    const overlappingLeave = await Leave.findOne({
      employee: req.employee._id,
      status: { $in: ["Pending", "Approved"] },
      $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
    });

    if (overlappingLeave) {
      return res
        .status(400)
        .json({ message: "You already have a leave request for these dates" });
    }

    //  Create leave request
    const leave = await Leave.create({
      employee: req.employee._id,
      leaveType,
      startDate: start,
      endDate: end,
      reason,
    });

    const populatedLeave = await Leave.findById(leave._id)
      .populate("employee", "name.first name.last employeeId designation role");

    res.status(201).json({
      message: "Leave request created successfully",
      leave: populatedLeave,
      totalDays,
      usedDays,
      availableDays: availableDays - totalDays,
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error while creating leave request",
      error: error.message,
    });
  }
};



// Get all leaves of mt teams added by current user without filters
export const getMyAndTeamLeavesWithoutFilters = async (req, res) => {
  try {
    // Find employees added by current user (team members)
    const addedEmployees = await Employee.find({$or:[{addedBy: req.employee._id},{manager: req.employee._id}] }).select("_id");

    // Combine own ID + team member IDs
    const employeeIds = [req.employee._id, ...addedEmployees.map(e => e._id)];

    // Fetch all leaves belonging to those employees
    const leaves = await Leave.find({ employee: { $in: employeeIds } })
      .populate("employee", "name.first name.last employeeId designation role")
      .populate("approvedBy", "name.first name.last employeeId role")
      .populate("rejectedBy", "name.first name.last employeeId role");

    // Add calculated days to each leave
    const leavesWithDays = leaves.map(leave => ({
      ...leave.toObject(),
      totalWorkingDays: calculateWorkingDays(leave.startDate, leave.endDate),
      totalCalendarDays: calculateTotalDays(leave.startDate, leave.endDate)
    }));

    // Calculate comprehensive statistics
    const requestStats = {
      total: leavesWithDays.length,
      approved: leavesWithDays.filter(leave => leave.status === "Approved").length,
      pending: leavesWithDays.filter(leave => leave.status === "Pending").length,
      rejected: leavesWithDays.filter(leave => leave.status === "Rejected").length
    };

    const dayStats = {
      totalWorkingDays: leavesWithDays.reduce((total, leave) => total + leave.totalWorkingDays, 0),
      totalApprovedWorkingDays: leavesWithDays
        .filter(leave => leave.status === "Approved")
        .reduce((total, leave) => total + leave.totalWorkingDays, 0),
      totalPendingWorkingDays: leavesWithDays
        .filter(leave => leave.status === "Pending")
        .reduce((total, leave) => total + leave.totalWorkingDays, 0),
      totalRejectedWorkingDays: leavesWithDays
        .filter(leave => leave.status === "Rejected")
        .reduce((total, leave) => total + leave.totalWorkingDays, 0),
      totalCalendarDays: leavesWithDays.reduce((total, leave) => total + leave.totalCalendarDays, 0),
      totalApprovedCalendarDays: leavesWithDays
        .filter(leave => leave.status === "Approved")
        .reduce((total, leave) => total + leave.totalCalendarDays, 0)
    };

    res.status(200).json({
      success: true,
      message: "Leaves fetched successfully",
      total: leavesWithDays.length,
      leaves: leavesWithDays,
      statistics: {
        byRequest: requestStats,
        byDays: dayStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error while fetching leaves",
      error: error.message,
    });
  }
};

// Get all leaves (HR can see all, employees see their own)
export const getLeaves = async (req, res) => {
  try {
    let leaves;

    if (req.employee.role === "HR_Manager") {
      leaves = await Leave.find()
        .populate("employee", "name.first name.last employeeId designation role")
        .populate("approvedBy", "name.first name.last employeeId role")
        .populate("rejectedBy", "name.first name.last employeeId role");
    } else {
      leaves = await Leave.find({ employee: req.employee._id })
        .populate("employee", "name.first name.last employeeId designation role")
        .populate("approvedBy", "name.first name.last employeeId role")
        .populate("rejectedBy", "name.first name.last employeeId role");
    }

    // Add calculated days to each leave
    const leavesWithDays = leaves.map(leave => ({
      ...leave.toObject(),
      totalDays: calculateTotalDays(leave.startDate, leave.endDate)
    }));

    res.json(leavesWithDays);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all leaves of self + employees added by current user with comprehensive stats
export const getMyAndTeamLeaves = async (req, res) => {
  try {
    const {
      status,
      leaveType,
      employeeId,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Find employees added by current user (team members)
    const addedEmployees = await Employee.find({$or:[{addedBy: req.employee._id},{manager: req.employee._id}] }).select("_id");

    // Combine own ID + team member IDs
    const employeeIds = [...addedEmployees.map(e => e._id)];

    // Build filter object
    const filter = { employee: { $in: employeeIds } };

    // Status filter
    if (status && status !== "All") {
      filter.status = status;
    }

    // Leave type filter
    if (leaveType && leaveType !== "All") {
      filter.leaveType = leaveType;
    }

    // Employee filter
    if (employeeId) {
      filter.employee = employeeId;
    }

    // Date range filter
    if (startDate) {
      filter.startDate = { $gte: new Date(startDate) };
    }
    if (endDate) {
      filter.endDate = { $lte: new Date(endDate) };
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const leaves = await Leave.find(filter)
      .populate("employee", "name.first name.last employeeId designation role")
      .populate("approvedBy", "name.first name.last employeeId role")
      .populate("rejectedBy", "name.first name.last employeeId role")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Add calculated days to each leave
    const leavesWithDays = leaves.map(leave => ({
      ...leave.toObject(),
      totalDays: calculateTotalDays(leave.startDate, leave.endDate)
    }));

    // Get total count for pagination info
    const totalCount = await Leave.countDocuments(filter);

    // Get comprehensive statistics for all matching records
    const allLeavesForStats = await Leave.find(filter).lean();
    
    // Calculate statistics by REQUEST COUNT
    const requestStats = {
      total: totalCount,
      approved: allLeavesForStats.filter(leave => leave.status === "Approved").length,
      pending: allLeavesForStats.filter(leave => leave.status === "Pending").length,
      rejected: allLeavesForStats.filter(leave => leave.status === "Rejected").length
    };

    // Calculate statistics by DAY COUNT
    const dayStats = {
      totalRequested: allLeavesForStats.reduce((total, leave) => 
        total + calculateTotalDays(leave.startDate, leave.endDate), 0),
      totalApproved: allLeavesForStats
        .filter(leave => leave.status === "Approved")
        .reduce((total, leave) => total + calculateTotalDays(leave.startDate, leave.endDate), 0),
      totalPending: allLeavesForStats
        .filter(leave => leave.status === "Pending")
        .reduce((total, leave) => total + calculateTotalDays(leave.startDate, leave.endDate), 0),
      totalRejected: allLeavesForStats
        .filter(leave => leave.status === "Rejected")
        .reduce((total, leave) => total + calculateTotalDays(leave.startDate, leave.endDate), 0)
    };

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      success: true,
      message: "Leaves fetched successfully",
      total: totalCount,
      leaves: leavesWithDays,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        limit: limitNum
      },
      statistics: {
        byRequests: requestStats,    // Kitni requests
        byDays: dayStats             // Kitne days
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error while fetching leaves",
      error: error.message,
    });
  }
};

// Get employee's leave balance (DAYS BASED)
export const getLeaveBalance = async (req, res) => {
  try {
    const employeeId = req.params.employeeId || req.employee._id;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Get all leave policies
    const leavePolicies = await LeavePolicy.find({});
    
    const balance = [];

    for (const policy of leavePolicies) {
      const usedDays = await getUsedLeaveDays(employeeId, policy.leaveType, year);
      const availableDays = policy.maxLeavesPerYear - usedDays;

      balance.push({
        leaveType: policy.leaveType,
        maxLeavesPerYear: policy.maxLeavesPerYear,
        usedDays: usedDays,
        availableDays: availableDays,
        carryForward: policy.carryForward,
        genderRestriction: policy.genderRestriction,
        utilizationPercentage: policy.maxLeavesPerYear > 0 ? 
          Math.round((usedDays / policy.maxLeavesPerYear) * 100) : 0
      });
    }

    res.json({
      success: true,
      year,
      balance
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};


// Get my leaves with comprehensive stats
export const getMyLeaves = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const currentYear = new Date().getFullYear();

    // Get employee details
    const employee = await Employee.findById(employeeId)
      .select("name employeeId designation department email phone gender dateOfJoining")
      .lean();

    if (!employee) {
      return res.status(404).json({ 
        success: false,
        message: "Employee not found" 
      });
    }

    // Get all leave policies
    const leavePolicies = await LeavePolicy.find().lean();

    // Get all leaves for the employee
    const leaves = await Leave.find({ employee: employeeId })
      .populate("employee", "name.first name.last employeeId designation role")
      .populate("approvedBy", "name.first name.last employeeId role")
      .populate("rejectedBy", "name.first name.last employeeId role")
      .sort({ createdAt: -1 })
      .lean();

    // Add calculated days to each leave
    const leavesWithDays = leaves.map(leave => ({
      ...leave,
      totalDays: calculateTotalDays(leave.startDate, leave.endDate)
    }));

    // Calculate comprehensive leave statistics
    const leaveStats = await calculateLeaveStatistics(employeeId, currentYear);

    // Calculate leave balance
    const balance = [];
    let totalAvailable = 0;
    let totalUsed = 0;

    for (const policy of leavePolicies) {
      const usedDays = await getUsedLeaveDays(employeeId, policy.leaveType, currentYear);
      const availableDays = policy.maxLeavesPerYear - usedDays;

      totalAvailable += availableDays;
      totalUsed += usedDays;

      balance.push({
        leaveType: policy.leaveType,
        maxLeavesPerYear: policy.maxLeavesPerYear,
        usedDays: usedDays,
        availableDays: availableDays,
        carryForward: policy.carryForward,
        genderRestriction: policy.genderRestriction,
        description: policy.description,
        utilizationPercentage: policy.maxLeavesPerYear > 0 ? 
          Math.round((usedDays / policy.maxLeavesPerYear) * 100) : 0
      });
    }

    // Structure the response
    const response = {
      success: true,
      message: "Employee leaves data fetched successfully",
      employee: {
        _id: employee._id,
        name: employee.name,
        employeeId: employee.employeeId,
        designation: employee.designation,
        department: employee.department,
        email: employee.email,
        phone: employee.phone,
        gender: employee.gender,
        dateOfJoining: employee.dateOfJoining,
        totalExperience: calculateExperience(employee.dateOfJoining)
      },
      leaveSummary: {
        currentYear: currentYear,
        // Request count statistics
        totalRequests: leaveStats.requestStats.total,
        approvedRequests: leaveStats.requestStats.approved,
        pendingRequests: leaveStats.requestStats.pending,
        rejectedRequests: leaveStats.requestStats.rejected,
        // Day count statistics
        totalRequestedDays: leaveStats.dayStats.totalRequested,
        totalApprovedDays: leaveStats.dayStats.totalApproved,
        totalPendingDays: leaveStats.dayStats.totalPending,
        totalRejectedDays: leaveStats.dayStats.totalRejected,
        // Balance information
        totalAvailableDays: totalAvailable,
        totalUsedDays: totalUsed
      },
      leaveBalance: balance,
      leaves: leavesWithDays.map(leave => ({
        _id: leave._id,
        leaveType: leave.leaveType,
        startDate: leave.startDate,
        endDate: leave.endDate,
        totalDays: leave.totalDays,
        reason: leave.reason,
        status: leave.status,
        appliedOn: leave.createdAt,
        approvedBy: leave.approvedBy ? {
          name: leave.approvedBy.name,
          employeeId: leave.approvedBy.employeeId
        } : null,
        rejectedBy: leave.rejectedBy ? {
          name: leave.rejectedBy.name,
          employeeId: leave.rejectedBy.employeeId
        } : null,
        approvedOn: leave.updatedAt
      }))
    };

    res.json(response);
  } catch (error) {
    console.error("Get my leaves error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// Get single leave by ID (HR can access all, employee only their own)
export const getLeaveById = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate("employee", "name.first name.last employeeId designation role")
      .populate("approvedBy", "name.first name.last employeeId role")
      .populate("rejectedBy", "name.first name.last employeeId role");

    if (!leave) return res.status(404).json({ message: "Leave not found" });

    if (req.employee.role !== "HR_Manager" && leave.employee._id.toString() !== req.employee._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Add calculated days to the leave
    const leaveWithDays = {
      ...leave.toObject(),
      totalWorkingDays: calculateWorkingDays(leave.startDate, leave.endDate),
      totalCalendarDays: calculateTotalDays(leave.startDate, leave.endDate)
    };

    res.json(leaveWithDays);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// HR Approves or Rejects leave
export const updateLeaveStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: "Leave not found" });

    // 🟡 Check if leave is already processed
    if (leave.status === "Approved") {
      return res.status(400).json({ message: "Leave has already been approved" });
    }
    if (leave.status === "Rejected") {
      return res.status(400).json({ message: "Leave has already been rejected" });
    }

    // Calculate days for this leave request
    const totalWorkingDays = calculateWorkingDays(leave.startDate, leave.endDate);
    const totalCalendarDays = calculateTotalDays(leave.startDate, leave.endDate);

    // 🟢 If approving, validate available leave balance
    if (status === "Approved") {
      const currentYear = new Date().getFullYear();
      const usedLeaves = await getUsedLeaves(leave.employee, leave.leaveType, currentYear);

      const leavePolicy = await LeavePolicy.findOne({ 
        leaveType: leave.leaveType,
      });

      if (leavePolicy) {
        const availableLeaves = leavePolicy.maxLeavesPerYear - usedLeaves;
        if (totalWorkingDays > availableLeaves) {
          return res.status(400).json({ 
            message: `Cannot approve leave. Insufficient balance. Available: ${availableLeaves} days, Requested: ${totalWorkingDays} days` 
          });
        }
      }

      leave.approvedBy = req.employee._id;
      leave.rejectedBy = null;
    }

    // 🔴 If rejected, store who rejected it
    if (status === "Rejected") {
      leave.rejectedBy = req.employee._id;
      leave.approvedBy = null;
    }

    leave.status = status;
    await leave.save();

    const populatedLeave = await Leave.findById(leave._id)
      .populate("employee", "name.first name.last employeeId designation role")
      .populate("approvedBy", "name.first name.last employeeId role")
      .populate("rejectedBy", "name.first name.last employeeId role");

    // Add calculated days to the response
    const responseLeave = {
      ...populatedLeave.toObject(),
      totalWorkingDays: totalWorkingDays,
      totalCalendarDays: totalCalendarDays
    };

    res.json({ 
      message: `Leave ${status.toLowerCase()} successfully`, 
      leave: responseLeave 
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// Employee can cancel leave request if Pending
export const cancelLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);

    if (!leave) return res.status(404).json({ message: "Leave not found" });

    if (leave.employee.toString() !== req.employee._id.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (leave.status !== "Pending") {
      return res.status(400).json({ message: "Only pending leaves can be cancelled" });
    }

    await Leave.findByIdAndDelete(req.params.id);
    
    res.json({ message: "Leave request cancelled successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get available leave types for employee (considering gender restrictions)
export const getAvailableLeaveTypes = async (req, res) => {
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
      .select("leaveType maxLeavesPerYear genderRestriction carryForward description")
      .sort({ leaveType: 1 });

    res.json({
      success: true,
      availableLeaveTypes: availablePolicies
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};