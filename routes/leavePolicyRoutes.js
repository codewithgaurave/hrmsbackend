import express from 'express';
import {
  createLeavePolicy,
  getLeavePolicies,
  getLeavePoliciesWithoutFilters,
  getLeavePolicyById,
  getLeavePolicyByType,
  updateLeavePolicy,
  deleteLeavePolicy,
  getAvailableLeavePolicies
} from '../controllers/leavePolicyController.js';
import { authenticateToken, requireHRManager } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(authenticateToken);

// Employee accessible routes
router.get('/employee/available', getAvailableLeavePolicies);
router.get('/without-filters', getLeavePoliciesWithoutFilters);
router.get('/', getLeavePolicies);
router.get('/type/:leaveType', getLeavePolicyByType);
router.get('/:id', getLeavePolicyById);

// HR Manager only routes
router.post('/', requireHRManager, createLeavePolicy);
router.put('/:id', requireHRManager, updateLeavePolicy);
router.delete('/:id', requireHRManager, deleteLeavePolicy);

export default router;