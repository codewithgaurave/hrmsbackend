import mongoose from "mongoose";
import Employee from "../models/Employee.js";
import Attendance from "../models/Attendance.js";
import Department from "../models/Department.js";
import Designation from "../models/Designation.js";
import OfficeLocation from "../models/OfficeLocation.js";
import WorkShift from "../models/WorkShift.js";
import Leave from "../models/Leave.js";
import Event from "../models/Event.js";
import Announcement from "../models/Announcement.js";

// Helper Functions

// Get today's attendance statistics
const getTodayAttendanceStats = async (today) => {
  const totalEmployees = await Employee.countDocuments({ isActive: true });
  
  const todayAttendance = await Attendance.aggregate([
    {
      $match: {
        date: today
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  const stats = {
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
    totalEmployees: totalEmployees
  };

  todayAttendance.forEach(item => {
    switch(item._id) {
      case "Present": stats.present = item.count; break;
      case "Absent": stats.absent = item.count; break;
      case "Late": stats.late = item.count; break;
      case "Half Day": stats.halfDay = item.count; break;
    }
  });

  // Calculate absent employees (total - present)
  stats.absent = totalEmployees - (stats.present + stats.late + stats.halfDay);

  return stats;
};

// Get attendance stats for a period
const getPeriodAttendanceStats = async (startDate, endDate) => {
  const totalEmployees = await Employee.countDocuments({ isActive: true });
  
  const attendanceStats = await Attendance.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalHours: { $sum: "$totalWorkHours" },
        overtimeHours: { $sum: "$overtimeHours" }
      }
    }
  ]);

  const stats = {
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
    totalEmployees: totalEmployees,
    totalHours: 0,
    overtimeHours: 0,
    avgHoursWorked: 0
  };

  let totalRecords = 0;
  attendanceStats.forEach(item => {
    totalRecords += item.count;
    stats.totalHours += item.totalHours || 0;
    stats.overtimeHours += item.overtimeHours || 0;
    
    switch(item._id) {
      case "Present": stats.present = item.count; break;
      case "Absent": stats.absent = item.count; break;
      case "Late": stats.late = item.count; break;
      case "Half Day": stats.halfDay = item.count; break;
    }
  });

  // Calculate average hours worked
  stats.avgHoursWorked = totalRecords > 0 ? (stats.totalHours / totalRecords).toFixed(1) : 0;

  return stats;
};

// Get department-wise employee statistics with attendance rates
const getDepartmentStats = async () => {
  const departmentStats = await Employee.aggregate([
    {
      $match: { isActive: true }
    },
    {
      $lookup: {
        from: "departments",
        localField: "department",
        foreignField: "_id",
        as: "departmentInfo"
      }
    },
    {
      $unwind: "$departmentInfo"
    },
    {
      $group: {
        _id: "$departmentInfo.name",
        employeeCount: { $sum: 1 },
        avgSalary: { $avg: "$salary" }
      }
    },
    {
      $project: {
        department: "$_id",
        employeeCount: 1,
        avgSalary: { $round: ["$avgSalary", 2] },
        _id: 0
      }
    },
    {
      $sort: { employeeCount: -1 }
    }
  ]);

  // Calculate attendance rates for each department
  for (let dept of departmentStats) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const department = await Department.findOne({ name: dept.department });
    if (department) {
      const departmentEmployees = await Employee.find({ 
        department: department._id,
        isActive: true 
      }).distinct('_id');

      if (departmentEmployees.length > 0) {
        const presentCount = await Attendance.countDocuments({
          date: today,
          status: { $in: ["Present", "Late", "Half Day"] },
          employee: { $in: departmentEmployees }
        });

        dept.attendanceRate = Math.round((presentCount / dept.employeeCount) * 100);
      } else {
        dept.attendanceRate = 0;
      }
    } else {
      dept.attendanceRate = 0;
    }
  }

  return departmentStats;
};

// Get attendance trends for charts (last 30 days)
const getAttendanceTrends = async () => {
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  return await Attendance.aggregate([
    {
      $match: {
        date: { $gte: last30Days }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
        },
        present: {
          $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] }
        },
        absent: {
          $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] }
        },
        late: {
          $sum: { $cond: [{ $eq: ["$status", "Late"] }, 1, 0] }
        },
        total: { $sum: 1 }
      }
    },
    {
      $project: {
        date: "$_id.date",
        present: 1,
        absent: 1,
        late: 1,
        total: 1,
        _id: 0
      }
    },
    {
      $sort: { date: 1 }
    }
  ]);
};

// Get leave trends for charts
const getLeaveTrends = async () => {
  const last6Months = new Date();
  last6Months.setMonth(last6Months.getMonth() - 6);

  return await Leave.aggregate([
    {
      $match: {
        createdAt: { $gte: last6Months }
      }
    },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" },
          status: "$status"
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: {
          month: "$_id.month",
          year: "$_id.year"
        },
        pending: {
          $sum: {
            $cond: [{ $eq: ["$_id.status", "Pending"] }, "$count", 0]
          }
        },
        approved: {
          $sum: {
            $cond: [{ $eq: ["$_id.status", "Approved"] }, "$count", 0]
          }
        },
        rejected: {
          $sum: {
            $cond: [{ $eq: ["$_id.status", "Rejected"] }, "$count", 0]
          }
        },
        total: { $sum: "$count" }
      }
    },
    {
      $project: {
        month: {
          $let: {
            vars: {
              monthsInString: [
                "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
              ]
            },
            in: {
              $arrayElemAt: [
                "$$monthsInString",
                { $subtract: ["$_id.month", 1] }
              ]
            }
          }
        },
        year: "$_id.year",
        pending: 1,
        approved: 1,
        rejected: 1,
        total: 1,
        approvalRate: {
          $cond: [
            { $gt: ["$total", 0] },
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$approved", "$total"] },
                    100
                  ]
                },
                1
              ]
            },
            0
          ]
        }
      }
    },
    {
      $sort: { year: 1, month: 1 }
    }
  ]);
};

// Calculate employee growth
const calculateEmployeeGrowth = async () => {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
  const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1);
  const startOfLastYear = new Date(currentYear - 1, 0, 1);
  const endOfLastYear = new Date(currentYear - 1, 11, 31);

  const [
    currentMonthEmployees,
    lastMonthEmployees,
    lastYearEmployees,
    currentYearEmployees
  ] = await Promise.all([
    Employee.countDocuments({
      dateOfJoining: { $gte: startOfCurrentMonth }
    }),
    Employee.countDocuments({
      dateOfJoining: { 
        $gte: startOfLastMonth,
        $lt: startOfCurrentMonth
      }
    }),
    Employee.countDocuments({
      dateOfJoining: {
        $gte: startOfLastYear,
        $lte: endOfLastYear
      }
    }),
    Employee.countDocuments({
      dateOfJoining: { $gte: new Date(currentYear, 0, 1) }
    })
  ]);

  const monthlyChange = lastMonthEmployees > 0 
    ? (((currentMonthEmployees - lastMonthEmployees) / lastMonthEmployees) * 100).toFixed(1)
    : currentMonthEmployees > 0 ? 100 : 0;

  const growthPercentage = lastYearEmployees > 0 
    ? (((currentYearEmployees - lastYearEmployees) / lastYearEmployees) * 100).toFixed(1)
    : currentYearEmployees > 0 ? 100 : 0;

  return {
    growthPercentage: parseFloat(growthPercentage),
    monthlyChange: parseFloat(monthlyChange)
  };
};

// Calculate leave approval rate and utilization
const calculateLeaveApprovalRate = async () => {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const startOfMonth = new Date(currentYear, currentMonth, 1);

  const leaveStats = await Leave.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfMonth }
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalDays: {
          $sum: {
            $ceil: {
              $divide: [
                { $subtract: ["$endDate", "$startDate"] },
                1000 * 60 * 60 * 24
              ]
            }
          }
        }
      }
    }
  ]);

  let total = 0;
  let approved = 0;
  let totalDays = 0;

  leaveStats.forEach(stat => {
    total += stat.count;
    totalDays += stat.totalDays;
    if (stat._id === "Approved") {
      approved = stat.count;
    }
  });

  const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(1) : 0;
  
  // Calculate utilization rate (assuming 2 leaves per employee per month)
  const totalEmployees = await Employee.countDocuments({ isActive: true });
  const maxPossibleLeaves = totalEmployees * 2;
  const utilizationRate = maxPossibleLeaves > 0 
    ? ((totalDays / maxPossibleLeaves) * 100).toFixed(1) 
    : 0;

  return {
    approvalRate: parseFloat(approvalRate),
    utilizationRate: parseFloat(utilizationRate),
    change: "-2.5" // This could be calculated by comparing with previous month
  };
};

// Generate system alerts based on current data
const generateSystemAlerts = (todayAttendance, pendingLeaves) => {
  const alerts = [];
  
  if (todayAttendance.absent > todayAttendance.totalEmployees * 0.1) {
    alerts.push({
      message: "High absenteeism today",
      severity: "warning",
      createdAt: new Date()
    });
  }
  
  if (pendingLeaves > 10) {
    alerts.push({
      message: "High number of pending leave requests",
      severity: "info",
      createdAt: new Date()
    });
  }

  if (todayAttendance.late > todayAttendance.totalEmployees * 0.15) {
    alerts.push({
      message: "Many employees arriving late",
      severity: "warning",
      createdAt: new Date()
    });
  }

  return alerts;
};

// Get department color for charts
const getDepartmentColor = (index) => {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
  ];
  return colors[index % colors.length];
};

// Get detailed analytics for different periods
const getDetailedAnalytics = async (period) => {
  let startDate, endDate = new Date();

  switch (period) {
    case "week":
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "month":
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "quarter":
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case "year":
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
  }

  const [
    attendance,
    leaves,
    departments,
    overtime,
    employeeJoinings
  ] = await Promise.all([
    // Attendance analytics
    Attendance.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            period: {
              $dateToString: {
                format: period === "week" ? "%Y-%m-%d" : "%Y-%m",
                date: "$date"
              }
            }
          },
          present: {
            $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] }
          },
          absent: {
            $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] }
          },
          late: {
            $sum: { $cond: [{ $eq: ["$status", "Late"] }, 1, 0] }
          },
          total: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.period": 1 }
      }
    ]),

    // Leave analytics
    Leave.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            period: {
              $dateToString: {
                format: period === "week" ? "%Y-%m-%d" : "%Y-%m",
                date: "$createdAt"
              }
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.period": 1 }
      }
    ]),

    // Department analytics
    Employee.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $lookup: {
          from: "departments",
          localField: "department",
          foreignField: "_id",
          as: "departmentInfo"
        }
      },
      {
        $unwind: "$departmentInfo"
      },
      {
        $group: {
          _id: "$departmentInfo.name",
          employeeCount: { $sum: 1 }
        }
      },
      {
        $sort: { employeeCount: -1 }
      }
    ]),

    // Overtime analytics
    Attendance.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          overtimeHours: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalOvertime: { $sum: "$overtimeHours" },
          averageOvertime: { $avg: "$overtimeHours" }
        }
      }
    ]),

    // Employee joining trends
    Employee.aggregate([
      {
        $match: {
          dateOfJoining: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            period: {
              $dateToString: {
                format: period === "week" ? "%Y-%m-%d" : "%Y-%m",
                date: "$dateOfJoining"
              }
            }
          },
          newEmployees: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.period": 1 }
      }
    ])
  ]);

  return {
    period,
    startDate,
    endDate,
    attendance,
    leaves,
    departments,
    overtime: overtime[0] || { totalOvertime: 0, averageOvertime: 0 },
    employeeJoinings
  };
};

// HR Analytics function
const getHRAnalytics = async (period) => {
  let startDate, endDate = new Date();

  switch (period) {
    case "week":
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "month":
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "quarter":
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case "year":
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
  }

  const [
    attendanceTrend,
    departmentDistribution,
    leaveTrend
  ] = await Promise.all([
    // Attendance trend
    Attendance.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
          },
          present: {
            $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] }
          },
          absent: {
            $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] }
          },
          total: { $sum: 1 }
        }
      },
      {
        $project: {
          date: "$_id.date",
          present: 1,
          absent: 1,
          total: 1,
          _id: 0
        }
      },
      {
        $sort: { date: 1 }
      }
    ]),

    // Department distribution
    Employee.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $lookup: {
          from: "departments",
          localField: "department",
          foreignField: "_id",
          as: "departmentInfo"
        }
      },
      {
        $unwind: "$departmentInfo"
      },
      {
        $group: {
          _id: "$departmentInfo.name",
          value: { $sum: 1 }
        }
      },
      {
        $project: {
          name: "$_id",
          value: 1,
          _id: 0
        }
      }
    ]),

    // Leave trend
    Leave.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          month: {
            $let: {
              vars: {
                monthsInString: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
              },
              in: {
                $arrayElemAt: ["$$monthsInString", { $subtract: ["$_id.month", 1] }]
              }
            }
          },
          year: "$_id.year",
          pending: 1,
          approved: 1,
          rejected: 1,
          _id: 0
        }
      },
      {
        $sort: { year: 1, month: 1 }
      }
    ])
  ]);

  return {
    attendanceTrend,
    departmentDistribution,
    leaveTrend
  };
};

// @desc    Get comprehensive dashboard stats and trends
// @route   GET /api/dashboard/stats
// @access  Private (HR_Manager, Admin, Team_Leader, Employee)
export const getDashboardStats = async (req, res) => {
  try {
    const { role, _id: employeeId } = req.employee;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Role-based data access
    let dashboardStats;
    
    switch (role) {
      case "HR_Manager":
      case "Admin":
        dashboardStats = await getHRDashboardStats(today);
        break;
      case "Team_Leader":
        dashboardStats = await getTeamLeaderDashboardStats(today, employeeId);
        break;
      case "Employee":
        dashboardStats = await getEmployeeDashboardStats(today, employeeId);
        break;
      default:
        return res.status(403).json({
          success: false,
          message: "Access denied. Invalid role."
        });
    }

    res.status(200).json({
      success: true,
      stats: dashboardStats,
      userRole: role
    });

  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dashboard stats",
      error: error.message
    });
  }
};

// @desc    Get detailed analytics for charts
// @route   GET /api/dashboard/analytics
// @access  Private (HR_Manager, Admin, Team_Leader)
export const getDashboardAnalytics = async (req, res) => {
  try {
    const { role, _id: employeeId } = req.employee;
    
    if (role === "Employee") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Employees cannot view analytics."
      });
    }

    const { period = "month" } = req.query;
    
    let analytics;
    if (role === "Team_Leader") {
      analytics = await getTeamLeaderAnalytics(period, employeeId);
    } else {
      analytics = await getHRAnalytics(period);
    }

    res.status(200).json({
      success: true,
      analytics: analytics,
      userRole: role
    });

  } catch (error) {
    console.error("Dashboard analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching analytics",
      error: error.message
    });
  }
};

// HR Manager Dashboard Stats
const getHRDashboardStats = async (today) => {
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  // Get all data in parallel for better performance
  const [
    totalEmployees,
    activeEmployees,
    todayAttendance,
    weekAttendance,
    monthAttendance,
    yearAttendance,
    pendingLeaves,
    recentLeaves,
    upcomingEvents,
    recentAnnouncements,
    departmentStats,
    attendanceTrends,
    leaveTrends,
    employeeGrowth,
    leaveApprovalRate
  ] = await Promise.all([
    // Basic counts
    Employee.countDocuments(),
    Employee.countDocuments({ isActive: true }),

    // Today's attendance stats
    getTodayAttendanceStats(today),
    
    // Weekly stats
    getPeriodAttendanceStats(startOfWeek, today),
    
    // Monthly stats
    getPeriodAttendanceStats(startOfMonth, today),
    
    // Yearly stats
    getPeriodAttendanceStats(startOfYear, today),

    // Leave stats
    Leave.countDocuments({ status: "Pending" }),
    Leave.find({ status: "Pending" })
      .populate('employee', 'name employeeId')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    
    // Events
    Event.find({ 
      startDate: { $gte: today },
      endDate: { $lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) }
    })
    .populate('officeLocation', 'officeName')
    .sort({ startDate: 1 })
    .limit(5)
    .lean(),

    // Announcements
    Announcement.find({ isActive: true })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),

    // Department-wise employee counts
    getDepartmentStats(),
    
    // Attendance trends for charts
    getAttendanceTrends(),
    
    // Leave trends for charts
    getLeaveTrends(),

    // Additional metrics
    calculateEmployeeGrowth(),
    calculateLeaveApprovalRate()
  ]);

  // Calculate attendance percentages
  const todayAttendanceRate = todayAttendance.totalEmployees > 0 
    ? (todayAttendance.present / todayAttendance.totalEmployees * 100).toFixed(1)
    : 0;

  const monthAttendanceRate = monthAttendance.totalEmployees > 0 
    ? (monthAttendance.present / monthAttendance.totalEmployees * 100).toFixed(1)
    : 0;

  // Format recent activities for frontend
  const formattedRecentLeaves = recentLeaves.map(leave => ({
    employee: {
      name: {
        first: leave.employee?.name?.first || 'Unknown',
        last: leave.employee?.name?.last || ''
      }
    },
    leaveType: leave.leaveType,
    duration: Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1,
    startDate: leave.startDate,
    endDate: leave.endDate
  }));

  const formattedUpcomingEvents = upcomingEvents.map(event => ({
    title: event.title,
    officeLocation: {
      officeName: event.officeLocation?.officeName || 'Unknown'
    },
    startDate: event.startDate,
    endDate: event.endDate
  }));

  const formattedRecentAnnouncements = recentAnnouncements.map(announcement => ({
    title: announcement.title,
    createdBy: {
      name: {
        first: announcement.createdBy?.name?.first || 'System',
        last: announcement.createdBy?.name?.last || ''
      }
    },
    createdAt: announcement.createdAt
  }));

  // Format department stats for frontend
  const formattedDepartmentStats = departmentStats.map(dept => ({
    department: dept.department,
    employeeCount: dept.employeeCount,
    avgSalary: dept.avgSalary,
    attendanceRate: dept.attendanceRate || 0
  }));

  // Format attendance trends for charts
  const formattedAttendanceTrends = attendanceTrends.map(trend => ({
    date: trend.date,
    present: trend.present,
    absent: trend.absent,
    late: trend.late,
    total: trend.total
  }));

  // Prepare dashboard response matching frontend structure
  return {
    overview: {
      totalEmployees,
      activeEmployees,
      inactiveEmployees: totalEmployees - activeEmployees,
      pendingLeaves,
      employeeGrowth: employeeGrowth.growthPercentage,
      leaveChange: employeeGrowth.monthlyChange
    },
    attendance: {
      today: {
        present: todayAttendance.present,
        absent: todayAttendance.absent,
        late: todayAttendance.late,
        halfDay: todayAttendance.halfDay,
        rate: parseFloat(todayAttendanceRate),
        change: "+2.5"
      }
    },
    quickStats: {
      averageAttendance: parseFloat(monthAttendanceRate),
      attendanceChange: "+1.2",
      avgHoursWorked: monthAttendance.avgHoursWorked || 8.2,
      hoursChange: "+0.3",
      overtimeHours: monthAttendance.overtimeHours || 42,
      overtimeChange: "+12",
      leaveUtilization: leaveApprovalRate.utilizationRate || 65,
      leaveUtilizationChange: leaveApprovalRate.change || "-5",
      remoteWorkers: Math.floor(activeEmployees * 0.2), // 20% remote workers
      remoteChange: "+8"
    },
    analytics: {
      departmentStats: formattedDepartmentStats,
      attendanceTrends: formattedAttendanceTrends,
      leaveTrends: leaveTrends
    },
    recentActivities: {
      pendingLeaves: formattedRecentLeaves,
      upcomingEvents: formattedUpcomingEvents,
      recentAnnouncements: formattedRecentAnnouncements,
      systemAlerts: generateSystemAlerts(todayAttendance, pendingLeaves)
    }
  };
};

// Team Leader Dashboard Stats
const getTeamLeaderDashboardStats = async (today, teamLeaderId) => {
  // Get team members
  const teamMembers = await Employee.find({ 
    manager: teamLeaderId,
    isActive: true 
  }).select('_id name employeeId department designation');

  const teamMemberIds = teamMembers.map(member => member._id);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Get team-specific data
  const [
    teamTodayAttendance,
    teamMonthAttendance,
    pendingTeamLeaves,
    recentTeamLeaves,
    teamAttendanceTrends,
    upcomingTeamEvents,
    recentAnnouncements
  ] = await Promise.all([
    // Today's attendance for team
    getTeamAttendanceStats(today, teamMemberIds),
    
    // Monthly attendance for team
    getTeamAttendanceStats(startOfMonth, today, teamMemberIds),

    // Pending leaves for team
    Leave.countDocuments({ 
      employee: { $in: teamMemberIds },
      status: "Pending" 
    }),

    // Recent leaves for team
    Leave.find({ 
      employee: { $in: teamMemberIds },
      status: "Pending"
    })
    .populate('employee', 'name employeeId')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean(),

    // Team attendance trends
    getTeamAttendanceTrends(teamMemberIds),

    // Upcoming events
    Event.find({ 
      startDate: { $gte: today },
      endDate: { $lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) }
    })
    .populate('officeLocation', 'officeName')
    .sort({ startDate: 1 })
    .limit(5)
    .lean(),

    // Announcements
    Announcement.find({ isActive: true })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
  ]);

  // Calculate team statistics
  const teamSize = teamMembers.length;
  const todayAttendanceRate = teamSize > 0 
    ? (teamTodayAttendance.present / teamSize * 100).toFixed(1)
    : 0;

  const monthAttendanceRate = teamSize > 0 
    ? (teamMonthAttendance.present / teamSize * 100).toFixed(1)
    : 0;

  // Format recent team leaves
  const formattedRecentLeaves = recentTeamLeaves.map(leave => ({
    employee: {
      name: {
        first: leave.employee?.name?.first || 'Unknown',
        last: leave.employee?.name?.last || ''
      }
    },
    leaveType: leave.leaveType,
    duration: Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1,
    startDate: leave.startDate,
    endDate: leave.endDate
  }));

  // Format team member performance
  const teamPerformance = await getTeamMemberPerformance(teamMemberIds);

  return {
    overview: {
      teamSize: teamSize,
      activeTeamMembers: teamSize,
      pendingLeaves: pendingTeamLeaves,
      todayPresent: teamTodayAttendance.present,
      todayAbsent: teamTodayAttendance.absent
    },
    attendance: {
      today: {
        present: teamTodayAttendance.present,
        absent: teamTodayAttendance.absent,
        late: teamTodayAttendance.late,
        halfDay: teamTodayAttendance.halfDay,
        rate: parseFloat(todayAttendanceRate)
      }
    },
    quickStats: {
      averageAttendance: parseFloat(monthAttendanceRate),
      avgHoursWorked: teamMonthAttendance.avgHoursWorked || 8.2,
      overtimeHours: teamMonthAttendance.overtimeHours || 0,
      leaveUtilization: Math.round((pendingTeamLeaves / teamSize) * 100) || 0
    },
    analytics: {
      teamAttendanceTrends: teamAttendanceTrends,
      teamPerformance: teamPerformance
    },
    recentActivities: {
      pendingLeaves: formattedRecentLeaves,
      upcomingEvents: upcomingTeamEvents,
      recentAnnouncements: recentAnnouncements,
      teamAlerts: generateTeamAlerts(teamTodayAttendance, pendingTeamLeaves, teamSize)
    },
    teamMembers: teamMembers.map(member => ({
      _id: member._id,
      name: member.name,
      employeeId: member.employeeId,
      department: member.department,
      designation: member.designation
    }))
  };
};

// Employee Dashboard Stats
const getEmployeeDashboardStats = async (today, employeeId) => {
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  // Get employee-specific data
  const [
    employee,
    todayAttendance,
    monthAttendance,
    yearAttendance,
    pendingLeaves,
    approvedLeaves,
    upcomingEvents,
    recentAnnouncements,
    attendanceSummary
  ] = await Promise.all([
    // Employee details
    Employee.findById(employeeId)
      .populate('department', 'name')
      .populate('designation', 'title')
      .populate('manager', 'name')
      .lean(),

    // Today's attendance
    Attendance.findOne({
      employee: employeeId,
      date: today
    }).lean(),

    // Monthly attendance summary
    Attendance.aggregate([
      {
        $match: {
          employee: new mongoose.Types.ObjectId(employeeId),
          date: { $gte: startOfMonth, $lte: today }
        }
      },
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] } },
          totalHours: { $sum: "$totalWorkHours" },
          overtimeHours: { $sum: "$overtimeHours" }
        }
      }
    ]),

    // Yearly attendance summary
    Attendance.aggregate([
      {
        $match: {
          employee: new mongoose.Types.ObjectId(employeeId),
          date: { $gte: startOfYear, $lte: today }
        }
      },
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] } },
          totalHours: { $sum: "$totalWorkHours" },
          overtimeHours: { $sum: "$overtimeHours" }
        }
      }
    ]),

    // Pending leaves
    Leave.countDocuments({
      employee: employeeId,
      status: "Pending"
    }),

    // Approved leaves this year
    Leave.countDocuments({
      employee: employeeId,
      status: "Approved",
      startDate: { $gte: startOfYear }
    }),

    // Upcoming events
    Event.find({ 
      startDate: { $gte: today },
      endDate: { $lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) }
    })
    .populate('officeLocation', 'officeName')
    .sort({ startDate: 1 })
    .limit(5)
    .lean(),

    // Announcements
    Announcement.find({ isActive: true })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
    .lean(),

    // Attendance trend for current month
    Attendance.aggregate([
      {
        $match: {
          employee: new mongoose.Types.ObjectId(employeeId),
          date: { $gte: startOfMonth, $lte: today }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
          },
          status: { $first: "$status" },
          workHours: { $first: "$totalWorkHours" }
        }
      },
      {
        $sort: { "_id.date": 1 }
      }
    ])
  ]);

  const monthStats = monthAttendance[0] || { present: 0, absent: 0, totalHours: 0, overtimeHours: 0 };
  const yearStats = yearAttendance[0] || { present: 0, totalHours: 0, overtimeHours: 0 };

  // Calculate working days this month
  const workingDaysThisMonth = getWorkingDays(startOfMonth, today);
  const attendanceRate = workingDaysThisMonth > 0 
    ? (monthStats.present / workingDaysThisMonth * 100).toFixed(1)
    : 0;

  return {
    overview: {
      employeeId: employee?.employeeId,
      department: employee?.department?.name,
      designation: employee?.designation?.title,
      manager: employee?.manager?.name,
      dateOfJoining: employee?.dateOfJoining
    },
    attendance: {
      today: {
        status: todayAttendance?.status || "Absent",
        punchIn: todayAttendance?.punchIn?.timestamp,
        punchOut: todayAttendance?.punchOut?.timestamp,
        workHours: todayAttendance?.totalWorkHours || 0
      },
      month: {
        present: monthStats.present,
        absent: monthStats.absent,
        attendanceRate: parseFloat(attendanceRate),
        totalHours: monthStats.totalHours,
        overtimeHours: monthStats.overtimeHours
      },
      year: {
        present: yearStats.present,
        totalHours: yearStats.totalHours,
        overtimeHours: yearStats.overtimeHours
      }
    },
    leaves: {
      pending: pendingLeaves,
      approvedThisYear: approvedLeaves,
      remaining: calculateRemainingLeaves(approvedLeaves) // Assuming 12 leaves per year
    },
    recentActivities: {
      upcomingEvents: upcomingEvents,
      recentAnnouncements: recentAnnouncements,
      attendanceTrend: attendanceSummary.map(day => ({
        date: day._id.date,
        status: day.status,
        workHours: day.workHours
      }))
    }
  };
};

// Helper Functions for Team Leader

// Get team attendance stats
const getTeamAttendanceStats = async (startDate, endDate, teamMemberIds) => {
  // Ensure teamMemberIds is an array and not empty
  if (!teamMemberIds || teamMemberIds.length === 0) {
    return {
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      totalHours: 0,
      overtimeHours: 0,
      avgHoursWorked: 0
    };
  }

  const attendanceStats = await Attendance.aggregate([
    {
      $match: {
        employee: { $in: teamMemberIds },
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalHours: { $sum: "$totalWorkHours" },
        overtimeHours: { $sum: "$overtimeHours" }
      }
    }
  ]);

  const stats = {
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
    totalHours: 0,
    overtimeHours: 0,
    avgHoursWorked: 0
  };

  let totalRecords = 0;
  attendanceStats.forEach(item => {
    totalRecords += item.count;
    stats.totalHours += item.totalHours || 0;
    stats.overtimeHours += item.overtimeHours || 0;
    
    switch(item._id) {
      case "Present": stats.present = item.count; break;
      case "Absent": stats.absent = item.count; break;
      case "Late": stats.late = item.count; break;
      case "Half Day": stats.halfDay = item.count; break;
    }
  });

  stats.avgHoursWorked = totalRecords > 0 ? (stats.totalHours / totalRecords).toFixed(1) : 0;

  return stats;
};

// Get team attendance trends
const getTeamAttendanceTrends = async (teamMemberIds) => {
  // Ensure teamMemberIds is an array and not empty
  if (!teamMemberIds || teamMemberIds.length === 0) {
    return [];
  }

  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  return await Attendance.aggregate([
    {
      $match: {
        employee: { $in: teamMemberIds },
        date: { $gte: last30Days }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
        },
        present: {
          $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] }
        },
        total: { $sum: 1 }
      }
    },
    {
      $project: {
        date: "$_id.date",
        present: 1,
        total: 1,
        attendanceRate: {
          $multiply: [
            { $divide: ["$present", "$total"] },
            100
          ]
        },
        _id: 0
      }
    },
    {
      $sort: { date: 1 }
    }
  ]);
};

// Get team member performance
const getTeamMemberPerformance = async (teamMemberIds) => {
  // Ensure teamMemberIds is an array and not empty
  if (!teamMemberIds || teamMemberIds.length === 0) {
    return [];
  }

  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  return await Attendance.aggregate([
    {
      $match: {
        employee: { $in: teamMemberIds },
        date: { $gte: last30Days }
      }
    },
    {
      $lookup: {
        from: "employees",
        localField: "employee",
        foreignField: "_id",
        as: "employeeInfo"
      }
    },
    {
      $unwind: "$employeeInfo"
    },
    {
      $group: {
        _id: "$employee",
        present: {
          $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] }
        },
        total: { $sum: 1 },
        totalHours: { $sum: "$totalWorkHours" },
        overtimeHours: { $sum: "$overtimeHours" },
        employeeName: { $first: "$employeeInfo.name" },
        employeeId: { $first: "$employeeInfo.employeeId" }
      }
    },
    {
      $project: {
        employeeName: 1,
        employeeId: 1,
        attendanceRate: {
          $multiply: [
            { $divide: ["$present", "$total"] },
            100
          ]
        },
        avgHoursPerDay: { $divide: ["$totalHours", "$total"] },
        totalOvertime: "$overtimeHours",
        _id: 0
      }
    },
    {
      $sort: { attendanceRate: -1 }
    }
  ]);
};

// Helper Functions for Employee

// Calculate working days between two dates (excluding weekends)
const getWorkingDays = (startDate, endDate) => {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 is Sunday, 6 is Saturday
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
};

// Calculate remaining leaves (assuming 12 leaves per year)
const calculateRemainingLeaves = (approvedLeaves) => {
  const totalLeavesPerYear = 12;
  return Math.max(0, totalLeavesPerYear - approvedLeaves);
};

// Generate team alerts
const generateTeamAlerts = (teamAttendance, pendingLeaves, teamSize) => {
  const alerts = [];
  
  if (teamAttendance.absent > teamSize * 0.3) {
    alerts.push({
      message: "High absenteeism in your team today",
      severity: "warning",
      createdAt: new Date()
    });
  }
  
  if (pendingLeaves > teamSize * 0.5) {
    alerts.push({
      message: "Multiple pending leave requests need attention",
      severity: "info",
      createdAt: new Date()
    });
  }

  if (teamAttendance.late > teamSize * 0.2) {
    alerts.push({
      message: "Several team members arriving late",
      severity: "warning",
      createdAt: new Date()
    });
  }

  return alerts;
};

// Analytics functions for Team Leader
const getTeamLeaderAnalytics = async (period, teamLeaderId) => {
  // Get team members
  const teamMembers = await Employee.find({ 
    manager: teamLeaderId,
    isActive: true 
  }).select('_id');
  
  const teamMemberIds = teamMembers.map(member => member._id);

  // Ensure teamMemberIds is an array
  if (!teamMemberIds || teamMemberIds.length === 0) {
    return {
      attendanceTrend: [],
      leaveTrend: [],
      performanceStats: []
    };
  }

  let startDate, endDate = new Date();

  switch (period) {
    case "week":
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "month":
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "quarter":
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    default:
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
  }

  const [
    attendanceTrend,
    leaveTrend,
    performanceStats
  ] = await Promise.all([
    // Team attendance trend
    Attendance.aggregate([
      {
        $match: {
          employee: { $in: teamMemberIds },
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            period: {
              $dateToString: {
                format: period === "week" ? "%Y-%m-%d" : "%Y-%m",
                date: "$date"
              }
            }
          },
          present: {
            $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] }
          },
          total: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.period": 1 }
      }
    ]),

    // Team leave trend
    Leave.aggregate([
      {
        $match: {
          employee: { $in: teamMemberIds },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            period: {
              $dateToString: {
                format: period === "week" ? "%Y-%m-%d" : "%Y-%m",
                date: "$createdAt"
              }
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.period": 1 }
      }
    ]),

    // Team performance stats
    Attendance.aggregate([
      {
        $match: {
          employee: { $in: teamMemberIds },
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $lookup: {
          from: "employees",
          localField: "employee",
          foreignField: "_id",
          as: "employeeInfo"
        }
      },
      {
        $unwind: "$employeeInfo"
      },
      {
        $group: {
          _id: "$employee",
          presentDays: {
            $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] }
          },
          totalDays: { $sum: 1 },
          totalHours: { $sum: "$totalWorkHours" },
          overtimeHours: { $sum: "$overtimeHours" },
          employeeName: { $first: "$employeeInfo.name" }
        }
      },
      {
        $project: {
          employeeName: 1,
          attendanceRate: {
            $multiply: [
              { $divide: ["$presentDays", "$totalDays"] },
              100
            ]
          },
          avgHoursPerDay: { $divide: ["$totalHours", "$totalDays"] },
          totalOvertime: "$overtimeHours"
        }
      }
    ])
  ]);

  return {
    attendanceTrend: attendanceTrend.map(item => ({
      period: item._id.period,
      attendanceRate: item.total > 0 ? (item.present / item.total * 100).toFixed(1) : 0
    })),
    leaveTrend: leaveTrend.map(item => ({
      period: item._id.period,
      leaves: item.count
    })),
    performanceStats: performanceStats
  };
};

export default {
  getDashboardStats,
  getDashboardAnalytics
};