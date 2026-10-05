const express = require('express');
const router = express.Router();
const {
  getStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff
} = require('../controllers/coeStaffController');

// Add auth middleware here if required by your project (e.g., verifyToken)
router.route('/')
  .get(getStaff)
  .post(createStaff);

router.route('/:id')
  .get(getStaffById)
  .put(updateStaff)
  .delete(deleteStaff);

module.exports = router;