const express = require('express');
const c = require('../controllers/Dashboardcontroller');

const router = express.Router();

router.get('/', c.getDashboard); // ?instCode=&course=&examYear=   (all optional)

module.exports = router;

