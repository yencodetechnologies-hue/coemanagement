const express = require('express');
const c = require('../controllers/Provisionalcontroller');

const router = express.Router();

// ADAPT: protect these routes with the SAME auth middleware your barcode routes use, e.g.
//   const { protect } = require('../middleware/auth');
//   router.use(protect);

router.get('/certificate', c.getCertificate); // ?instCode=&course=&batch=&regNo=
router.post('/issue', c.issue);               // body: { instCode, course, batch, regNo }

module.exports = router;

/*
 * In server.js / app.js, next to the consolidated routes:
 *
 *   app.use('/api/provisional', require('./routes/provisionalRoutes'));
 *
 * The dropdowns of this page use the existing /api/consolidated/options route.
 */