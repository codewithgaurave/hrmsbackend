import jwt from 'jsonwebtoken';
import Employee from '../models/Employee.js';



const JWT_SECRET = process.env.JWT_SECRET;

// Authentication middleware
export const authenticateToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const employee = await Employee.findById(decoded.id).select('-password');
    
    if (!employee) {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    req.employee = employee;
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token.' });
  }
};

// HR Manager authorization middleware
export const requireHRManager = (req, res, next) => {
  if (req.employee.role !== 'HR_Manager') {
    return res.status(403).json({ 
      message: 'Access denied. HR Manager role required.' 
    });
  }
  next();
};


// Team Leader authorization middleware
export const requireTeamLeader = (req, res, next) => {
  if (req.employee.role !== 'Team_Leader' && req.employee.role !== 'HR_Manager') {
    return res.status(403).json({ 
      message: 'Access denied. Team Leader or HR Manager role required.' 
    });
  }
  next();
};

// Check if user can access employee data
export const canAccessEmployee = async (req, res, next) => {
  try {
    const targetEmployeeId = req.employee.id;
    
    // HR can access all employees
    if (req.employee.role === 'HR_Manager') {
      return next();
    }
    console.log(targetEmployeeId)    
    const targetEmployee = await Employee.findById(targetEmployeeId);
    
    if (!targetEmployee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }
    
    // Team Leaders can access their team members
    if (req.employee.role === 'Team_Leader') {
      // Check if the target employee reports to this team leader
      if (targetEmployee.manager && targetEmployee.manager.toString() === req.employee._id.toString()) {
        return next();
      }
    }
    
    // Users can access employees they added
    if (targetEmployee.addedBy && targetEmployee.addedBy.toString() === req.employee._id.toString()) {
      return next();
    }
    
    // Regular employees can only access their own data
    if (req.employee._id.toString() === targetEmployeeId) {
      return next();
    }
    
    return res.status(403).json({ 
      message: 'Access denied. You can only access your own data, your team members, or employees you added.' 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Update the existing auth middleware or add this function
export const requireDashboardAccess = (req, res, next) => {
  const allowedRoles = ["HR_Manager", "Admin", "Team_Leader", "Employee"];
  if (!allowedRoles.includes(req.employee.role)) {
    return res.status(403).json({ 
      message: 'Access denied. Insufficient permissions for dashboard access.' 
    });
  }
  next();
};