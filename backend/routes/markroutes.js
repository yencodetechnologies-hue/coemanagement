const express = require('express');
const c = require('../controllers/MarkController');

const router = express.Router();



router.get('/packets', c.getPackets); // Packet dropdown
router.get('/packet', c.getPacket);   // ?rebundleId=&packetNo=
router.put('/packet', c.savePacket);  // { rebundleId, packetNo, marks: [{ barcode, mark }] }

module.exports = router;

