// /controllers/quickStats.js 

import Attendance from "../models/Attendance.js";
import Leave from "../models/Leave.js";
import Task from "../models/Task.js";
import Employee from "../models/Employee.js";
import LeavePolicy from "../models/LeavePolicy.js";

// 📌 Get Employee Quick Stats (for regular employees)
export const getEmployeeQuickStats = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const currentDate = new Date();
    
    // Get current month start and end dates
    const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const currentMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    // 1. Get Present Days Count for current month
    const presentDays = await Attendance.countDocuments({
      employee: employeeId,
      date: {
        $gte: currentMonthStart,
        $lte: currentMonthEnd
      },
      status: "Present"
    });

    // 2. Get Remaining Leaves (Calculate based on leave policy)
    const currentYearStart = new Date(currentDate.getFullYear(), 0, 1);
    const currentYearEnd = new Date(currentDate.getFullYear(), 11, 31);

    // Get all approved leaves for current year
    const approvedLeaves = await Leave.find({
      employee: employeeId,
      status: "Approved",
      startDate: { $gte: currentYearStart },
      endDate: { $lte: currentYearEnd }
    });

    // Calculate total leave days taken
    let totalLeaveDaysTaken = 0;
    approvedLeaves.forEach(leave => {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
      totalLeaveDaysTaken += diffDays;
    });

    // Get total allowed leaves from policy (assuming 12 as default if no policy found)
    const leavePolicy = await LeavePolicy.findOne({ 
      leaveType: "Casual" 
    });

    const totalAllowedLeaves = leavePolicy ? leavePolicy.maxLeavesPerYear : 12;
    const remainingLeaves = Math.max(0, totalAllowedLeaves - totalLeaveDaysTaken);

    // 3. Get Pending Tasks (all tasks that are not completed or approved)
    const pendingTasks = await Task.countDocuments({
      assignedTo: employeeId,
      isActive: true,
      status: { 
        $in: ["New", "Assigned", "In Progress", "Pending", "Rejected"] 
      }
    });

    // 4. Calculate Performance for current month
    const performance = await calculateEmployeePerformance(employeeId, currentMonthStart, currentMonthEnd);

    res.json({
      success: true,
      stats: {
        presentDays,
        remainingLeaves,
        pendingTasks,
        performance: performance.overall
      },
      details: {
        month: currentDate.toLocaleString('default', { month: 'long' }),
        year: currentDate.getFullYear(),
        totalAllowedLeaves,
        leavesTaken: totalLeaveDaysTaken,
        performanceBreakdown: performance
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// 📌 Get Team Leader Quick Stats (for Team Leaders and HR Managers)
export const getTeamLeaderQuickStats = async (req, res) => {
  try {
    const currentUser = req.employee;
    const currentDate = new Date();
    
    // Get today's date range
    const todayStart = new Date(currentDate);
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date(currentDate);
    todayEnd.setHours(23, 59, 59, 999);

    // Get current month start and end dates
    const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const currentMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    // Get team members based on role
    let teamMembers = [];
    
    if (currentUser.role === "HR_Manager") {
      // HR Manager can see all active employees except other HR Managers
      teamMembers = await Employee.find({
        isActive: true,
        role: { $ne: "HR_Manager" }
      }).select('_id name employeeId designation department');
      
    } else if (currentUser.role === "Team_Leader") {
      // Team Leader can see employees who report to them
      teamMembers = await Employee.find({
        isActive: true,
        manager: currentUser._id
      }).select('_id name employeeId designation department');
    }

    const teamMemberIds = teamMembers.map(member => member._id);

    // If no team members, return empty stats
    if (teamMemberIds.length === 0) {
      return res.json({
        success: true,
        stats: {
          teamMembersPresent: 0,
          pendingTeamTasks: 0,
          totalLeaveRequests: 0,
          teamPerformance: 0
        },
        teamSize: 0
      });
    }

    // 1. Team Members Present Today
    const teamMembersPresent = await Attendance.countDocuments({
      employee: { $in: teamMemberIds },
      date: {
        $gte: todayStart,
        $lte: todayEnd
      },
      status: "Present"
    });

    // 2. Pending Team Tasks (tasks assigned to team members that are not completed/approved)
    const pendingTeamTasks = await Task.countDocuments({
      assignedTo: { $in: teamMemberIds },
      isActive: true,
      status: { 
        $in: ["New", "Assigned", "In Progress", "Pending", "Rejected"] 
      }
    });

    // 3. Total Leave Requests (pending leave requests from team members)
    const totalLeaveRequests = await Leave.countDocuments({
      employee: { $in: teamMemberIds },
      status: "Pending"
    });

    // 4. Team Performance (average performance of all team members)
    const teamPerformance = await calculateTeamPerformance(teamMemberIds, currentMonthStart, currentMonthEnd);

    res.json({
      success: true,
      stats: {
        teamMembersPresent,
        pendingTeamTasks,
        totalLeaveRequests,
        teamPerformance: teamPerformance.overall
      },
      details: {
        teamSize: teamMembers.length,
        month: currentDate.toLocaleString('default', { month: 'long' }),
        year: currentDate.getFullYear(),
        performanceBreakdown: teamPerformance
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Helper function to calculate employee performance
const calculateEmployeePerformance = async (employeeId, monthStart, monthEnd) => {
  try {
    // Calculate Attendance Performance (50% weightage)
    const totalWorkingDays = await getTotalWorkingDays(monthStart, monthEnd);
    const presentDaysCount = await Attendance.countDocuments({
      employee: employeeId,
      date: { $gte: monthStart, $lte: monthEnd },
      status: "Present"
    });

    const attendanceScore = totalWorkingDays > 0 ? (presentDaysCount / totalWorkingDays) * 100 : 0;
    const attendancePerformance = Math.min(attendanceScore, 100);

    // Calculate Task Performance (50% weightage)
    const totalTasks = await Task.countDocuments({
      assignedTo: employeeId,
      isActive: true,
      createdAt: { $gte: monthStart, $lte: monthEnd }
    });

    const completedTasks = await Task.countDocuments({
      assignedTo: employeeId,
      isActive: true,
      status: { $in: ["Completed", "Approved"] },
      createdAt: { $gte: monthStart, $lte: monthEnd }
    });

    // Fix: If no tasks assigned, task performance should be 0, not 100
    const taskScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const taskPerformance = Math.min(taskScore, 100);

    // Calculate Overall Performance (50% attendance + 50% tasks)
    const overallPerformance = Math.round((attendancePerformance * 0.5) + (taskPerformance * 0.5));

    return {
      overall: overallPerformance,
      attendance: Math.round(attendancePerformance),
      tasks: Math.round(taskPerformance),
      breakdown: {
        presentDays: presentDaysCount,
        totalWorkingDays: totalWorkingDays,
        completedTasks: completedTasks,
        totalTasks: totalTasks
      }
    };
  } catch (error) {
    console.error("Employee performance calculation error:", error);
    return {
      overall: 0,
      attendance: 0,
      tasks: 0,
      breakdown: {
        presentDays: 0,
        totalWorkingDays: 0,
        completedTasks: 0,
        totalTasks: 0
      }
    };
  }
};

// Helper function to calculate team performance
// Debug logging in team performance
const calculateTeamPerformance = async (teamMemberIds, monthStart, monthEnd) => {
  try {
    let totalOverallPerformance = 0;
    let totalAttendancePerformance = 0;
    let totalTaskPerformance = 0;
    let activeMemberCount = 0;

    console.log(`Calculating performance for ${teamMemberIds.length} team members`);
    
    // Calculate performance for each team member
    for (const memberId of teamMemberIds) {
      const memberPerformance = await calculateEmployeePerformance(memberId, monthStart, monthEnd);
      
      console.log(`Member ${memberId}:`, {
        overall: memberPerformance.overall,
        attendance: memberPerformance.attendance,
        tasks: memberPerformance.tasks,
        breakdown: memberPerformance.breakdown
      });
      
      // Only count members who have some activity (tasks or attendance)
      const hasActivity = memberPerformance.breakdown.totalTasks > 0 || memberPerformance.breakdown.presentDays > 0;
      
      if (hasActivity) {
        totalOverallPerformance += memberPerformance.overall;
        totalAttendancePerformance += memberPerformance.attendance;
        totalTaskPerformance += memberPerformance.tasks;
        activeMemberCount++;
      }
    }

    // Calculate averages
    const averageOverallPerformance = activeMemberCount > 0 ? Math.round(totalOverallPerformance / activeMemberCount) : 0;
    const averageAttendancePerformance = activeMemberCount > 0 ? Math.round(totalAttendancePerformance / activeMemberCount) : 0;
    const averageTaskPerformance = activeMemberCount > 0 ? Math.round(totalTaskPerformance / activeMemberCount) : 0;

    console.log(`Final Team Performance:`, {
      averageOverallPerformance,
      averageAttendancePerformance,
      averageTaskPerformance,
      activeMemberCount
    });

    return {
      overall: averageOverallPerformance,
      attendance: averageAttendancePerformance,
      tasks: averageTaskPerformance,
      teamSize: teamMemberIds.length,
      activeMembers: activeMemberCount
    };
  } catch (error) {
    console.error("Team performance calculation error:", error);
    return {
      overall: 0,
      attendance: 0,
      tasks: 0,
      teamSize: teamMemberIds.length,
      activeMembers: 0
    };
  }
};


// Helper function to get total working days in a month (excluding weekends)
const getTotalWorkingDays = async (startDate, endDate) => {
  try {
    let workingDaysCount = 0;
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      // Exclude weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysCount++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return workingDaysCount;
  } catch (error) {
    console.error("Working days calculation error:", error);
    return 22; // Default average working days
  }
};