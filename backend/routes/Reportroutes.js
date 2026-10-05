const express = require('express');
const c = require('../controllers/Reportcontroller');

const router = express.Router();

// ADAPT: protect this route with the SAME auth middleware your barcode routes use, e.g.
//   const { protect } = require('../middleware/auth');
//   router.use(protect);

router.get('/', c.getReports); // ?instCode=&course=&batch=&semester=&examYear=

module.exports = router;

/*
 * In server.js / app.js, next to the results routes:
 *
 *   app.use('/api/reports', require('./routes/reportRoutes'));
 *
 * The dropdowns of this page use the existing /api/results/options route.
 */