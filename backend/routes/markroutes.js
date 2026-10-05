const express = require('express');
const c = require('../controllers/MarkController');

const router = express.Router();

// ADAPT: protect these routes with the SAME auth middleware your barcode routes use, e.g.
//   const { protect } = require('../middleware/auth');
//   router.use(protect);

router.get('/packets', c.getPackets); // Packet dropdown
router.get('/packet', c.getPacket);   // ?rebundleId=&packetNo=
router.put('/packet', c.savePacket);  // { rebundleId, packetNo, marks: [{ barcode, mark }] }

module.exports = router;

/*
 * In server.js / app.js, next to the barcode routes:
 *
 *   app.use('/api/external-marks', require('./routes/externalMarkRoutes'));
 */