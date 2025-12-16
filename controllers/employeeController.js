import CryptoJS from 'crypto-js';
import jwt from 'jsonwebtoken';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Designation from '../models/Designation.js';
import EmploymentStatus from '../models/EmploymentStatus.js';
import OfficeLocation from '../models/OfficeLocation.js';
import WorkShift from '../models/WorkShift.js';
import { Counter } from '../models/Counter.js';

const JWT_SECRET = process.env.JWT_SECRET;

// Helper function to encrypt password
const encryptPassword = (password) => {
  return CryptoJS.AES.encrypt(password, JWT_SECRET).toString();
};

// Helper function to decrypt password
const decryptPassword = (encryptedPassword) => {
  const bytes = CryptoJS.AES.decrypt(encryptedPassword, JWT_SECRET);
  return bytes.toString(CryptoJS.enc.Utf8);
};

// Helper function to get next employee ID
const getNextEmployeeId = async () => {
  const counter = await Counter.findOneAndUpdate(
    { name: "employeeId" },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return `EMP${String(counter.value).padStart(4, '0')}`;
};

// Login employee
export const loginEmployee = async (req, res) => {
  try {
    const { email, password } = req.body;
    if(!email || !password){
      return res.status(400).json({
        message:"email, password are required entity to login"
      })
    }

    // Find employee with all populated references
    const employee = await Employee.findOne({ email:email})
      .populate('department')
      .populate('designation')
      .populate('employmentStatus')
      .populate('officeLocation')
      .populate('workShift')
      .populate('manager', 'name employeeId designation')
      .populate('addedBy', 'name employeeId');

    if (!employee) {
      return res.status(400).json({ message: 'Invalid email.' });
    }

    // Check if employee is active
    if (!employee.isActive) {
      return res.status(400).json({ message: 'Account is deactivated. Please contact HR.' });
    }

    // Decrypt and verify password
    const decryptedPassword = decryptPassword(employee.password);
    if (decryptedPassword !== password) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: employee._id, 
        email: employee.email,
        role: employee.role 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Remove password from response
    const employeeResponse = employee.toObject();
    delete employeeResponse.password;

    res.json({
      message: 'Login successful.',
      token,
      employee: employeeResponse
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error during login.',
      error: error.message
    });
  }
};



export const registerEmployee = async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      manager,
      name,
      mobile,
      alternateMobile,
      whatsappNumber,
      gender,
      dob,
      address,
      department,
      designation,
      employmentStatus,
      officeLocation,
      workShift,
      salary,
      dateOfJoining,
      personalEmail,
      emergencyContact,
      bloodGroup,
      maritalStatus,
      aadharNumber,
      panNumber,
      bankDetails,
      profilePicture,
    } = req.body;

    //  Check unique constraints (email, mobile)
    const existingEmployee = await Employee.findOne({
      $or: [{ email }, { mobile }],
    });

    if (existingEmployee) {
      const conflictField =
        existingEmployee.email === email ? "email" : "mobile";
      return res.status(400).json({
        message: `Employee with this ${conflictField} already exists.`,
      });
    }

    //  Validate required fields (as per schema)
    if (!name?.first || !name?.last) {
      return res.status(400).json({
        message: "First name and last name are required.",
      });
    }

    if (!email || !mobile || !gender || !department || !designation || !employmentStatus || !officeLocation || !workShift || !salary) {
      return res.status(400).json({
        message:
          "Required fields missing. Please provide email, mobile, gender, department, designation, employmentStatus, officeLocation, workShift, and salary.",
      });
    }

    //  Validate referenced models only for required refs
    const requiredRefs = [
      { field: department, model: Department, name: "Department" },
      { field: designation, model: Designation, name: "Designation" },
      { field: employmentStatus, model: EmploymentStatus, name: "Employment Status" },
      { field: officeLocation, model: OfficeLocation, name: "Office Location" },
      { field: workShift, model: WorkShift, name: "Work Shift" },
    ];

    for (const ref of requiredRefs) {
      const exists = await ref.model.findById(ref.field);
      if (!exists) {
        return res.status(400).json({ message: `${ref.name} not found.` });
      }
    }

    //  Auto-generate Employee ID
    const employeeId = await getNextEmployeeId();

    //  Encrypt password
    const encryptedPassword = encryptPassword(password);

    //  Create employee
    const newEmployee = new Employee({
      employeeId,
      email,
      password: encryptedPassword,
      role: role || "Employee",
      manager: manager || null,
      name: {
        first: name.first,
        last: name.last,
      },
      mobile,
      alternateMobile,
      whatsappNumber,
      gender,
      dob,
      address,
      department,
      designation,
      employmentStatus,
      officeLocation,
      workShift,
      salary,
      dateOfJoining: dateOfJoining || Date.now(),
      addedBy: req.employee?._id, // The HR creating this record
      isActive: true,
      personalEmail,
      emergencyContact,
      bloodGroup: bloodGroup || null,
      maritalStatus: maritalStatus || null,
      aadharNumber,
      panNumber,
      bankDetails,
      profilePicture,
    });

    await newEmployee.save();

    //  Populate references for response
    const populatedEmployee = await Employee.findById(newEmployee._id)
      .select("-password")
      .populate("department")
      .populate("designation")
      .populate("employmentStatus")
      .populate("officeLocation")
      .populate("workShift")
      .populate("manager", "name employeeId designation")
      .populate("addedBy", "name employeeId");

    res.status(201).json({
      message: "Employee registered successfully.",
      employee: populatedEmployee,
    });
  } catch (error) {
    console.error("❌ Register Employee Error:", error);
    res.status(500).json({
      message: "Error registering employee.",
      error: error.message,
    });
  }
};


// Get all employees with advanced filtering
export const getAllEmployees = async (req, res) => {
  try {
    const {
      search,
      role,
      isActive,
      department,
      designation,
      employmentStatus,
      officeLocation,
      workShift,
      managerId,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Build filter object
    const filter = { addedBy: req.employee._id };

    // Search filter
    if (search) {
      filter.$or = [
        { "name.first": { $regex: search, $options: "i" } },
        { "name.last": { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } }
      ];
    }

    // Additional filters
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (department) filter.department = department;
    if (designation) filter.designation = designation;
    if (employmentStatus) filter.employmentStatus = employmentStatus;
    if (officeLocation) filter.officeLocation = officeLocation;
    if (workShift) filter.workShift = workShift;
    if (managerId) filter.manager = managerId;

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query with pagination
    const employees = await Employee.find(filter)
      .select("-password")
      .populate("department")
      .populate("designation")
      .populate("employmentStatus")
      .populate("officeLocation")
      .populate("workShift")
      .populate("manager", "name employeeId designation")
      .populate("addedBy", "name employeeId")
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination info
    const totalCount = await Employee.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      employees,
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
    console.error("Get employees error:", error);
    res.status(500).json({
      message: "Error fetching employees.",
      error: error.message,
    });
  }
};

// Get all employees without filters (simple version)
export const getEmployeesWithoutFilters = async (req, res) => {
  try {
    const employees = await Employee.find({ addedBy: req.employee._id })
      .select("-password")
      .populate("department")
      .populate("designation")
      .populate("employmentStatus")
      .populate("officeLocation")
      .populate("workShift")
      .populate("manager", "name employeeId designation")
      .populate("addedBy", "name employeeId")
      .sort({ createdAt: -1 });

    res.json(employees);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching employees.",
      error: error.message,
    });
  }
};

// Get employee by ID
export const getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .select('-password')
      .populate('department')
      .populate('designation')
      .populate('employmentStatus')
      .populate('officeLocation')
      .populate('workShift')
      .populate('manager', 'name employeeId designation')
      .populate('addedBy', 'name employeeId');
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }
    
    res.json({ employee });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching employee.',
      error: error.message
    });
  }
};

// Get getMyProfile
export const getMyProfile = async (req, res) => {
  try {
    const employee = await Employee.findById(req.employee._id)
      .select('-password')
      .populate('department')
      .populate('designation')
      .populate('employmentStatus')
      .populate('officeLocation')
      .populate('workShift')
      .populate('manager', 'name employeeId designation')
      .populate('addedBy', 'name employeeId');
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }
    
    res.json({ employee });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching employee.',
      error: error.message
    });
  }
};

// Add or update employee coordinates
export const updateEmployeeCoordinates = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const { employeeId } = req.params;
    // Validate input
    if (
      latitude === undefined ||
      longitude === undefined ||
      isNaN(latitude) ||
      isNaN(longitude)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required.",
      });
    }

    // Update coordinates
    const employee = await Employee.findByIdAndUpdate(
      employeeId,
      {
        $set: {
          "coordinates.latitude": latitude,
          "coordinates.longitude": longitude,
        },
      },
      { new: true, runValidators: true }
    ).select("-password");

    // If employee not found
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found.",
      });
    }

    // Success response
    res.status(200).json({
      success: true,
      message: "Coordinates updated successfully.",
      coordinates: employee.coordinates,
    });
  } catch (error) {
    console.error("Error updating coordinates:", error);
    res.status(500).json({
      success: false,
      message: "Server error.",
      error: error.message,
    });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    //  Remove empty, null, or undefined fields
    Object.keys(updates).forEach((key) => {
      if (
        updates[key] === "" ||
        updates[key] === null ||
        updates[key] === undefined
      ) {
        delete updates[key];
      }
    });

    // If password is being updated, encrypt it
    if (updates.password) {
      updates.password = encryptPassword(updates.password);
    }

    //  Unique field conflict check
    if (updates.email || updates.mobile) {
      const existingEmployee = await Employee.findOne({
        $and: [
          { _id: { $ne: id } },
          {
            $or: [
              updates.email ? { email: updates.email } : {},
              updates.mobile ? { mobile: updates.mobile } : {},
            ],
          },
        ],
      });

      if (existingEmployee) {
        let conflictField = "";
        if (existingEmployee.email === updates.email) conflictField = "email";
        else if (existingEmployee.mobile === updates.mobile)
          conflictField = "mobile";

        return res
          .status(400)
          .json({ message: `Another employee with this ${conflictField} already exists.` });
      }
    }

    //  Validate only the reference fields that exist after cleaning
    const refChecks = [
      { key: "department", model: Department },
      { key: "designation", model: Designation },
      { key: "employmentStatus", model: EmploymentStatus },
      { key: "officeLocation", model: OfficeLocation },
      { key: "workShift", model: WorkShift },
    ];

    for (const ref of refChecks) {
      if (updates[ref.key]) {
        const exists = await ref.model.findById(updates[ref.key]);
        if (!exists) {
          return res.status(400).json({ message: `${ref.key} not found.` });
        }
      }
    }

    //  Update Employee
    const employee = await Employee.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
      .select("-password")
      .populate("department")
      .populate("designation")
      .populate("employmentStatus")
      .populate("officeLocation")
      .populate("workShift")
      .populate("manager", "name employeeId designation")
      .populate("addedBy", "name employeeId");

    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    res.json({
      message: "Employee updated successfully.",
      employee,
    });
  } catch (error) {
    console.error("❌ Update Employee Error:", error);
    res.status(500).json({
      message: "Error updating employee.",
      error: error.message,
    });
  }
};


// Toggle employee status (Active/Inactive) - HR only
export const toggleEmployeeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the employee
    const employee = await Employee.findById(id);
    
    if (!employee) {
      return res.status(404).json({ 
        message: 'Employee not found.' 
      });
    }

    // HR Managers cannot deactivate themselves
    if (employee._id.toString() === req.employee._id.toString()) {
      return res.status(400).json({
        message: 'You cannot change your own status. Please ask another HR manager.'
      });
    }

    // Check if this is the only active HR manager
    if (employee.role === 'HR_Manager' && employee.isActive) {
      const activeHRCount = await Employee.countDocuments({ 
        role: 'HR_Manager', 
        isActive: true 
      });
      
      if (activeHRCount <= 1) {
        return res.status(400).json({
          message: 'Cannot deactivate the only active HR Manager. There must be at least one active HR Manager in the system.'
        });
      }
    }

    // Toggle the status
    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      { isActive: !employee.isActive },
      { new: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: `Employee ${updatedEmployee.isActive ? 'activated' : 'deactivated'} successfully.`,
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error toggling employee status.',
      error: error.message
    });
  }
};

// Get team members (for Team Leaders)
export const getTeamMembers = async (req, res) => {
  try {
    const teamMembers = await Employee.find({ manager: req.employee._id })
      .select('-password')
      .populate('department')
      .populate('designation')
      .populate('employmentStatus')
      .populate('officeLocation')
      .populate('workShift')
      .populate('manager', 'name employeeId designation')
      .populate('addedBy', 'name employeeId');
    
    res.json({ teamMembers });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching team members.',
      error: error.message
    });
  }
};

// Get employees added by current user
export const getEmployeesAddedByMe = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      role, 
      isActive, 
      search,
      department,
      designation 
    } = req.query;
    
    const skip = (page - 1) * limit;

    // Base filter: employees added by logged-in user
    const filter = { addedBy: req.employee._id };

    // Additional filters
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (department) filter.department = department;
    if (designation) filter.designation = designation;

    // Search filter
    if (search) {
      filter.$or = [
        { "name.first": { $regex: search, $options: "i" } },
        { "name.last": { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } }
      ];
    }

    // Query DB with pagination
    const employees = await Employee.find(filter)
      .select("-password")
      .populate("department")
      .populate("designation")
      .populate("employmentStatus")
      .populate("officeLocation")
      .populate("workShift")
      .populate("manager", "name employeeId designation")
      .populate("addedBy", "name employeeId")
      .skip(skip)
      .limit(parseInt(limit));

    // Count total for pagination
    const total = await Employee.countDocuments(filter);

    res.json({
      success: true,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalEmployees: total,
      employees,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching employees added by you.",
      error: error.message,
    });
  }
};

// Get employee statistics
export const getEmployeeStats = async (req, res) => {
  try {
    const totalEmployees = await Employee.countDocuments({ addedBy: req.employee._id });
    const activeEmployees = await Employee.countDocuments({ 
      addedBy: req.employee._id, 
      isActive: true 
    });
    const hrManagers = await Employee.countDocuments({ 
      addedBy: req.employee._id, 
      role: 'HR_Manager' 
    });
    const teamLeaders = await Employee.countDocuments({ 
      addedBy: req.employee._id, 
      role: 'Team_Leader' 
    });
    const regularEmployees = await Employee.countDocuments({ 
      addedBy: req.employee._id, 
      role: 'Employee' 
    });

    // Get department statistics
    const departmentStats = await Employee.aggregate([
      { $match: { addedBy: req.employee._id } },
      { 
        $group: { 
          _id: '$department', 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    // Get designation statistics
    const designationStats = await Employee.aggregate([
      { $match: { addedBy: req.employee._id } },
      { 
        $group: { 
          _id: '$designation', 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      stats: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees: totalEmployees - activeEmployees,
        hrManagers,
        teamLeaders,
        regularEmployees,
        departmentStats,
        designationStats
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching employee statistics.',
      error: error.message
    });
  }
};

// Get employees by role
export const getEmployeesByRole = async (req, res) => {
  try {
    const { role } = req.params;

    const employees = await Employee.find({ 
      role: new RegExp(role, "i"),
      addedBy: req.employee._id
    })
      .select("-password")
      .populate("department")
      .populate("designation")
      .populate("employmentStatus")
      .populate("officeLocation")
      .populate("workShift")
      .populate("manager", "name employeeId designation")
      .populate("addedBy", "name employeeId");

    res.json({
      success: true,
      message: `These are registered employees who are ${role}`,
      employees,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching employees by role.",
      error: error.message,
    });
  }
};

// Get managers
export const getManagers = async (req, res) => {
  try {
    const managers = await Employee.find({ 
      role: { $in: ["HR_Manager", "Team_Leader"] },
      addedBy: req.employee._id
    })
      .select("-password")
      .populate("department")
      .populate("designation")
      .populate("employmentStatus")
      .populate("officeLocation")
      .populate("workShift")
      .populate("manager", "name employeeId designation")
      .populate("addedBy", "name employeeId");

    res.json({
      success: true,
      message: "These are registered managers",
      managers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching managers.",
      error: error.message,
    });
  }
};

// Bulk status update for multiple employees
export const bulkUpdateStatus = async (req, res) => {
  try {
    const { employeeIds, isActive } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({
        message: 'employeeIds array is required with at least one employee ID.'
      });
    }

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        message: 'isActive field is required and must be a boolean value.'
      });
    }

    // Check if trying to deactivate self
    if (employeeIds.includes(req.employee._id.toString()) && !isActive) {
      return res.status(400).json({
        message: 'You cannot deactivate yourself. Please ask another HR manager.'
      });
    }

    // Check if trying to deactivate all HR managers
    if (!isActive) {
      const hrManagersInRequest = await Employee.find({
        _id: { $in: employeeIds },
        role: 'HR_Manager'
      });

      if (hrManagersInRequest.length > 0) {
        const activeHRCount = await Employee.countDocuments({ 
          role: 'HR_Manager', 
          isActive: true 
        });

        const willRemainActive = activeHRCount - hrManagersInRequest.length;
        if (willRemainActive < 1) {
          return res.status(400).json({
            message: 'Cannot deactivate all HR Managers. There must be at least one active HR Manager in the system.'
          });
        }
      }
    }

    // Update status for all employees
    const result = await Employee.updateMany(
      { _id: { $in: employeeIds } },
      { isActive }
    );

    // Fetch updated employees
    const updatedEmployees = await Employee.find({ _id: { $in: employeeIds } })
      .select('-password')
      .populate('department')
      .populate('designation')
      .populate('employmentStatus')
      .populate('officeLocation')
      .populate('workShift')
      .populate('manager', 'name employeeId designation')
      .populate('addedBy', 'name employeeId');

    res.json({
      message: `Status updated for ${result.modifiedCount} employees.`,
      updatedCount: result.modifiedCount,
      employees: updatedEmployees
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating employee status in bulk.',
      error: error.message
    });
  }
};

// Create HR Manager
export const createHRManager = async (req, res) => {
  try {
    const {
      email,
      password = 'hrdefault123',
      name,
      mobile,
      alternateMobile,
      whatsappNumber,
      gender,
      dob,
      address,
      department,
      designation,
      employmentStatus,
      officeLocation,
      workShift,
      salary = 50000
    } = req.body;

    // Required field validation
    if (!email || !name?.first || !name?.last || !mobile) {
      return res.status(400).json({
        message: 'Email, name (first & last), and mobile are required fields.'
      });
    }

    // Check if employee already exists with unique fields
    const existingEmployee = await Employee.findOne({
      $or: [
        { email }, 
        { mobile }
      ]
    });

    if (existingEmployee) {
      let conflictField = '';
      if (existingEmployee.email === email) conflictField = 'email';
      else if (existingEmployee.mobile === mobile) conflictField = 'mobile';

      return res.status(400).json({
        message: `Employee with this ${conflictField} already exists.`
      });
    }

    // Validate reference fields exist
    const requiredReferences = [
      { field: department, model: Department, name: 'Department' },
      { field: designation, model: Designation, name: 'Designation' },
      { field: employmentStatus, model: EmploymentStatus, name: 'Employment Status' },
      { field: officeLocation, model: OfficeLocation, name: 'Office Location' },
      { field: workShift, model: WorkShift, name: 'Work Shift' }
    ];

    for (const ref of requiredReferences) {
      if (!ref.field) {
        return res.status(400).json({
          message: `${ref.name} is required.`
        });
      }
      
      const exists = await ref.model.findById(ref.field);
      if (!exists) {
        return res.status(400).json({
          message: `${ref.name} not found.`
        });
      }
    }

    // Generate automatic employee ID
    const employeeId = await getNextEmployeeId();

    // Encrypt password
    const encryptedPassword = encryptPassword(password);

    // Create HR Manager
    const hrManager = new Employee({
      employeeId,
      email,
      password: encryptedPassword,
      role: 'HR_Manager',
      name: {
        first: name.first,
        last: name.last
      },
      mobile,
      alternateMobile,
      whatsappNumber,
      gender,
      dob,
      address,
      department,
      designation,
      employmentStatus,
      officeLocation,
      workShift,
      salary,
      addedBy: req.employee ? req.employee._id : null,
      isActive: true
    });

    await hrManager.save();

    // Populate the saved HR manager
    const populatedHR = await Employee.findById(hrManager._id)
      .populate('department')
      .populate('designation')
      .populate('employmentStatus')
      .populate('officeLocation')
      .populate('workShift')
      .populate('addedBy', 'name employeeId');

    // Remove password from response
    const hrResponse = populatedHR.toObject();
    delete hrResponse.password;

    res.status(201).json({
      message: 'HR Manager created successfully.',
      hrManager: hrResponse,
      temporaryPassword: password
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error creating HR manager.',
      error: error.message
    });
  }
};

// Update HR Manager
export const updateHRManager = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Find the HR manager
    const hrManager = await Employee.findOne({ 
      _id: id, 
      role: 'HR_Manager' 
    });

    if (!hrManager) {
      return res.status(404).json({ 
        message: 'HR Manager not found.' 
      });
    }

    // Remove restricted fields
    delete updates.role;
    delete updates.addedBy;

    // If password is being updated, encrypt it
    if (updates.password) {
      updates.password = encryptPassword(updates.password);
    }

    // Check for unique field conflicts
    if (updates.email || updates.mobile) {
      const existingEmployee = await Employee.findOne({
        $and: [
          { _id: { $ne: id } },
          {
            $or: [
              { email: updates.email },
              { mobile: updates.mobile }
            ].filter(condition => Object.values(condition)[0])
          }
        ]
      });

      if (existingEmployee) {
        let conflictField = '';
        if (existingEmployee.email === updates.email) conflictField = 'email';
        else if (existingEmployee.mobile === updates.mobile) conflictField = 'mobile';

        return res.status(400).json({
          message: `Another employee with this ${conflictField} already exists.`
        });
      }
    }

    const updatedHR = await Employee.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'HR Manager updated successfully.',
      hrManager: updatedHR
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating HR manager.',
      error: error.message
    });
  }
};

// Delete HR Manager (only if not the only HR)
export const deleteHRManager = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if this is the only HR manager
    const hrCount = await Employee.countDocuments({ role: 'HR_Manager' });
    
    if (hrCount <= 1) {
      return res.status(400).json({
        message: 'Cannot delete the only HR Manager. There must be at least one HR Manager in the system.'
      });
    }

    const deletedHR = await Employee.findOneAndDelete({ 
      _id: id, 
      role: 'HR_Manager' 
    });

    if (!deletedHR) {
      return res.status(404).json({ 
        message: 'HR Manager not found.' 
      });
    }

    res.json({
      message: 'HR Manager deleted successfully.',
      deletedHR: {
        employeeId: deletedHR.employeeId,
        email: deletedHR.email,
        name: deletedHR.name
      }
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error deleting HR manager.',
      error: error.message
    });
  }
};

// Get all HR Managers
export const getAllHRManagers = async (req, res) => {
  try {
    const hrManagers = await Employee.find({ role: 'HR_Manager' })
      .select('-password')
      .populate('department')
      .populate('designation')
      .populate('employmentStatus')
      .populate('officeLocation')
      .populate('workShift')
      .populate('addedBy', 'name employeeId')
      .sort({ createdAt: -1 });
    
    res.json({ hrManagers });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching HR managers.',
      error: error.message
    });
  }
};


// Update Basic Information
export const updateBasicInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      mobile,
      alternateMobile,
      whatsappNumber,
      gender,
      dob,
      personalEmail,
      bloodGroup,
      maritalStatus
    } = req.body;

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Check permissions (HR or self-update)
    if (req.employee.role !== 'HR_Manager' && req.employee._id.toString() !== id) {
      return res.status(403).json({ 
        message: 'You can only update your own basic information.' 
      });
    }

    // Check for unique field conflicts
    if (email || mobile) {
      const existingEmployee = await Employee.findOne({
        $and: [
          { _id: { $ne: id } },
          {
            $or: [
              { email: email || '' },
              { mobile: mobile || '' }
            ].filter(condition => Object.values(condition)[0])
          }
        ]
      });

      if (existingEmployee) {
        let conflictField = '';
        if (existingEmployee.email === email) conflictField = 'email';
        else if (existingEmployee.mobile === mobile) conflictField = 'mobile';

        return res.status(400).json({
          message: `Another employee with this ${conflictField} already exists.`
        });
      }
    }

    // Prepare update object
    const updates = {};
    if (name) {
      if (name.first) updates['name.first'] = name.first;
      if (name.last) updates['name.last'] = name.last;
    }
    if (email) updates.email = email;
    if (mobile) updates.mobile = mobile;
    if (alternateMobile !== undefined) updates.alternateMobile = alternateMobile;
    if (whatsappNumber !== undefined) updates.whatsappNumber = whatsappNumber;
    if (gender) updates.gender = gender;
    if (dob) updates.dob = dob;
    if (personalEmail !== undefined) updates.personalEmail = personalEmail;
    if (bloodGroup !== undefined) updates.bloodGroup = bloodGroup;
    if (maritalStatus !== undefined) updates.maritalStatus = maritalStatus;

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Basic information updated successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating basic information.',
      error: error.message
    });
  }
};

// Update Address Information
export const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { address } = req.body;

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Check permissions (HR or self-update)
    if (req.employee.role !== 'HR_Manager' && req.employee._id.toString() !== id) {
      return res.status(403).json({ 
        message: 'You can only update your own address.' 
      });
    }

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      { address },
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Address updated successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating address.',
      error: error.message
    });
  }
};

// Update Employment Details
export const updateEmploymentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      department,
      designation,
      employmentStatus,
      officeLocation,
      workShift,
      manager,
      role,
      salary,
      dateOfJoining,
      dateOfLeaving,
      leavingReason
    } = req.body;

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Only HR Managers can update employment details
    if (req.employee.role !== 'HR_Manager') {
      return res.status(403).json({ 
        message: 'Only HR Managers can update employment details.' 
      });
    }

    // Validate reference fields if being updated
    const referenceValidations = [
      { field: department, model: Department, name: 'Department' },
      { field: designation, model: Designation, name: 'Designation' },
      { field: employmentStatus, model: EmploymentStatus, name: 'Employment Status' },
      { field: officeLocation, model: OfficeLocation, name: 'Office Location' },
      { field: workShift, model: WorkShift, name: 'Work Shift' },
      { field: manager, model: Employee, name: 'Manager' }
    ];

    for (const ref of referenceValidations) {
      if (ref.field) {
        const exists = await ref.model.findById(ref.field);
        if (!exists) {
          return res.status(400).json({
            message: `${ref.name} not found.`
          });
        }
      }
    }

    // Prepare update object
    const updates = {};
    if (department) updates.department = department;
    if (designation) updates.designation = designation;
    if (employmentStatus) updates.employmentStatus = employmentStatus;
    if (officeLocation) updates.officeLocation = officeLocation;
    if (workShift) updates.workShift = workShift;
    if (manager !== undefined) updates.manager = manager;
    if (role) updates.role = role;
    if (salary) updates.salary = salary;
    if (dateOfJoining) updates.dateOfJoining = dateOfJoining;
    if (dateOfLeaving !== undefined) updates.dateOfLeaving = dateOfLeaving;
    if (leavingReason !== undefined) updates.leavingReason = leavingReason;

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Employment details updated successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating employment details.',
      error: error.message
    });
  }
};

// Update Bank Details
export const updateBankDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { bankDetails } = req.body;

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Check permissions (HR or self-update)
    if (req.employee.role !== 'HR_Manager' && req.employee._id.toString() !== id) {
      return res.status(403).json({ 
        message: 'You can only update your own bank details.' 
      });
    }

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      { bankDetails },
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Bank details updated successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating bank details.',
      error: error.message
    });
  }
};

// Update Documents
export const updateDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      profilePicture,
      aadharNumber,
      panNumber
    } = req.body;

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Check permissions (HR or self-update)
    if (req.employee.role !== 'HR_Manager' && req.employee._id.toString() !== id) {
      return res.status(403).json({ 
        message: 'You can only update your own documents.' 
      });
    }

    // Check for unique document conflicts
    if (aadharNumber || panNumber) {
      const existingEmployee = await Employee.findOne({
        $and: [
          { _id: { $ne: id } },
          {
            $or: [
              { aadharNumber: aadharNumber || '' },
              { panNumber: panNumber || '' }
            ].filter(condition => Object.values(condition)[0])
          }
        ]
      });

      if (existingEmployee) {
        let conflictField = '';
        if (existingEmployee.aadharNumber === aadharNumber) conflictField = 'Aadhar number';
        else if (existingEmployee.panNumber === panNumber) conflictField = 'PAN number';

        return res.status(400).json({
          message: `Another employee with this ${conflictField} already exists.`
        });
      }
    }

    // Prepare update object
    const updates = {};
    if (profilePicture !== undefined) updates.profilePicture = profilePicture;
    if (aadharNumber !== undefined) updates.aadharNumber = aadharNumber;
    if (panNumber !== undefined) updates.panNumber = panNumber;

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Documents updated successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating documents.',
      error: error.message
    });
  }
};

// Update Emergency Contact
export const updateEmergencyContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { emergencyContact } = req.body;

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Check permissions (HR or self-update)
    if (req.employee.role !== 'HR_Manager' && req.employee._id.toString() !== id) {
      return res.status(403).json({ 
        message: 'You can only update your own emergency contact.' 
      });
    }

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      { emergencyContact },
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Emergency contact updated successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating emergency contact.',
      error: error.message
    });
  }
};

// Change Designation (Specific controller for designation change)
export const changeDesignation = async (req, res) => {
  try {
    const { id } = req.params;
    const { designation, salary, effectiveDate } = req.body;

    // Only HR Managers can change designation
    if (req.employee.role !== 'HR_Manager') {
      return res.status(403).json({ 
        message: 'Only HR Managers can change employee designation.' 
      });
    }

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Validate designation exists
    if (designation) {
      const designationExists = await Designation.findById(designation);
      if (!designationExists) {
        return res.status(400).json({ message: 'Designation not found.' });
      }
    }

    // Prepare update object
    const updates = {};
    if (designation) updates.designation = designation;
    if (salary) updates.salary = salary;
    if (effectiveDate) updates.dateOfJoining = effectiveDate;

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Designation changed successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error changing designation.',
      error: error.message
    });
  }
};

// Change Department (Specific controller for department change)
export const changeDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { department, manager, effectiveDate } = req.body;

    // Only HR Managers can change department
    if (req.employee.role !== 'HR_Manager') {
      return res.status(403).json({ 
        message: 'Only HR Managers can change employee department.' 
      });
    }

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Validate department exists
    if (department) {
      const departmentExists = await Department.findById(department);
      if (!departmentExists) {
        return res.status(400).json({ message: 'Department not found.' });
      }
    }

    // Validate manager exists if provided
    if (manager) {
      const managerExists = await Employee.findById(manager);
      if (!managerExists) {
        return res.status(400).json({ message: 'Manager not found.' });
      }
    }

    // Prepare update object
    const updates = {};
    if (department) updates.department = department;
    if (manager !== undefined) updates.manager = manager;
    if (effectiveDate) updates.dateOfJoining = effectiveDate;

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Department changed successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error changing department.',
      error: error.message
    });
  }
};

// Update Work Schedule
export const updateWorkSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { officeLocation, workShift } = req.body;

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Only HR Managers can update work schedule
    if (req.employee.role !== 'HR_Manager') {
      return res.status(403).json({ 
        message: 'Only HR Managers can update work schedule.' 
      });
    }

    // Validate reference fields
    if (officeLocation) {
      const locationExists = await OfficeLocation.findById(officeLocation);
      if (!locationExists) {
        return res.status(400).json({ message: 'Office location not found.' });
      }
    }

    if (workShift) {
      const shiftExists = await WorkShift.findById(workShift);
      if (!shiftExists) {
        return res.status(400).json({ message: 'Work shift not found.' });
      }
    }

    // Prepare update object
    const updates = {};
    if (officeLocation) updates.officeLocation = officeLocation;
    if (workShift) updates.workShift = workShift;

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Work schedule updated successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating work schedule.',
      error: error.message
    });
  }
};

// Update Personal Information
export const updatePersonalInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      personalEmail,
      emergencyContact,
      bloodGroup,
      maritalStatus
    } = req.body;

    // Check if employee exists
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    // Check permissions (HR or self-update)
    if (req.employee.role !== 'HR_Manager' && req.employee._id.toString() !== id) {
      return res.status(403).json({ 
        message: 'You can only update your own personal information.' 
      });
    }

    const updates = {};
    if (personalEmail !== undefined) updates.personalEmail = personalEmail;
    if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
    if (bloodGroup !== undefined) updates.bloodGroup = bloodGroup;
    if (maritalStatus !== undefined) updates.maritalStatus = maritalStatus;

    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .select('-password')
    .populate('department')
    .populate('designation')
    .populate('employmentStatus')
    .populate('officeLocation')
    .populate('workShift')
    .populate('manager', 'name employeeId designation')
    .populate('addedBy', 'name employeeId');

    res.json({
      message: 'Personal information updated successfully.',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating personal information.',
      error: error.message
    });
  }
};