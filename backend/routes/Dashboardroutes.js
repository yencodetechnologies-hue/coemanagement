const express = require('express');
const c = require('../controllers/Dashboardcontroller');

const router = express.Router();

router.get('/', c.getDashboard); // ?instCode=&course=&examYear=   (all optional)

module.exports = router;

/*
 * In server.js, with your other routes:
 *
 *   app.use('/api/dashboard', require('./routes/dashboardRoutes'));
 */