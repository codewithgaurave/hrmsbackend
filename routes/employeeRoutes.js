import express from 'express';
import {
  registerEmployee,
  loginEmployee,
  getAllEmployees,
  getEmployeesWithoutFilters,
  getEmployeeById,
  updateEmployee,
  getTeamMembers,
  getEmployeesAddedByMe,
  createHRManager,
  updateHRManager,
  deleteHRManager,
  getAllHRManagers,
  toggleEmployeeStatus,
  bulkUpdateStatus,
  getEmployeeStats,
  getEmployeesByRole,
  getManagers,
  getMyProfile,
    updateBasicInfo,
  updateAddress,
  updateEmploymentDetails,
  updateBankDetails,
  updateDocuments,
  updateEmergencyContact,
  changeDesignation,
  changeDepartment,
  updateWorkSchedule,
  updatePersonalInfo,
  updateEmployeeCoordinates
} from '../controllers/employeeController.js';
import {
  authenticateToken,
  requireHRManager,
  requireTeamLeader,
  canAccessEmployee
} from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/login', loginEmployee);

// HR Manager creation (protected)
router.post('/hr/create', authenticateToken, requireHRManager, createHRManager);

// Protected routes

// Employee management routes
router.post('/register', authenticateToken, requireHRManager, registerEmployee);
router.get('/', authenticateToken, getAllEmployees);
router.get('/without-filters', authenticateToken, getEmployeesWithoutFilters);
router.get('/stats', authenticateToken, getEmployeeStats);
router.get('/team', authenticateToken, requireTeamLeader, getTeamMembers);
router.get('/added-by-me', authenticateToken, getEmployeesAddedByMe);
router.get('/role/:role', authenticateToken, getEmployeesByRole);
router.get('/managers', authenticateToken, getManagers);
router.get('/my-profile', authenticateToken, getMyProfile);
router.put("/:employeeId/update-coordinates", authenticateToken, updateEmployeeCoordinates);
router.get('/:id', authenticateToken, getEmployeeById);
router.put('/:id', authenticateToken, updateEmployee);

// HR Manager only routes
router.patch('/:id/toggle-status', authenticateToken, requireHRManager, toggleEmployeeStatus);
router.patch('/bulk-status', authenticateToken, requireHRManager, bulkUpdateStatus);

// HR Management routes
router.get('/hr/all', authenticateToken, requireHRManager, getAllHRManagers);
router.put('/hr/update/:id', authenticateToken, requireHRManager, updateHRManager);
router.delete('/hr/delete/:id', authenticateToken, requireHRManager, deleteHRManager);

router.patch('/:id/basic-info', authenticateToken, canAccessEmployee, updateBasicInfo);
router.patch('/:id/address', authenticateToken, canAccessEmployee, updateAddress);
router.patch('/:id/employment-details', authenticateToken, requireHRManager, updateEmploymentDetails);
router.patch('/:id/bank-details', authenticateToken, canAccessEmployee, updateBankDetails);
router.patch('/:id/documents', authenticateToken, canAccessEmployee, updateDocuments);
router.patch('/:id/emergency-contact', authenticateToken, canAccessEmployee, updateEmergencyContact);
router.patch('/:id/designation', authenticateToken, requireHRManager, changeDesignation);
router.patch('/:id/department', authenticateToken, requireHRManager, changeDepartment);
router.patch('/:id/work-schedule', authenticateToken, requireHRManager, updateWorkSchedule);
router.patch('/:id/personal-info', authenticateToken, canAccessEmployee, updatePersonalInfo);

export default router;