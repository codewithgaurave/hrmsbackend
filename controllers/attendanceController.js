import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Employee from "../models/Employee.js";
import Event from "../models/Event.js";
import WorkShift from "../models/WorkShift.js";
import OfficeLocation from "../models/OfficeLocation.js";
import Leave from "../models/Leave.js";



// Helper Functions

// Get filters data
const getFiltersData = async () => {
  try {
    const [departments, designations, officeLocations, shifts, statusCounts] = await Promise.all([
      // Departments
      mongoose.model('Department').find({ isActive: true }).select('name _id'),

      // Designations
      mongoose.model('Designation').find({ isActive: true }).select('title _id'),

      // Office Locations
      OfficeLocation.find().select('officeName _id'),

      // Work Shifts
      WorkShift.find({ status: 'Active' }).select('name _id'),

      // Status counts for filter badges
      Attendance.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    return {
      departments: departments.map(dept => ({ _id: dept._id, name: dept.name })),
      designations: designations.map(desig => ({ _id: desig._id, title: desig.title })),
      officeLocations: officeLocations.map(loc => ({ _id: loc._id, officeName: loc.officeName })),
      shifts: shifts.map(shift => ({ _id: shift._id, name: shift.name })),
      statusCounts: statusCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };
  } catch (error) {
    console.error("Error getting filters data:", error);
    return {
      departments: [],
      designations: [],
      officeLocations: [],
      shifts: [],
      statusCounts: {}
    };
  }
};

// Calculate if day is working day, holiday, or week off
const calculateDayStatus = async (employee, date) => {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

  // Check if weekend (assuming 5-day work week)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return "Week Off";
  }

  // Check if holiday
  const holiday = await Event.findOne({
    officeLocation: employee.officeLocation._id,
    eventType: "Holiday",
    startDate: { $lte: date },
    endDate: { $gte: date }
  });

  if (holiday) {
    return "Holiday";
  }

  return "Working Day";
};

// Validate if employee is within office location radius
const validateOfficeLocation = async (lat, lng, officeLocationId) => {
  try {
    console.log('=== LOCATION VALIDATION DEBUG START ===');
    console.log('1. Input Parameters:');
    console.log('   - User Latitude:', lat);
    console.log('   - User Longitude:', lng);
    console.log('   - Office Location ID:', officeLocationId);
    console.log('   - User Lat/Lng Type:', typeof lat, typeof lng);

    // Validate input parameters
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      console.log('ERROR: Invalid coordinates type. Expected numbers.');
      console.log('   Lat is:', lat, 'Type:', typeof lat);
      console.log('   Lng is:', lng, 'Type:', typeof lng);
      return false;
    }

    if (isNaN(lat) || isNaN(lng)) {
      console.log('ERROR: Coordinates are NaN');
      return false;
    }

    const office = await OfficeLocation.findById(officeLocationId);

    if (!office) {
      console.log('ERROR: Office location not found with ID:', officeLocationId);
      return false;
    }

    console.log('2. Office Location Details:');
    console.log('   - Office Name:', office.officeName);
    console.log('   - Office Latitude:', office.latitude);
    console.log('   - Office Longitude:', office.longitude);
    console.log('   - Office Address:', office.officeAddress);
    console.log('   - Office Lat/Lng Type:', typeof office.latitude, typeof office.longitude);

    // Check if office coordinates are valid numbers
    if (typeof office.latitude !== 'number' || typeof office.longitude !== 'number') {
      console.log('ERROR: Office coordinates are not numbers');
      console.log('   Office lat type:', typeof office.latitude, 'value:', office.latitude);
      console.log('   Office lng type:', typeof office.longitude, 'value:', office.longitude);
      return false;
    }

    if (isNaN(office.latitude) || isNaN(office.longitude)) {
      console.log('ERROR: Office coordinates are NaN');
      return false;
    }

    // Calculate distance between two points using Haversine formula
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat - office.latitude) * Math.PI / 180;
    const dLng = (lng - office.longitude) * Math.PI / 180;

    console.log('3. Distance Calculation:');
    console.log('   - dLat (radians):', dLat);
    console.log('   - dLng (radians):', dLng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(office.latitude * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    console.log('   - a value:', a);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in meters

    console.log('4. Result:');
    console.log('   - Calculated distance:', distance.toFixed(2), 'meters');
    console.log('   - Maximum allowed distance: 500 meters');
    console.log('   - Is within range?', distance <= 500);
    console.log('   - Distance difference:', (distance - 500).toFixed(2), 'meters');

    // Convert distance to kilometers for better understanding
    const distanceKm = distance / 1000;
    console.log('   - Distance in kilometers:', distanceKm.toFixed(3), 'km');

    // Calculate approximate walking time (5 km/h average)
    const walkingTimeMinutes = (distance / 5000) * 60;
    console.log('   - Approx walking time:', walkingTimeMinutes.toFixed(1), 'minutes');

    // Allow within 500 meters radius (as per your update)
    const isWithinRange = distance <= 500;
    
    console.log('=== LOCATION VALIDATION DEBUG END ===');
    console.log('Final Result:', isWithinRange ? '✅ WITHIN RANGE' : '❌ OUT OF RANGE');
    
    return isWithinRange;

  } catch (error) {
    console.error("Location validation error:", error);
    console.error("Error stack:", error.stack);
    return false;
  }
};

// Calculate attendance consistency
const calculateConsistency = (summary) => {
  const totalDays = summary.reduce((total, item) => total + item.count, 0);
  if (totalDays === 0) return 0;

  const presentDays = summary.find(item => item._id === "Present")?.count || 0;
  const halfDays = summary.find(item => item._id === "Half Day")?.count || 0;

  return ((presentDays + (halfDays * 0.5)) / totalDays * 100).toFixed(1);
};

// @desc    Punch In for attendance
// @route   POST /api/attendance/punch-in
// @access  Private
export const punchIn = async (req, res) => {
  try {
    console.log('=== PUNCH IN DEBUG START ===');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    
    const { coordinates } = req.body;
    const employeeId = req.employee._id;
    
    console.log('1. Employee ID:', employeeId);
    console.log('2. Coordinates received:', coordinates);
    
    if (!coordinates) {
      console.log('ERROR: No coordinates in request body');
      return res.status(400).json({
        success: false,
        message: "Coordinates are required"
      });
    }
    
    if (!coordinates.latitude || !coordinates.longitude) {
      console.log('ERROR: Missing latitude or longitude');
      console.log('   Latitude:', coordinates.latitude);
      console.log('   Longitude:', coordinates.longitude);
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required"
      });
    }
    
    console.log('3. Parsed coordinates:', {
      latitude: parseFloat(coordinates.latitude),
      longitude: parseFloat(coordinates.longitude)
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log('4. Today date (start of day):', today);
    
    // Get employee with office location
    const employee = await Employee.findById(employeeId)
      .populate('officeLocation')
      .populate('workShift');
    
    console.log('5. Employee Details:');
    console.log('   - Employee found:', !!employee);
    if (employee) {
      console.log('   - Employee Name:', employee.name);
      console.log('   - Office Location ID:', employee.officeLocation?._id);
      console.log('   - Office Location:', employee.officeLocation);
    }
    
    if (!employee) {
      console.log('ERROR: Employee not found');
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }
    
    if (!employee.officeLocation) {
      console.log('ERROR: Employee has no office location assigned');
      return res.status(400).json({
        success: false,
        message: "No office location assigned to employee"
      });
    }
    
    console.log('6. Calling validateOfficeLocation...');
    console.log('   - User lat:', coordinates.latitude);
    console.log('   - User lng:', coordinates.longitude);
    console.log('   - Office ID:', employee.officeLocation._id);
    
    const isWithinOffice = await validateOfficeLocation(
      parseFloat(coordinates.latitude),
      parseFloat(coordinates.longitude),
      employee.officeLocation._id
    );
    
    console.log('7. Validation Result:', isWithinOffice);
    
    if (!isWithinOffice) {
      console.log('8. ❌ LOCATION VALIDATION FAILED');
      // Get office details for better error message
      const office = await OfficeLocation.findById(employee.officeLocation._id);
      console.log('   Office Location:', {
        name: office?.officeName,
        lat: office?.latitude,
        lng: office?.longitude,
        address: office?.officeAddress
      });
      
      return res.status(400).json({
        success: false,
        message: "Punch in Service is available only inside the office",
        debugInfo: process.env.NODE_ENV === 'development' ? {
          userLocation: {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
          },
          officeLocation: office ? {
            name: office.officeName,
            latitude: office.latitude,
            longitude: office.longitude,
            address: office.officeAddress
          } : null
        } : undefined
      });
    }
    
    console.log('8. ✅ LOCATION VALIDATION PASSED');
    // Rest of your punch in logic...
    
  } catch (error) {
    console.error('PUNCH IN ERROR DETAILS:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: "Server error during punch in",
      error: error.message
    });
  }
};

// @desc    Punch Out for attendance
// @route   POST /api/attendance/punch-out
// @access  Private
export const punchOut = async (req, res) => {
  try {
    const { coordinates, earlyDepartureReason } = req.body;
    const employeeId = req.employee._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's attendance
    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: today
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "No punch in found for today"
      });
    }

    if (attendance.punchOut && attendance.punchOut.timestamp) {
      return res.status(400).json({
        success: false,
        message: "You have already punched out for today"
      });
    }

    // Validate location
    const isWithinOffice = await validateOfficeLocation(
      coordinates.latitude,
      coordinates.longitude,
      attendance.officeLocation
    );

        if (!isWithinOffice) {
      return res.status(400).json({
        success: false,
        message: "Punch out Service is available only inside the office",
      });
    }

    // Update punch out data
    attendance.punchOut = {
      timestamp: new Date(),
      coordinates: coordinates
    };

    if (earlyDepartureReason) {
      attendance.earlyDepartureReason = earlyDepartureReason;
    }

    attendance.isWithinOfficeLocation = isWithinOffice;

    await attendance.save();

    // Populate the saved attendance
    await attendance.populate('employee', 'name employeeId');
    await attendance.populate('shift', 'name startTime endTime');
    await attendance.populate('officeLocation', 'officeName officeAddress');

    res.status(200).json({
      success: true,
      message: "Punch out successful",
      attendance: attendance,
      workSummary: {
        totalHours: attendance.totalWorkHours,
        overtimeHours: attendance.overtimeHours,
        status: attendance.status
      }
    });

  } catch (error) {
    console.error("Punch out error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during punch out",
      error: error.message
    });
  }
};

// @desc    Punch In for attendance by hr manage
// @route   POST /api/attendance/punch-in
// @access  Private
export const punchInByHr = async (req, res) => {
  try {
    const { punchInTime } = req.body;
    const { employeeId } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already punched in for today
    const existingAttendance = await Attendance.findOne({
      employee: employeeId,
      date: today
    });

    if (existingAttendance && existingAttendance.punchIn.timestamp) {
      return res.status(400).json({
        success: false,
        message: "You have already punched in for today"
      });
    }

    // Get employee details
    const employee = await Employee.findById(employeeId)
      .populate('workShift')
      .populate('officeLocation');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }


    const officeLocation = await OfficeLocation.findById(employee?.officeLocation?._id)

    // Check if today is holiday or week off
    const dayStatus = await calculateDayStatus(employee, today);
    if (dayStatus !== "Working Day") {
      return res.status(400).json({
        success: false,
        message: `Cannot punch in on ${dayStatus}`
      });
    }

    // Validate location (within office radius - 100 meters)
    const isWithinOffice = await validateOfficeLocation(
      officeLocation.latitude,
      officeLocation.longitude,
      employee.officeLocation
    );

        if (!isWithinOffice) {
      return res.status(400).json({
        success: false,
        message: "Punch in Service is available only inside the office",
      });
    }

    // Create or update attendance record
    let attendance;

    if (existingAttendance) {
      // Update existing record
      attendance = existingAttendance;
      attendance.punchIn = {
        timestamp: new Date(),
        coordinates: {
          latitude: officeLocation.latitude,
          longitude: officeLocation.longitude
        },
      };
      attendance.isWithinOfficeLocation = isWithinOffice;
    } else {
      // Create new attendance record
      attendance = new Attendance({
        employee: employeeId,
        date: today,
        punchIn: {
          timestamp: punchInTime || new Date(),
          coordinates: {
            latitude: officeLocation.latitude,
            longitude: officeLocation.longitude
          },
        },
        shift: employee.workShift._id,
        officeLocation: employee.officeLocation._id,
        isWithinOfficeLocation: isWithinOffice
      });
    }

    await attendance.save();

    // Populate the saved attendance
    await attendance.populate('employee', 'name employeeId');
    await attendance.populate('shift', 'name startTime endTime');
    await attendance.populate('officeLocation', 'officeName officeAddress');

    res.status(200).json({
      success: true,
      message: "Punch in successful",
      attendance: attendance,
      locationStatus: isWithinOffice ? "Within office premises" : "Outside office premises"
    });

  } catch (error) {
    console.error("Punch in error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during punch in",
      error: error.message
    });
  }
};

// @desc    Punch Out for attendance by hrr manager
// @route   POST /api/attendance/punch-out
// @access  Private
export const punchOutByHr = async (req, res) => {
  try {
    const { punchOutTime } = req.body;
    const { employeeId } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's attendance
    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: today
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "No punch in found for today"
      });
    }


    const officeLocation = await OfficeLocation.findById(attendance?.officeLocation)


    if (attendance.punchOut && attendance.punchOut.timestamp) {
      return res.status(400).json({
        success: false,
        message: "You have already punched out for today"
      });
    }

    // Validate location (within office radius - 100 meters)
    const isWithinOffice = await validateOfficeLocation(
      officeLocation.latitude,
      officeLocation.longitude,
      attendance.officeLocation
    );

        if (!isWithinOffice) {
      return res.status(400).json({
        success: false,
        message: "Punch out Service is available only inside the office",
      });
    }

    // Update punch out data
    attendance.punchOut = {
      timestamp: punchOutTime || new Date(),
      coordinates: {
        latitude: officeLocation.latitude,
        longitude: officeLocation.longitude
      },
    };

    // if (earlyDepartureReason) {
    //   attendance.earlyDepartureReason = earlyDepartureReason;
    // }

    attendance.isWithinOfficeLocation = isWithinOffice;

    await attendance.save();

    // Populate the saved attendance
    await attendance.populate('employee', 'name employeeId');
    await attendance.populate('shift', 'name startTime endTime');
    await attendance.populate('officeLocation', 'officeName officeAddress');

    res.status(200).json({
      success: true,
      message: "Punch out successful",
      attendance: attendance,
      workSummary: {
        totalHours: attendance.totalWorkHours,
        overtimeHours: attendance.overtimeHours,
        status: attendance.status
      }
    });

  } catch (error) {
    console.error("Punch out error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during punch out",
      error: error.message
    });
  }
};


// @desc    Get today's attendance for employee by hr
// @route   GET /api/attendance/today
// @access  Private
export const getTodayAttendanceOfEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: today
    })
      .populate('employee', 'name employeeId profilePicture')
      .populate('shift', 'name startTime endTime')
      .populate('officeLocation', 'officeName officeAddress');

    // If no attendance record, check if it's holiday/week off
    if (!attendance) {
      const employee = await Employee.findById(employeeId)
        .populate('workShift')
        .populate('officeLocation');

      const dayStatus = await calculateDayStatus(employee, today);

      if (dayStatus !== "Working Day") {
        return res.status(200).json({
          success: true,
          message: `Today is ${dayStatus}`,
          attendance: null,
          dayStatus: dayStatus
        });
      }

      return res.status(200).json({
        success: true,
        message: "No attendance record for today",
        attendance: null,
        dayStatus: "Working Day - Not Punched In"
      });
    }

    res.status(200).json({
      success: true,
      attendance: attendance,
      dayStatus: "Attendance Recorded"
    });

  } catch (error) {
    console.error("Get today attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching today's attendance",
      error: error.message
    });
  }
};

// @desc    Get attendance for a specific date range with enhanced filters
// @route   GET /api/attendance
// @access  Private
export const getAttendance = async (req, res) => {
  try {
    const {
      employeeId,
      startDate,
      endDate,
      status,
      department,
      designation,
      officeLocation,
      shift,
      search,
      page = 1,
      limit = 30,
      sortBy = "date",
      sortOrder = "desc"
    } = req.query;

    const query = {};



    // Date range filter
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Status filter
    if (status && status !== 'All') {
      query.status = status;
    }

    // Search filter (employee name or ID)
    if (search) {
      const employees = await Employee.find({
        $or: [
          { 'name.first': { $regex: search, $options: 'i' } },
          { 'name.last': { $regex: search, $options: 'i' } },
          { employeeId: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      if (employees.length > 0) {
        query.employee = { $in: employees.map(emp => emp._id) };
      } else {
        // If no employees found, return empty result
        query.employee = { $in: [] };
      }
    }

    const skip = (page - 1) * limit;

    // Build aggregation pipeline for enhanced filtering
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "employees",
          localField: "employee",
          foreignField: "_id",
          as: "employeeData"
        }
      },
      { $unwind: "$employeeData" },
      {
        $lookup: {
          from: "departments",
          localField: "employeeData.department",
          foreignField: "_id",
          as: "departmentData"
        }
      },
      { $unwind: { path: "$departmentData", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "designations",
          localField: "employeeData.designation",
          foreignField: "_id",
          as: "designationData"
        }
      },
      { $unwind: { path: "$designationData", preserveNullAndEmptyArrays: true } }
    ];

    // Department filter
    if (department && department !== 'All') {
      pipeline.push({
        $match: {
          "departmentData._id": new mongoose.Types.ObjectId(department)
        }
      });
    }

    // Designation filter
    if (designation && designation !== 'All') {
      pipeline.push({
        $match: {
          "designationData._id": new mongoose.Types.ObjectId(designation)
        }
      });
    }

    // Office Location filter
    if (officeLocation && officeLocation !== 'All') {
      pipeline.push({
        $match: {
          officeLocation: new mongoose.Types.ObjectId(officeLocation)
        }
      });
    }

    // Shift filter
    if (shift && shift !== 'All') {
      pipeline.push({
        $match: {
          shift: new mongoose.Types.ObjectId(shift)
        }
      });
    }

    // Add final projection and sorting
    pipeline.push(
      {
        $project: {
          date: 1,
          punchIn: 1,
          punchOut: 1,
          totalWorkHours: 1,
          overtimeHours: 1,
          status: 1,
          earlyDepartureMinutes: 1,
          earlyDepartureReason: 1,
          isWithinOfficeLocation: 1,
          shift: 1,
          officeLocation: 1,
          employee: {
            _id: "$employeeData._id",
            name: "$employeeData.name",
            employeeId: "$employeeData.employeeId",
            profilePicture: "$employeeData.profilePicture",
            department: "$departmentData",
            designation: "$designationData"
          }
        }
      },
      {
        $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
      },
      {
        $skip: skip
      },
      {
        $limit: parseInt(limit)
      }
    );

    const attendance = await Attendance.aggregate(pipeline);

    // Get total count for pagination
    const countPipeline = [...pipeline];
    countPipeline.splice(countPipeline.length - 3, 3); // Remove skip, limit, and sort
    countPipeline.push({ $count: "total" });

    const totalResult = await Attendance.aggregate(countPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    // Populate shift and office location
    const populatedAttendance = await Attendance.populate(attendance, [
      { path: 'shift', select: 'name startTime endTime' },
      { path: 'officeLocation', select: 'officeName officeAddress' }
    ]);

    // Get available filters data
    const filtersData = await getFiltersData();

    res.status(200).json({
      success: true,
      attendance: populatedAttendance,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      },
      filters: filtersData
    });

  } catch (error) {
    console.error("Get attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching attendance",
      error: error.message
    });
  }
};

// @desc    Get attendance summary for employee
// @route   GET /api/attendance/summary
// @access  Private
export const getAttendanceSummary = async (req, res) => {
  try {
    const {
      employeeId,
      startDate,
      endDate = new Date()
    } = req.query;

    const targetEmployeeId = employeeId && (req.employee.role === "HR_Manager" || req.employee.role === "Team_Leader")
      ? employeeId
      : req.employee._id;

    // Default to current month if no start date provided
    const defaultStartDate = new Date();
    defaultStartDate.setDate(1); // First day of current month
    defaultStartDate.setHours(0, 0, 0, 0);

    const queryStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const queryEndDate = new Date(endDate);

    const summary = await Attendance.getEmployeeSummary(
      targetEmployeeId,
      queryStartDate,
      queryEndDate
    );

    // Calculate totals
    let present = 0, absent = 0, halfDay = 0, late = 0, onLeave = 0;
    let totalHours = 0, totalOvertime = 0;

    summary.forEach(item => {
      switch (item._id) {
        case "Present": present = item.count; break;
        case "Absent": absent = item.count; break;
        case "Half Day": halfDay = item.count; break;
        case "Late": late = item.count; break;
        case "On Leave": onLeave = item.count; break;
      }
      totalHours += item.totalHours || 0;
      totalOvertime += item.totalOvertime || 0;
    });

    const totalWorkingDays = present + halfDay + late;
    const attendancePercentage = totalWorkingDays > 0
      ? ((present + (halfDay * 0.5)) / totalWorkingDays * 100).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      summary: {
        period: {
          startDate: queryStartDate,
          endDate: queryEndDate
        },
        stats: {
          present,
          absent,
          halfDay,
          late,
          onLeave,
          totalWorkingDays
        },
        hours: {
          totalHours: totalHours.toFixed(2),
          totalOvertime: totalOvertime.toFixed(2),
          averageHoursPerDay: totalWorkingDays > 0 ? (totalHours / totalWorkingDays).toFixed(2) : "0.00"
        },
        performance: {
          attendancePercentage: parseFloat(attendancePercentage),
          consistency: calculateConsistency(summary)
        }
      }
    });

  } catch (error) {
    console.error("Get attendance summary error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching attendance summary",
      error: error.message
    });
  }
};

// @desc    Get filters data for attendance
// @route   GET /api/attendance/filters
// @access  Private
export const getAttendanceFilters = async (req, res) => {
  try {
    const filtersData = await getFiltersData();

    res.status(200).json({
      success: true,
      filters: filtersData
    });
  } catch (error) {
    console.error("Get attendance filters error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching filters",
      error: error.message
    });
  }
};

// @desc    Manual attendance correction (HR/Manager only)
// @route   PUT /api/attendance/:id
// @access  Private (HR_Manager, Team_Leader)
export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if user has permission
    if (req.employee.role !== "HR_Manager" && req.employee.role !== "Team_Leader") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only HR Managers and Team Leaders can update attendance."
      });
    }

    const attendance = await Attendance.findById(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: "Attendance record not found"
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      'status', 'earlyDepartureMinutes',
      'earlyDepartureReason', 'totalWorkHours', 'overtimeHours'
    ];

    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        attendance[field] = updateData[field];
      }
    });

    // If punch times are being updated
    if (updateData.punchIn || updateData.punchOut) {
      if (updateData.punchIn) {
        attendance.punchIn = {
          ...attendance.punchIn.toObject(),
          ...updateData.punchIn
        };
      }
      if (updateData.punchOut) {
        attendance.punchOut = {
          ...attendance.punchOut?.toObject() || {},
          ...updateData.punchOut
        };
      }
    }

    await attendance.save();

    await attendance.populate('employee', 'name employeeId');
    await attendance.populate('shift', 'name startTime endTime');
    await attendance.populate('officeLocation', 'officeName officeAddress');

    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      attendance: attendance
    });

  } catch (error) {
    console.error("Update attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating attendance",
      error: error.message
    });
  }
};


// @desc    Get today's attendance for employee
// @route   GET /api/attendance/today
// @access  Private
export const getTodayAttendance = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: today
    })
      .populate('employee', 'name employeeId profilePicture')
      .populate('shift', 'name startTime endTime')
      .populate('officeLocation', 'officeName officeAddress');

    // If no attendance record, check if it's holiday/week off
    if (!attendance) {
      const employee = await Employee.findById(employeeId)
        .populate('workShift')
        .populate('officeLocation');

      const dayStatus = await calculateDayStatus(employee, today);

      if (dayStatus !== "Working Day") {
        return res.status(200).json({
          success: true,
          message: `Today is ${dayStatus}`,
          attendance: null,
          dayStatus: dayStatus
        });
      }

      return res.status(200).json({
        success: true,
        message: "No attendance record for today",
        attendance: null,
        dayStatus: "Working Day - Not Punched In"
      });
    }

    res.status(200).json({
      success: true,
      attendance: attendance,
      dayStatus: "Attendance Recorded"
    });

  } catch (error) {
    console.error("Get today attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching today's attendance",
      error: error.message
    });
  }
};


// @desc    Get all attendance records for logged-in employee
// @route   GET /api/attendance/my-attendances
// @access  Private
export const getMyAttendances = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      status,
      page = 1,
      limit = 30,
      sortBy = "date",
      sortOrder = "desc"
    } = req.query;

    const employeeId = req.employee._id;
    const query = { employee: employeeId };

    // Date range filter
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to last 30 days if no date range provided
      const defaultEndDate = new Date();
      const defaultStartDate = new Date();
      defaultStartDate.setDate(defaultStartDate.getDate() - 30);

      query.date = {
        $gte: defaultStartDate,
        $lte: defaultEndDate
      };
    }

    // Status filter
    if (status && status !== 'All') {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    // Get attendance records with pagination
    const attendances = await Attendance.find(query)
      .populate('employee', 'name employeeId profilePicture')
      .populate('shift', 'name startTime endTime')
      .populate('officeLocation', 'officeName officeAddress')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Attendance.countDocuments(query);

    // Calculate summary statistics
    const summaryStats = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalHours: { $sum: '$totalWorkHours' },
          totalOvertime: { $sum: '$overtimeHours' }
        }
      }
    ]);

    // Format summary statistics
    const stats = {
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      onLeave: 0,
      totalHours: 0,
      totalOvertime: 0
    };

    summaryStats.forEach(item => {
      switch (item._id) {
        case "Present": stats.present = item.count; break;
        case "Absent": stats.absent = item.count; break;
        case "Late": stats.late = item.count; break;
        case "Half Day": stats.halfDay = item.count; break;
        case "On Leave": stats.onLeave = item.count; break;
      }
      stats.totalHours += item.totalHours || 0;
      stats.totalOvertime += item.totalOvertime || 0;
    });

    const totalWorkingDays = stats.present + stats.late + stats.halfDay;
    const attendancePercentage = totalWorkingDays > 0
      ? ((stats.present + (stats.halfDay * 0.5)) / totalWorkingDays * 100).toFixed(1)
      : 0;

    // Format response data
    const formattedAttendances = attendances.map(attendance => ({
      _id: attendance._id,
      date: attendance.date,
      punchIn: attendance.punchIn,
      punchOut: attendance.punchOut,
      totalWorkHours: attendance.totalWorkHours,
      overtimeHours: attendance.overtimeHours,
      status: attendance.status,
      earlyDepartureMinutes: attendance.earlyDepartureMinutes,
      earlyDepartureReason: attendance.earlyDepartureReason,
      isWithinOfficeLocation: attendance.isWithinOfficeLocation,
      shift: attendance.shift,
      officeLocation: attendance.officeLocation,
      employee: attendance.employee
    }));

    res.status(200).json({
      success: true,
      attendances: formattedAttendances,
      summary: {
        period: {
          startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
          endDate: endDate ? new Date(endDate) : new Date()
        },
        stats: {
          totalRecords: total,
          present: stats.present,
          absent: stats.absent,
          late: stats.late,
          halfDay: stats.halfDay,
          onLeave: stats.onLeave,
          totalWorkingDays: totalWorkingDays
        },
        hours: {
          totalHours: stats.totalHours.toFixed(2),
          totalOvertime: stats.totalOvertime.toFixed(2),
          averageHoursPerDay: totalWorkingDays > 0 ? (stats.totalHours / totalWorkingDays).toFixed(2) : "0.00"
        },
        performance: {
          attendancePercentage: parseFloat(attendancePercentage),
          consistency: calculateConsistency(summaryStats)
        }
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("Get my attendances error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching attendance records",
      error: error.message
    });
  }
};

// @desc    Get my attendance summary with detailed analytics
// @route   GET /api/attendance/my-summary
// @access  Private
export const getMyAttendanceSummary = async (req, res) => {
  try {
    const {
      period = 'month' // month, week, quarter, year
    } = req.query;

    const employeeId = req.employee._id;
    
    // Get employee details including dateOfJoining
    const employee = await Employee.findById(employeeId).select('dateOfJoining');
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    let startDate, endDate = new Date();

    // Calculate date range based on period
    switch (period) {
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
    }

    // Adjust start date if employee joined later
    const actualStartDate = employee.dateOfJoining > startDate ? 
      new Date(employee.dateOfJoining) : new Date(startDate);

    const query = {
      employee: employeeId,
      date: { $gte: actualStartDate, $lte: endDate }
    };

    // Get detailed analytics with improved aggregation
    const [dailyStats, weeklyTrends, statusSummary, overtimeAnalysis, leaveData] = await Promise.all([
      // Daily attendance stats - IMPROVED
      Attendance.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              status: "$status"
            },
            count: { $sum: 1 },
            totalHours: { $sum: "$totalWorkHours" },
            overtimeHours: { $sum: "$overtimeHours" }
          }
        },
        {
          $group: {
            _id: "$_id.date",
            statuses: {
              $push: {
                status: "$_id.status",
                count: "$count"
              }
            },
            totalHours: { $sum: "$totalHours" },
            overtimeHours: { $sum: "$overtimeHours" }
          }
        },
        {
          $project: {
            date: "$_id",
            present: {
              $sum: {
                $map: {
                  input: "$statuses",
                  as: "s",
                  in: { $cond: [{ $eq: ["$$s.status", "Present"] }, "$$s.count", 0] }
                }
              }
            },
            absent: {
              $sum: {
                $map: {
                  input: "$statuses",
                  as: "s",
                  in: { $cond: [{ $eq: ["$$s.status", "Absent"] }, "$$s.count", 0] }
                }
              }
            },
            late: {
              $sum: {
                $map: {
                  input: "$statuses",
                  as: "s",
                  in: { $cond: [{ $eq: ["$$s.status", "Late"] }, "$$s.count", 0] }
                }
              }
            },
            halfDay: {
              $sum: {
                $map: {
                  input: "$statuses",
                  as: "s",
                  in: { $cond: [{ $eq: ["$$s.status", "Half Day"] }, "$$s.count", 0] }
                }
              }
            },
            earlyDeparture: {
              $sum: {
                $map: {
                  input: "$statuses",
                  as: "s",
                  in: { $cond: [{ $eq: ["$$s.status", "Early Departure"] }, "$$s.count", 0] }
                }
              }
            },
            onLeave: {
              $sum: {
                $map: {
                  input: "$statuses",
                  as: "s",
                  in: { $cond: [{ $eq: ["$$s.status", "On Leave"] }, "$$s.count", 0] }
                }
              }
            },
            totalHours: 1,
            overtimeHours: 1
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // Weekly trends
      Attendance.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              week: { $week: "$date" },
              year: { $year: "$date" }
            },
            present: {
              $sum: { $cond: [{ $in: ["$status", ["Present", "Late", "Half Day"]] }, 1, 0] }
            },
            total: { $sum: 1 },
            totalHours: { $sum: "$totalWorkHours" },
            overtimeHours: { $sum: "$overtimeHours" }
          }
        },
        {
          $project: {
            week: "$_id.week",
            year: "$_id.year",
            present: 1,
            total: 1,
            attendanceRate: {
              $cond: [
                { $gt: ["$total", 0] },
                { $multiply: [{ $divide: ["$present", "$total"] }, 100] },
                0
              ]
            },
            averageHours: {
              $cond: [
                { $gt: ["$present", 0] },
                { $divide: ["$totalHours", "$present"] },
                0
              ]
            },
            totalOvertime: "$overtimeHours"
          }
        },
        { $sort: { year: 1, week: 1 } }
      ]),

      // Status summary - IMPROVED
      Attendance.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalHours: { $sum: '$totalWorkHours' },
            averageHours: { $avg: '$totalWorkHours' },
            totalOvertime: { $sum: '$overtimeHours' }
          }
        }
      ]),

      // Overtime analysis
      Attendance.aggregate([
        {
          $match: {
            ...query,
            overtimeHours: { $gt: 0 }
          }
        },
        {
          $group: {
            _id: null,
            totalOvertime: { $sum: '$overtimeHours' },
            averageOvertime: { $avg: '$overtimeHours' },
            maxOvertime: { $max: '$overtimeHours' },
            overtimeDays: { $sum: 1 }
          }
        }
      ]),

      // Leave data
      Leave.aggregate([
        {
          $match: {
            employee: new mongoose.Types.ObjectId(employeeId),
            status: "Approved",
            $or: [
              { startDate: { $lte: endDate, $gte: actualStartDate } },
              { endDate: { $lte: endDate, $gte: actualStartDate } },
              { 
                $and: [
                  { startDate: { $lte: actualStartDate } },
                  { endDate: { $gte: endDate } }
                ]
              }
            ]
          }
        },
        {
          $project: {
            startDate: 1,
            endDate: 1,
            leaveType: 1,
            duration: {
              $divide: [
                { $subtract: ["$endDate", "$startDate"] },
                1000 * 60 * 60 * 24
              ]
            }
          }
        }
      ])
    ]);

    // Calculate total working days (exclude weekends) - Helper function ka replacement
    let totalWorkingDays = 0;
    const current = new Date(actualStartDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      // Exclude weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        totalWorkingDays++;
      }
      current.setDate(current.getDate() + 1);
    }

    // Calculate weekly consistency - Helper function ka replacement
    let consistency = 0;
    if (weeklyTrends.length > 0) {
      const rates = weeklyTrends.map(week => week.attendanceRate || 0);
      const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
      const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - average, 2), 0) / rates.length;
      consistency = Math.max(0, 100 - Math.sqrt(variance));
    }

    // Calculate improvement - Helper function ka replacement
    let improvement = 0;
    if (weeklyTrends.length >= 2) {
      const sortedWeeks = weeklyTrends.sort((a, b) => 
        a.year === b.year ? a.week - b.week : a.year - b.year
      );
      const firstWeek = sortedWeeks[0];
      const lastWeek = sortedWeeks[sortedWeeks.length - 1];
      
      if (firstWeek.attendanceRate > 0) {
        improvement = ((lastWeek.attendanceRate - firstWeek.attendanceRate) / firstWeek.attendanceRate) * 100;
      }
    }

    // Calculate comprehensive overview
    const totalPresent = statusSummary.reduce((sum, item) => 
      sum + (['Present', 'Late', 'Half Day'].includes(item._id) ? item.count : 0), 0);
    
    const totalAbsent = statusSummary.reduce((sum, item) => 
      sum + (item._id === 'Absent' ? item.count : 0), 0);
    
    const totalLate = statusSummary.reduce((sum, item) => 
      sum + (item._id === 'Late' ? item.count : 0), 0);
    
    const totalHalfDay = statusSummary.reduce((sum, item) => 
      sum + (item._id === 'Half Day' ? item.count : 0), 0);
    
    const totalEarlyDeparture = statusSummary.reduce((sum, item) => 
      sum + (item._id === 'Early Departure' ? item.count : 0), 0);
    
    const totalOnLeave = statusSummary.reduce((sum, item) => 
      sum + (item._id === 'On Leave' ? item.count : 0), 0);

    const totalHours = statusSummary.reduce((sum, item) => sum + (item.totalHours || 0), 0);
    const totalOvertime = statusSummary.reduce((sum, item) => sum + (item.totalOvertime || 0), 0);

    // Calculate attendance rate based on working days
    const attendanceRate = totalWorkingDays > 0 ? 
      ((totalPresent + totalHalfDay * 0.5) / totalWorkingDays * 100) : 0;

    const averageHoursPerDay = totalPresent > 0 ? 
      (totalHours / totalPresent) : 0;

    // Format status breakdown
    const statusBreakdown = {};
    statusSummary.forEach(item => {
      statusBreakdown[item._id] = {
        count: item.count,
        averageHours: item.averageHours ? item.averageHours.toFixed(2) : "0.00",
        totalHours: item.totalHours ? item.totalHours.toFixed(2) : "0.00",
        totalOvertime: item.totalOvertime || 0
      };
    });

    // Overtime analysis with safe defaults
    const overtimeStats = overtimeAnalysis[0] || {
      totalOvertime: 0,
      averageOvertime: 0,
      maxOvertime: 0,
      overtimeDays: 0
    };

    // Leave summary
    const totalLeaveDays = leaveData.reduce((sum, leave) => {
      const leaveStart = new Date(Math.max(leave.startDate, actualStartDate));
      const leaveEnd = new Date(Math.min(leave.endDate, endDate));
      const leaveDays = Math.ceil((leaveEnd - leaveStart) / (1000 * 60 * 60 * 24)) + 1;
      return sum + Math.max(0, leaveDays);
    }, 0);

    // Calculate punctuality rate
    const punctualityRate = totalPresent > 0 ? 
      ((totalPresent - totalLate) / totalPresent * 100) : 0;

    res.status(200).json({
      success: true,
      summary: {
        period: {
          type: period,
          startDate: actualStartDate,
          endDate: endDate,
          totalWorkingDays: totalWorkingDays
        },
        overview: {
          // Basic stats
          totalWorkingDays: totalWorkingDays,
          totalPresent: totalPresent,
          totalAbsent: totalAbsent,
          totalLate: totalLate,
          totalHalfDay: totalHalfDay,
          totalEarlyDeparture: totalEarlyDeparture,
          totalOnLeave: totalOnLeave,
          totalLeaveDays: totalLeaveDays,
          
          // Calculated metrics
          attendanceRate: parseFloat(attendanceRate.toFixed(1)),
          totalHours: parseFloat(totalHours.toFixed(2)),
          averageHoursPerDay: parseFloat(averageHoursPerDay.toFixed(2)),
          totalOvertime: parseFloat(totalOvertime.toFixed(2)),
          
          // Performance metrics
          effectiveAttendance: totalPresent + (totalHalfDay * 0.5),
          punctualityRate: parseFloat(punctualityRate.toFixed(1)),
          consistency: parseFloat(consistency.toFixed(1)),
          improvement: parseFloat(improvement.toFixed(1))
        },
        analytics: {
          dailyTrend: dailyStats.map(day => ({
            date: day.date,
            present: day.present || 0,
            absent: day.absent || 0,
            late: day.late || 0,
            halfDay: day.halfDay || 0,
            earlyDeparture: day.earlyDeparture || 0,
            onLeave: day.onLeave || 0,
            totalHours: day.totalHours || 0,
            overtimeHours: day.overtimeHours || 0
          })),
          weeklyTrend: weeklyTrends.map(week => ({
            week: `Week ${week.week}, ${week.year}`,
            present: week.present || 0,
            total: week.total || 0,
            attendanceRate: parseFloat((week.attendanceRate || 0).toFixed(1)),
            averageHours: parseFloat((week.averageHours || 0).toFixed(2)),
            totalOvertime: week.totalOvertime || 0
          })),
          statusBreakdown: statusBreakdown,
          overtimeAnalysis: {
            totalOvertime: parseFloat((overtimeStats.totalOvertime || 0).toFixed(2)),
            averageOvertime: parseFloat((overtimeStats.averageOvertime || 0).toFixed(2)),
            maxOvertime: parseFloat((overtimeStats.maxOvertime || 0).toFixed(2)),
            overtimeDays: overtimeStats.overtimeDays || 0
          }
        }
      }
    });

  } catch (error) {
    console.error("Get my attendance summary error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching attendance summary",
      error: error.message
    });
  }
};

// @desc    Get my attendance calendar view
// @route   GET /api/attendance/my-calendar
// @access  Private
// @desc    Get my attendance calendar view
// @route   GET /api/attendance/my-calendar
// @access  Private
export const getMyAttendanceCalendar = async (req, res) => {
  try {
    const {
      year = new Date().getFullYear(),
      month = new Date().getMonth() + 1
    } = req.query;

    const employeeId = req.employee._id;

    // Get employee details including dateOfJoining
    const employee = await Employee.findById(employeeId).select('dateOfJoining');
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    // Calculate start and end dates for the month (with timezone fix)
    const monthStartDate = new Date(Date.UTC(year, month - 1, 1));
    const monthEndDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // Last day of the month
    
    // Get current date (start of day)
    const currentDate = new Date();
    const todayStart = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()));
    
    // Determine actual start date (join date vs month start date)
    const actualStartDate = employee.dateOfJoining > monthStartDate ? 
      new Date(employee.dateOfJoining) : new Date(monthStartDate);
    
    // Determine actual end date (current date vs month end date)
    const actualEndDate = todayStart < monthEndDate ? 
      new Date(todayStart) : new Date(monthEndDate);

    // If join date is after month end or current date is before month start, return empty
    if (actualStartDate > actualEndDate) {
      return res.status(200).json({
        success: true,
        calendar: {
          year: parseInt(year),
          month: parseInt(month),
          monthName: monthStartDate.toLocaleDateString('en-US', { month: 'long' }),
          data: [],
          summary: {
            totalDays: 0,
            workingDays: 0,
            totalHours: "0.00",
            totalOvertime: "0.00",
            attendanceRate: 0
          }
        }
      });
    }

    const query = {
      employee: employeeId,
      date: { 
        $gte: actualStartDate, 
        $lte: actualEndDate 
      }
    };

    const attendances = await Attendance.find(query)
      .select('date status punchIn punchOut totalWorkHours overtimeHours')
      .sort({ date: 1 })
      .lean();

    // Format calendar data only for relevant dates
    const calendarData = [];
    const currentIterationDate = new Date(actualStartDate);

    while (currentIterationDate <= actualEndDate) {
      const dateStr = currentIterationDate.toISOString().split('T')[0];
      const attendance = attendances.find(a => {
        const attendanceDateStr = a.date.toISOString().split('T')[0];
        return attendanceDateStr === dateStr;
      });

      const isJoinDate = dateStr === employee.dateOfJoining.toISOString().split('T')[0];
      const isFutureDate = currentIterationDate > todayStart;
      const isToday = dateStr === todayStart.toISOString().split('T')[0];

      calendarData.push({
        date: new Date(currentIterationDate),
        day: currentIterationDate.getDate(),
        dayOfWeek: currentIterationDate.toLocaleDateString('en-US', { weekday: 'short' }),
        status: isFutureDate ? 'Future' : (attendance?.status || 'Not Recorded'),
        punchIn: attendance?.punchIn?.timestamp ?
          new Date(attendance.punchIn.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }) : null,
        punchOut: attendance?.punchOut?.timestamp ?
          new Date(attendance.punchOut.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }) : null,
        workHours: attendance?.totalWorkHours || 0,
        overtime: attendance?.overtimeHours || 0,
        isToday: isToday,
        isJoinDate: isJoinDate,
        isFutureDate: isFutureDate
      });

      currentIterationDate.setDate(currentIterationDate.getDate() + 1);
    }

    // Calculate total relevant days correctly
    const totalRelevantDays = calendarData.length;

    // Month summary - only count days from join date to current date
    const monthSummary = attendances.reduce((acc, attendance) => {
      if (attendance.status === 'Present' || attendance.status === 'Late' || attendance.status === 'Half Day') {
        acc.workingDays++;
      }
      acc.totalHours += attendance.totalWorkHours || 0;
      acc.totalOvertime += attendance.overtimeHours || 0;
      return acc;
    }, { workingDays: 0, totalHours: 0, totalOvertime: 0 });

    res.status(200).json({
      success: true,
      calendar: {
        year: parseInt(year),
        month: parseInt(month),
        monthName: monthStartDate.toLocaleDateString('en-US', { month: 'long' }),
        data: calendarData,
        summary: {
          totalDays: totalRelevantDays,
          workingDays: monthSummary.workingDays,
          totalHours: monthSummary.totalHours.toFixed(2),
          totalOvertime: monthSummary.totalOvertime.toFixed(2),
          attendanceRate: totalRelevantDays > 0 ?
            ((monthSummary.workingDays / totalRelevantDays) * 100).toFixed(1) : 0,
          joinDate: employee.dateOfJoining,
          periodStart: actualStartDate,
          periodEnd: actualEndDate
        }
      }
    });

  } catch (error) {
    console.error("Get my attendance calendar error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching attendance calendar",
      error: error.message
    });
  }
};

// Helper function to calculate weekly consistency
const calculateWeeklyConsistency = (weeklyTrends) => {
  if (!weeklyTrends || weeklyTrends.length === 0) return 0;
  
  const totalWeeks = weeklyTrends.length;
  const totalAttendanceRate = weeklyTrends.reduce((sum, week) => sum + (week.attendanceRate || 0), 0);
  
  return totalWeeks > 0 ? parseFloat((totalAttendanceRate / totalWeeks).toFixed(1)) : 0;
};

// Helper function to calculate improvement
const calculateImprovement = (weeklyTrends) => {
  if (!weeklyTrends || weeklyTrends.length < 2) return 0;
  
  const sortedTrends = weeklyTrends.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.week - b.week;
  });
  
  const firstWeek = sortedTrends[0].attendanceRate || 0;
  const lastWeek = sortedTrends[sortedTrends.length - 1].attendanceRate || 0;
  
  return parseFloat((lastWeek - firstWeek).toFixed(1));
};

export const getEmployeeAttendances = async (req, res) => {
  // console.log("query ", req.query)
  try {
    const { employeeId } = req.params;
    const {
      // Common parameters
      type = 'records', // 'records', 'summary', 'calendar'

      // Records parameters
      startDate,
      endDate,
      status,
      page = 1,
      limit = 30,
      sortBy = "date",
      sortOrder = "desc",

      // Summary parameters
      period = 'today',

      // Calendar parameters
      year = new Date().getFullYear(),
      month = new Date().getMonth() + 1
    } = req.query;

    // Validate employeeId
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required"
      });
    }

    // Validate mongoose ID
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Employee ID format"
      });
    }

    // Verify employee exists
    const employee = await Employee.findById(employeeId).select('name employeeId');
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    // Check permissions - only HR/Manager/Team Leader or the employee themselves can access
    const isAuthorized = req.employee.role === "HR_Manager" ||
      req.employee.role === "Team_Leader" ||
      req.employee._id.toString() === employeeId;

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own attendance records."
      });
    }

    switch (type) {
      case 'records':
        return await getEmployeeAttendanceRecords(req, res, employeeId, employee, {
          startDate, endDate, status, page, limit, sortBy, sortOrder
        });
      case 'summary':
        return await getEmployeeAttendanceSummary(req, res, employeeId, employee, {
          period
        });
      case 'calendar':
        return await getEmployeeAttendanceCalendar(req, res, employeeId, employee, {
          year, month
        });
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid type parameter. Use 'records', 'summary', or 'calendar'"
        });
    }

  } catch (error) {
    console.error("Get employee attendances error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching employee attendance data",
      error: error.message
    });
  }
};

// Helper function for records type
const getEmployeeAttendanceRecords = async (req, res, employeeId, employee, filters) => {
  try {
    const {
      startDate,
      endDate,
      status,
      page = 1,
      limit = 30,
      sortBy = "date",
      sortOrder = "desc"
    } = filters;

    const query = { employee: employeeId };

    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      query.date = {
        $gte: start,
        $lte: end
      };
    } else {
      // Default to last 30 days if no date range provided
      const defaultEndDate = new Date();
      const defaultStartDate = new Date();
      defaultStartDate.setDate(defaultStartDate.getDate() - 30);
      defaultStartDate.setHours(0, 0, 0, 0);
      defaultEndDate.setHours(23, 59, 59, 999);

      query.date = {
        $gte: defaultStartDate,
        $lte: defaultEndDate
      };
    }

    // Status filter
    if (status && status !== 'All' && status !== '') {
      query.status = status;
    }

    const skip = (page - 1) * parseInt(limit);

    // Get attendance records with pagination
    const attendances = await Attendance.find(query)
      .populate('employee', 'name employeeId profilePicture')
      .populate('shift', 'name startTime endTime')
      .populate('officeLocation', 'officeName officeAddress')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Attendance.countDocuments(query);

    // Calculate summary statistics
    const summaryStats = await Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalHours: { $sum: '$totalWorkHours' },
          totalOvertime: { $sum: '$overtimeHours' }
        }
      }
    ]);

    // Format summary statistics
    const stats = {
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      onLeave: 0,
      holiday: 0,
      weekOff: 0,
      earlyDeparture: 0,
      totalHours: 0,
      totalOvertime: 0
    };

    summaryStats.forEach(item => {
      if (item._id && stats.hasOwnProperty(item._id.toLowerCase().replace(' ', ''))) {
        const key = item._id.toLowerCase().replace(' ', '');
        stats[key] = item.count;
      }
      stats.totalHours += item.totalHours || 0;
      stats.totalOvertime += item.totalOvertime || 0;
    });

    const totalWorkingDays = stats.present + stats.late + stats.halfDay + stats.earlyDeparture;
    const attendancePercentage = totalWorkingDays > 0
      ? ((stats.present + (stats.halfDay * 0.5) + (stats.earlyDeparture * 0.8)) / totalWorkingDays * 100)
      : 0;

    // Format response data
    const formattedAttendances = attendances.map(attendance => ({
      _id: attendance._id,
      date: attendance.date,
      punchIn: attendance.punchIn,
      punchOut: attendance.punchOut,
      totalWorkHours: attendance.totalWorkHours,
      overtimeHours: attendance.overtimeHours,
      status: attendance.status,
      earlyDepartureMinutes: attendance.earlyDepartureMinutes,
      earlyDepartureReason: attendance.earlyDepartureReason,
      isWithinOfficeLocation: attendance.isWithinOfficeLocation,
      shift: attendance.shift,
      officeLocation: attendance.officeLocation,
      employee: attendance.employee
    }));

    // Calculate date range for response
    const responseStartDate = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const responseEndDate = endDate ? new Date(endDate) : new Date();

    res.status(200).json({
      success: true,
      type: 'records',
      employee: {
        _id: employeeId,
        name: employee.name,
        employeeId: employee.employeeId
      },
      attendances: formattedAttendances,
      summary: {
        period: {
          startDate: responseStartDate,
          endDate: responseEndDate
        },
        stats: {
          totalRecords: total,
          present: stats.present,
          absent: stats.absent,
          late: stats.late,
          halfDay: stats.halfDay,
          onLeave: stats.onLeave,
          holiday: stats.holiday,
          weekOff: stats.weekOff,
          earlyDeparture: stats.earlyDeparture,
          totalWorkingDays: totalWorkingDays
        },
        hours: {
          totalHours: parseFloat(stats.totalHours.toFixed(2)),
          totalOvertime: parseFloat(stats.totalOvertime.toFixed(2)),
          averageHoursPerDay: totalWorkingDays > 0 ? parseFloat((stats.totalHours / totalWorkingDays).toFixed(2)) : 0
        },
        performance: {
          attendancePercentage: parseFloat(attendancePercentage.toFixed(1)),
          consistency: calculateConsistency(summaryStats)
        }
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error("Error in getEmployeeAttendanceRecords:", error);
    throw error;
  }
};

// Helper function for summary type
const getEmployeeAttendanceSummary = async (req, res, employeeId, employee, filters) => {
  try {
    const { period = 'month' } = filters;

    let startDate, endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Calculate date range based on period
    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'yesterday':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'quarter':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
    }

    const query = {
      employee: new mongoose.Types.ObjectId(employeeId),
      date: { $gte: startDate, $lte: endDate }
    };

    // Get detailed analytics
    const [dailyStats, weeklyTrends, statusSummary, overtimeAnalysis, monthlyTrend] = await Promise.all([
      // Daily attendance stats
      Attendance.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              status: "$status"
            },
            count: { $sum: 1 },
            totalHours: { $sum: "$totalWorkHours" },
            overtimeHours: { $sum: "$overtimeHours" }
          }
        },
        {
          $group: {
            _id: "$_id.date",
            present: {
              $sum: { $cond: [{ $eq: ["$_id.status", "Present"] }, "$count", 0] }
            },
            absent: {
              $sum: { $cond: [{ $eq: ["$_id.status", "Absent"] }, "$count", 0] }
            },
            late: {
              $sum: { $cond: [{ $eq: ["$_id.status", "Late"] }, "$count", 0] }
            },
            halfDay: {
              $sum: { $cond: [{ $eq: ["$_id.status", "Half Day"] }, "$count", 0] }
            },
            earlyDeparture: {
              $sum: { $cond: [{ $eq: ["$_id.status", "Early Departure"] }, "$count", 0] }
            },
            onLeave: {
              $sum: { $cond: [{ $eq: ["$_id.status", "On Leave"] }, "$count", 0] }
            },
            holiday: {
              $sum: { $cond: [{ $eq: ["$_id.status", "Holiday"] }, "$count", 0] }
            },
            weekOff: {
              $sum: { $cond: [{ $eq: ["$_id.status", "Week Off"] }, "$count", 0] }
            },
            totalHours: { $sum: "$totalHours" },
            overtimeHours: { $sum: "$overtimeHours" }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // Weekly trends
      Attendance.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              week: { $week: "$date" },
              year: { $year: "$date" }
            },
            present: {
              $sum: { $cond: [{ $eq: ["$status", "Present"] }, 1, 0] }
            },
            absent: {
              $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] }
            },
            late: {
              $sum: { $cond: [{ $eq: ["$status", "Late"] }, 1, 0] }
            },
            halfDay: {
              $sum: { $cond: [{ $eq: ["$status", "Half Day"] }, 1, 0] }
            },
            earlyDeparture: {
              $sum: { $cond: [{ $eq: ["$status", "Early Departure"] }, 1, 0] }
            },
            total: { $sum: 1 },
            totalHours: { $sum: "$totalWorkHours" },
            overtimeHours: { $sum: "$overtimeHours" }
          }
        },
        {
          $project: {
            week: "$_id.week",
            year: "$_id.year",
            present: 1,
            absent: 1,
            late: 1,
            halfDay: 1,
            earlyDeparture: 1,
            total: 1,
            attendanceRate: {
              $cond: [
                { $gt: ["$total", 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        {
                          $add: [
                            "$present",
                            { $multiply: ["$late", 0.8] },
                            { $multiply: ["$halfDay", 0.5] },
                            { $multiply: ["$earlyDeparture", 0.8] }
                          ]
                        },
                        "$total"
                      ]
                    },
                    100
                  ]
                },
                0
              ]
            },
            averageHours: {
              $cond: [
                { $gt: [{ $add: ["$present", "$late", "$earlyDeparture"] }, 0] },
                { $divide: ["$totalHours", { $add: ["$present", "$late", "$earlyDeparture"] }] },
                0
              ]
            },
            totalOvertime: "$overtimeHours"
          }
        },
        { $sort: { year: 1, week: 1 } }
      ]),

      // Status summary
      Attendance.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            averageHours: { $avg: '$totalWorkHours' },
            totalOvertime: { $sum: '$overtimeHours' }
          }
        }
      ]),

      // Overtime analysis
      Attendance.aggregate([
        {
          $match: {
            ...query,
            overtimeHours: { $gt: 0 }
          }
        },
        {
          $group: {
            _id: null,
            totalOvertime: { $sum: '$overtimeHours' },
            averageOvertime: { $avg: '$overtimeHours' },
            maxOvertime: { $max: '$overtimeHours' },
            overtimeDays: { $sum: 1 }
          }
        }
      ]),

      // Monthly trend for charts
      Attendance.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              month: { $month: "$date" },
              year: { $year: "$date" }
            },
            present: {
              $sum: { $cond: [{ $eq: ["$status", "Present"] }, 1, 0] }
            },
            absent: {
              $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] }
            },
            late: {
              $sum: { $cond: [{ $eq: ["$status", "Late"] }, 1, 0] }
            },
            halfDay: {
              $sum: { $cond: [{ $eq: ["$status", "Half Day"] }, 1, 0] }
            },
            earlyDeparture: {
              $sum: { $cond: [{ $eq: ["$status", "Early Departure"] }, 1, 0] }
            },
            total: { $sum: 1 },
            totalHours: { $sum: "$totalWorkHours" },
            totalOvertime: { $sum: "$overtimeHours" }
          }
        },
        {
          $project: {
            month: "$_id.month",
            year: "$_id.year",
            present: 1,
            absent: 1,
            late: 1,
            halfDay: 1,
            earlyDeparture: 1,
            total: 1,
            attendanceRate: {
              $cond: [
                { $gt: ["$total", 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        {
                          $add: [
                            "$present",
                            { $multiply: ["$late", 0.8] },
                            { $multiply: ["$halfDay", 0.5] },
                            { $multiply: ["$earlyDeparture", 0.8] }
                          ]
                        },
                        "$total"
                      ]
                    },
                    100
                  ]
                },
                0
              ]
            },
            totalHours: 1,
            totalOvertime: 1
          }
        },
        { $sort: { year: 1, month: 1 } }
      ])
    ]);

    // Calculate overall statistics
    const totalRecords = dailyStats.reduce((sum, day) => {
      const dayTotal = (day.present || 0) + (day.absent || 0) + (day.late || 0) +
        (day.halfDay || 0) + (day.earlyDeparture || 0) +
        (day.onLeave || 0) + (day.holiday || 0) + (day.weekOff || 0);
      return sum + dayTotal;
    }, 0);

    const totalPresent = dailyStats.reduce((sum, day) => sum + (day.present || 0), 0);
    const totalLate = dailyStats.reduce((sum, day) => sum + (day.late || 0), 0);
    const totalHalfDay = dailyStats.reduce((sum, day) => sum + (day.halfDay || 0), 0);
    const totalEarlyDeparture = dailyStats.reduce((sum, day) => sum + (day.earlyDeparture || 0), 0);
    const totalOnLeave = dailyStats.reduce((sum, day) => sum + (day.onLeave || 0), 0);
    const totalHoliday = dailyStats.reduce((sum, day) => sum + (day.holiday || 0), 0);
    const totalWeekOff = dailyStats.reduce((sum, day) => sum + (day.weekOff || 0), 0);

    const totalHours = dailyStats.reduce((sum, day) => sum + (day.totalHours || 0), 0);
    const totalOvertime = dailyStats.reduce((sum, day) => sum + (day.overtimeHours || 0), 0);

    // Calculate attendance rate considering different status weights
    const effectivePresentDays = totalPresent +
      (totalLate * 0.8) +
      (totalHalfDay * 0.5) +
      (totalEarlyDeparture * 0.8);

    const totalWorkingDays = totalRecords - totalHoliday - totalWeekOff - totalOnLeave;
    const attendanceRate = totalWorkingDays > 0 ?
      (effectivePresentDays / totalWorkingDays * 100) : 0;

    const averageHoursPerDay = (totalPresent + totalLate + totalEarlyDeparture) > 0 ?
      (totalHours / (totalPresent + totalLate + totalEarlyDeparture)) : 0;

    // Format status summary
    const statusBreakdown = {};
    statusSummary.forEach(item => {
      statusBreakdown[item._id] = {
        count: item.count,
        averageHours: item.averageHours ? parseFloat(item.averageHours.toFixed(2)) : 0,
        totalOvertime: item.totalOvertime || 0
      };
    });

    // Ensure all status types are present in breakdown
    const allStatuses = ["Present", "Absent", "Late", "Half Day", "Early Departure", "On Leave", "Holiday", "Week Off"];
    allStatuses.forEach(status => {
      if (!statusBreakdown[status]) {
        statusBreakdown[status] = {
          count: 0,
          averageHours: 0,
          totalOvertime: 0
        };
      }
    });

    const overtimeStats = overtimeAnalysis[0] || {
      totalOvertime: 0,
      averageOvertime: 0,
      maxOvertime: 0,
      overtimeDays: 0
    };

    const consistency = calculateWeeklyConsistency(weeklyTrends);
    const improvement = calculateImprovement(weeklyTrends);

    const responseData = {
      success: true,
      type: 'summary',
      employee: {
        _id: employeeId,
        name: employee.name,
        employeeId: employee.employeeId
      },
      summary: {
        period: {
          type: period,
          startDate: startDate,
          endDate: endDate
        },
        overview: {
          totalDays: totalRecords,
          presentDays: totalPresent,
          lateDays: totalLate,
          halfDays: totalHalfDay,
          earlyDepartureDays: totalEarlyDeparture,
          onLeaveDays: totalOnLeave,
          holidayDays: totalHoliday,
          weekOffDays: totalWeekOff,
          workingDays: totalWorkingDays,
          attendanceRate: parseFloat(attendanceRate.toFixed(1)),
          totalHours: parseFloat(totalHours.toFixed(2)),
          averageHoursPerDay: parseFloat(averageHoursPerDay.toFixed(2)),
          totalOvertime: parseFloat(totalOvertime.toFixed(2))
        },
        analytics: {
          dailyTrend: dailyStats.map(day => ({
            date: day._id,
            present: day.present || 0,
            absent: day.absent || 0,
            late: day.late || 0,
            halfDay: day.halfDay || 0,
            earlyDeparture: day.earlyDeparture || 0,
            onLeave: day.onLeave || 0,
            holiday: day.holiday || 0,
            weekOff: day.weekOff || 0,
            totalHours: parseFloat((day.totalHours || 0).toFixed(2)),
            overtimeHours: parseFloat((day.overtimeHours || 0).toFixed(2))
          })),
          weeklyTrend: weeklyTrends,
          monthlyTrend: monthlyTrend,
          statusBreakdown: statusBreakdown,
          overtimeAnalysis: {
            totalOvertime: parseFloat((overtimeStats.totalOvertime || 0).toFixed(2)),
            averageOvertime: parseFloat((overtimeStats.averageOvertime || 0).toFixed(2)),
            maxOvertime: parseFloat((overtimeStats.maxOvertime || 0).toFixed(2)),
            overtimeDays: overtimeStats.overtimeDays || 0
          }
        },
        performance: {
          consistency: parseFloat(consistency.toFixed(1)),
          improvement: parseFloat(improvement.toFixed(1)),
          trends: {
            weekly: weeklyTrends,
            monthly: monthlyTrend
          }
        }
      }
    };

    res.status(200).json(responseData);

  } catch (error) {
    console.error("Error in getEmployeeAttendanceSummary:", error);
    throw error;
  }
};

// Helper function for calendar type
const getEmployeeAttendanceCalendar = async (req, res, employeeId, employee, filters) => {
  try {
    const {
      year = new Date().getFullYear(),
      month = new Date().getMonth() + 1
    } = filters;

    // Validate year and month
    if (year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "Invalid year"
      });
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Invalid month"
      });
    }

    // Calculate start and end dates for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of the month
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const query = {
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate }
    };

    const attendances = await Attendance.find(query)
      .select('date status punchIn punchOut totalWorkHours overtimeHours earlyDepartureMinutes')
      .sort({ date: 1 })
      .lean();

    // Format calendar data
    const calendarData = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const attendance = attendances.find(a => {
        const attendanceDateStr = a.date.toISOString().split('T')[0];
        return attendanceDateStr === dateStr;
      });

      calendarData.push({
        date: new Date(currentDate),
        day: currentDate.getDate(),
        dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        status: attendance?.status || 'Not Recorded',
        punchIn: attendance?.punchIn?.timestamp ?
          new Date(attendance.punchIn.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }) : null,
        punchOut: attendance?.punchOut?.timestamp ?
          new Date(attendance.punchOut.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }) : null,
        workHours: attendance?.totalWorkHours || 0,
        overtime: attendance?.overtimeHours || 0,
        earlyDeparture: attendance?.earlyDepartureMinutes || 0,
        isToday: dateStr === new Date().toISOString().split('T')[0]
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Month summary
    const monthSummary = attendances.reduce((acc, attendance) => {
      acc.totalDays++;
      if (attendance.status === 'Present' || attendance.status === 'Late' || attendance.status === 'Early Departure') {
        acc.workingDays++;
      }
      if (attendance.status === 'Present') {
        acc.presentDays++;
      }
      if (attendance.status === 'Late') {
        acc.lateDays++;
      }
      if (attendance.status === 'Half Day') {
        acc.halfDays++;
      }
      if (attendance.status === 'Early Departure') {
        acc.earlyDepartureDays++;
      }
      acc.totalHours += attendance.totalWorkHours || 0;
      acc.totalOvertime += attendance.overtimeHours || 0;
      return acc;
    }, {
      totalDays: 0,
      workingDays: 0,
      presentDays: 0,
      lateDays: 0,
      halfDays: 0,
      earlyDepartureDays: 0,
      totalHours: 0,
      totalOvertime: 0
    });

    // Calculate effective attendance rate
    const effectiveWorkingDays = monthSummary.presentDays +
      (monthSummary.lateDays * 0.8) +
      (monthSummary.halfDays * 0.5) +
      (monthSummary.earlyDepartureDays * 0.8);

    const attendanceRate = monthSummary.totalDays > 0 ?
      ((effectiveWorkingDays / monthSummary.totalDays) * 100) : 0;

    res.status(200).json({
      success: true,
      type: 'calendar',
      employee: {
        _id: employeeId,
        name: employee.name,
        employeeId: employee.employeeId
      },
      calendar: {
        year: parseInt(year),
        month: parseInt(month),
        monthName: startDate.toLocaleDateString('en-US', { month: 'long' }),
        data: calendarData,
        summary: {
          totalDays: monthSummary.totalDays,
          workingDays: monthSummary.workingDays,
          presentDays: monthSummary.presentDays,
          lateDays: monthSummary.lateDays,
          halfDays: monthSummary.halfDays,
          earlyDepartureDays: monthSummary.earlyDepartureDays,
          totalHours: parseFloat(monthSummary.totalHours.toFixed(2)),
          totalOvertime: parseFloat(monthSummary.totalOvertime.toFixed(2)),
          attendanceRate: parseFloat(attendanceRate.toFixed(1))
        }
      }
    });
  } catch (error) {
    console.error("Error in getEmployeeAttendanceCalendar:", error);
    throw error;
  }
};
// @desc    Get comprehensive attendance data for logged-in employee (all-in-one)
// @route   GET /api/attendance/my-attendance-comprehensive
// @access  Private
export const getMyAttendanceComprehensive = async (req, res) => {
  try {
    const employeeId = req.employee._id;
    const {
      type = 'overview', // 'overview', 'records', 'summary', 'calendar', 'today'
      
      // Records parameters
      startDate,
      endDate,
      status,
      page = 1,
      limit = 30,
      sortBy = "date",
      sortOrder = "desc",

      // Summary parameters
      period = 'month',

      // Calendar parameters
      year = new Date().getFullYear(),
      month = new Date().getMonth() + 1
    } = req.query;

    // Validate employee
    const employee = await Employee.findById(employeeId).select('name employeeId department designation');
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    let responseData = {
      success: true,
      employee: {
        _id: employeeId,
        name: employee.name,
        employeeId: employee.employeeId,
        department: employee.department,
        designation: employee.designation
      }
    };

    // Handle different types of requests
    switch (type) {
      case 'today':
        const todayData = await getTodayAttendanceData(employeeId);
        responseData = { ...responseData, ...todayData };
        break;

      case 'records':
        const recordsData = await getAttendanceRecordsData(employeeId, {
          startDate, endDate, status, page, limit, sortBy, sortOrder
        });
        responseData = { ...responseData, ...recordsData };
        break;

      case 'summary':
        const summaryData = await getAttendanceSummaryData(employeeId, { period });
        responseData = { ...responseData, ...summaryData };
        break;

      case 'calendar':
        const calendarData = await getAttendanceCalendarData(employeeId, { year, month });
        responseData = { ...responseData, ...calendarData };
        break;

      case 'overview':
      default:
        const overviewData = await getAttendanceOverviewData(employeeId, {
          startDate, endDate, period, year, month
        });
        responseData = { ...responseData, ...overviewData };
        break;
    }

    res.status(200).json(responseData);

  } catch (error) {
    console.error("Get comprehensive attendance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching comprehensive attendance data",
      error: error.message
    });
  }
};

// Helper function for today's attendance
const getTodayAttendanceData = async (employeeId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const attendance = await Attendance.findOne({
    employee: employeeId,
    date: today
  })
    .populate('employee', 'name employeeId profilePicture')
    .populate('shift', 'name startTime endTime')
    .populate('officeLocation', 'officeName officeAddress');

  // If no attendance record, check if it's holiday/week off
  if (!attendance) {
    const employee = await Employee.findById(employeeId)
      .populate('workShift')
      .populate('officeLocation');

    const dayStatus = await calculateDayStatus(employee, today);

    if (dayStatus !== "Working Day") {
      return {
        type: 'today',
        data: {
          attendance: null,
          dayStatus: dayStatus,
          message: `Today is ${dayStatus}`
        }
      };
    }

    return {
      type: 'today',
      data: {
        attendance: null,
        dayStatus: "Working Day - Not Punched In",
        message: "No attendance record for today"
      }
    };
  }

  return {
    type: 'today',
    data: {
      attendance: attendance,
      dayStatus: "Attendance Recorded",
      workSummary: {
        totalHours: attendance.totalWorkHours,
        overtimeHours: attendance.overtimeHours,
        status: attendance.status
      }
    }
  };
};

// Helper function for attendance records
const getAttendanceRecordsData = async (employeeId, filters) => {
  const {
    startDate,
    endDate,
    status,
    page = 1,
    limit = 30,
    sortBy = "date",
    sortOrder = "desc"
  } = filters;

  const query = { employee: employeeId };

  // Date range filter
  if (startDate && endDate) {
    query.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  } else {
    // Default to last 30 days
    const defaultEndDate = new Date();
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    query.date = {
      $gte: defaultStartDate,
      $lte: defaultEndDate
    };
  }

  // Status filter
  if (status && status !== 'All') {
    query.status = status;
  }

  const skip = (page - 1) * parseInt(limit);

  // Get attendance records
  const attendances = await Attendance.find(query)
    .populate('employee', 'name employeeId profilePicture')
    .populate('shift', 'name startTime endTime')
    .populate('officeLocation', 'officeName officeAddress')
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  // Get total count
  const total = await Attendance.countDocuments(query);

  // Calculate summary statistics
  const summaryStats = await Attendance.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalHours: { $sum: '$totalWorkHours' },
        totalOvertime: { $sum: '$overtimeHours' }
      }
    }
  ]);

  // Format statistics
  const stats = {
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
    onLeave: 0,
    totalHours: 0,
    totalOvertime: 0
  };

  summaryStats.forEach(item => {
    switch (item._id) {
      case "Present": stats.present = item.count; break;
      case "Absent": stats.absent = item.count; break;
      case "Late": stats.late = item.count; break;
      case "Half Day": stats.halfDay = item.count; break;
      case "On Leave": stats.onLeave = item.count; break;
    }
    stats.totalHours += item.totalHours || 0;
    stats.totalOvertime += item.totalOvertime || 0;
  });

  const totalWorkingDays = stats.present + stats.late + stats.halfDay;
  const attendancePercentage = totalWorkingDays > 0
    ? ((stats.present + (stats.halfDay * 0.5)) / totalWorkingDays * 100).toFixed(1)
    : 0;

  return {
    type: 'records',
    data: {
      attendances: attendances,
      summary: {
        period: {
          startDate: startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30)),
          endDate: endDate ? new Date(endDate) : new Date()
        },
        stats: {
          totalRecords: total,
          present: stats.present,
          absent: stats.absent,
          late: stats.late,
          halfDay: stats.halfDay,
          onLeave: stats.onLeave,
          totalWorkingDays: totalWorkingDays
        },
        hours: {
          totalHours: stats.totalHours.toFixed(2),
          totalOvertime: stats.totalOvertime.toFixed(2),
          averageHoursPerDay: totalWorkingDays > 0 ? (stats.totalHours / totalWorkingDays).toFixed(2) : "0.00"
        },
        performance: {
          attendancePercentage: parseFloat(attendancePercentage),
          consistency: calculateConsistency(summaryStats)
        }
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    }
  };
};

// Helper function for attendance summary
const getAttendanceSummaryData = async (employeeId, filters) => {
  const { period = 'month' } = filters;
  let startDate, endDate = new Date();

  // Calculate date range
  switch (period) {
    case 'week':
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case 'quarter':
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case 'year':
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
  }

  const query = {
    employee: employeeId,
    date: { $gte: startDate, $lte: endDate }
  };

  // Get analytics data
  const [dailyStats, weeklyTrends, statusSummary, overtimeAnalysis] = await Promise.all([
    // Daily stats
    Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            status: "$status"
          },
          count: { $sum: 1 },
          totalHours: { $sum: "$totalWorkHours" },
          overtimeHours: { $sum: "$overtimeHours" }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          present: {
            $sum: { $cond: [{ $eq: ["$_id.status", "Present"] }, "$count", 0] }
          },
          absent: {
            $sum: { $cond: [{ $eq: ["$_id.status", "Absent"] }, "$count", 0] }
          },
          late: {
            $sum: { $cond: [{ $eq: ["$_id.status", "Late"] }, "$count", 0] }
          },
          totalHours: { $sum: "$totalHours" },
          overtimeHours: { $sum: "$overtimeHours" }
        }
      },
      { $sort: { _id: 1 } }
    ]),

    // Weekly trends
    Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            week: { $week: "$date" },
            year: { $year: "$date" }
          },
          present: {
            $sum: { $cond: [{ $eq: ["$status", "Present"] }, 1, 0] }
          },
          total: { $sum: 1 },
          totalHours: { $sum: "$totalWorkHours" },
          overtimeHours: { $sum: "$overtimeHours" }
        }
      },
      {
        $project: {
          week: "$_id.week",
          year: "$_id.year",
          present: 1,
          total: 1,
          attendanceRate: {
            $cond: [
              { $gt: ["$total", 0] },
              { $multiply: [{ $divide: ["$present", "$total"] }, 100] },
              0
            ]
          },
          averageHours: {
            $cond: [
              { $gt: ["$present", 0] },
              { $divide: ["$totalHours", "$present"] },
              0
            ]
          },
          totalOvertime: "$overtimeHours"
        }
      },
      { $sort: { year: 1, week: 1 } }
    ]),

    // Status summary
    Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          averageHours: { $avg: '$totalWorkHours' },
          totalOvertime: { $sum: '$overtimeHours' }
        }
      }
    ]),

    // Overtime analysis
    Attendance.aggregate([
      {
        $match: {
          ...query,
          overtimeHours: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalOvertime: { $sum: '$overtimeHours' },
          averageOvertime: { $avg: '$overtimeHours' },
          maxOvertime: { $max: '$overtimeHours' },
          overtimeDays: { $sum: 1 }
        }
      }
    ])
  ]);

  // Calculate overall statistics
  const totalRecords = dailyStats.reduce((sum, day) => {
    const dayTotal = (day.present || 0) + (day.absent || 0) + (day.late || 0);
    return sum + dayTotal;
  }, 0);

  const totalPresent = dailyStats.reduce((sum, day) => sum + (day.present || 0), 0);
  const totalHours = dailyStats.reduce((sum, day) => sum + (day.totalHours || 0), 0);
  const totalOvertime = dailyStats.reduce((sum, day) => sum + (day.overtimeHours || 0), 0);

  const attendanceRate = totalRecords > 0 ? (totalPresent / totalRecords * 100).toFixed(1) : 0;
  const averageHoursPerDay = totalPresent > 0 ? (totalHours / totalPresent).toFixed(2) : "0.00";

  // Format status summary
  const statusBreakdown = statusSummary.reduce((acc, item) => {
    acc[item._id] = {
      count: item.count,
      averageHours: item.averageHours ? item.averageHours.toFixed(2) : "0.00",
      totalOvertime: item.totalOvertime || 0
    };
    return acc;
  }, {});

  const overtimeStats = overtimeAnalysis[0] || {
    totalOvertime: 0,
    averageOvertime: 0,
    maxOvertime: 0,
    overtimeDays: 0
  };

  const consistency = calculateWeeklyConsistency(weeklyTrends);
  const improvement = calculateImprovement(weeklyTrends);

  return {
    type: 'summary',
    data: {
      period: {
        type: period,
        startDate: startDate,
        endDate: endDate
      },
      overview: {
        totalDays: totalRecords,
        presentDays: totalPresent,
        attendanceRate: parseFloat(attendanceRate),
        totalHours: parseFloat(totalHours.toFixed(2)),
        averageHoursPerDay: parseFloat(averageHoursPerDay),
        totalOvertime: parseFloat(totalOvertime.toFixed(2))
      },
      analytics: {
        dailyTrend: dailyStats,
        weeklyTrend: weeklyTrends,
        statusBreakdown: statusBreakdown,
        overtimeAnalysis: {
          totalOvertime: parseFloat((overtimeStats.totalOvertime || 0).toFixed(2)),
          averageOvertime: parseFloat((overtimeStats.averageOvertime || 0).toFixed(2)),
          maxOvertime: parseFloat((overtimeStats.maxOvertime || 0).toFixed(2)),
          overtimeDays: overtimeStats.overtimeDays || 0
        }
      },
      performance: {
        consistency: parseFloat(consistency),
        improvement: parseFloat(improvement)
      }
    }
  };
};

// Helper function for calendar view
const getAttendanceCalendarData = async (employeeId, filters) => {
  const {
    year = new Date().getFullYear(),
    month = new Date().getMonth() + 1
  } = filters;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const query = {
    employee: employeeId,
    date: { $gte: startDate, $lte: endDate }
  };

  const attendances = await Attendance.find(query)
    .select('date status punchIn punchOut totalWorkHours overtimeHours')
    .sort({ date: 1 })
    .lean();

  // Format calendar data
  const calendarData = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const attendance = attendances.find(a => a.date.toISOString().split('T')[0] === dateStr);

    calendarData.push({
      date: new Date(currentDate),
      day: currentDate.getDate(),
      dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
      status: attendance?.status || 'Not Recorded',
      punchIn: attendance?.punchIn?.timestamp ?
        new Date(attendance.punchIn.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }) : null,
      punchOut: attendance?.punchOut?.timestamp ?
        new Date(attendance.punchOut.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }) : null,
      workHours: attendance?.totalWorkHours || 0,
      overtime: attendance?.overtimeHours || 0,
      isToday: dateStr === new Date().toISOString().split('T')[0]
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Month summary
  const monthSummary = attendances.reduce((acc, attendance) => {
    acc.totalDays++;
    if (attendance.status === 'Present' || attendance.status === 'Late') {
      acc.workingDays++;
    }
    acc.totalHours += attendance.totalWorkHours || 0;
    acc.totalOvertime += attendance.overtimeHours || 0;
    return acc;
  }, { totalDays: 0, workingDays: 0, totalHours: 0, totalOvertime: 0 });

  return {
    type: 'calendar',
    data: {
      year: parseInt(year),
      month: parseInt(month),
      monthName: startDate.toLocaleDateString('en-US', { month: 'long' }),
      calendarData: calendarData,
      summary: {
        totalDays: monthSummary.totalDays,
        workingDays: monthSummary.workingDays,
        totalHours: monthSummary.totalHours.toFixed(2),
        totalOvertime: monthSummary.totalOvertime.toFixed(2),
        attendanceRate: monthSummary.totalDays > 0 ?
          ((monthSummary.workingDays / monthSummary.totalDays) * 100).toFixed(1) : 0
      }
    }
  };
};

// Helper function for comprehensive overview
const getAttendanceOverviewData = async (employeeId, filters) => {
  const {
    startDate,
    endDate,
    period = 'month',
    year = new Date().getFullYear(),
    month = new Date().getMonth() + 1
  } = filters;

  // Get all data types in parallel
  const [todayData, recordsData, summaryData, calendarData] = await Promise.all([
    getTodayAttendanceData(employeeId),
    getAttendanceRecordsData(employeeId, { 
      startDate: startDate || new Date(new Date().setDate(new Date().getDate() - 7)),
      endDate: endDate || new Date(),
      limit: 5 
    }),
    getAttendanceSummaryData(employeeId, { period }),
    getAttendanceCalendarData(employeeId, { year, month })
  ]);

  return {
    type: 'overview',
    data: {
      today: todayData.data,
      recentRecords: recordsData.data.attendances.slice(0, 5), // Last 5 records
      summary: summaryData.data.overview,
      calendar: calendarData.data.calendarData.slice(-7), // Last 7 days
      quickStats: {
        thisMonth: summaryData.data.overview,
        lastPunch: recordsData.data.attendances[0] || null
      }
    }
  };
};

// Export all functions
export default {
  punchIn,
  punchOut,
  getTodayAttendance,
  getAttendance,
  getAttendanceSummary,
  getAttendanceFilters,
  updateAttendance,
  getMyAttendances,
  getMyAttendanceSummary,
  getMyAttendanceCalendar,
  getMyAttendanceComprehensive
};