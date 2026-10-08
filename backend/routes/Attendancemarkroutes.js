const express = require('express');
const router = express.Router();
const {
  getBatches,
  getSheet,
  updateSheet,
  saveEntry,
  verifySheet,
  unlockSheet
} = require('../controllers/Attendancemarkcontroller');

router.get('/batches', getBatches);
router.get('/sheet', getSheet);
router.put('/sheet/:id', updateSheet);
router.put('/sheet/:id/entries/:regNo', saveEntry);
router.post('/sheet/:id/verify', verifySheet);
router.post('/sheet/:id/unlock', unlockSheet);

module.exports = router;

