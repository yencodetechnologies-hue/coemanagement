const express = require('express');
const c = require('../controllers/Consolidatedcontroller');

const router = express.Router();

// ADAPT: protect these routes with the SAME auth middleware your barcode routes use, e.g.
//   const { protect } = require('../middleware/auth');
//   router.use(protect);

router.get('/options', c.getOptions);     // ?instCode=&course=&batch=   dropdown lists + candidates
router.get('/statement', c.getStatement); // ?instCode=&course=&batch=&regNo=
router.post('/issue', c.issue);           // body: { instCode, course, batch, regNo }  -> serial number

module.exports = router;

/*
 * In server.js / app.js, next to the results routes:
 *
 *   app.use('/api/consolidated', require('./routes/consolidatedRoutes'));
 */