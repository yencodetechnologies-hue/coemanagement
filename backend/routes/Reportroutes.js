const express = require('express');
const c = require('../controllers/Reportcontroller');

const router = express.Router();



router.get('/', c.getReports); // ?instCode=&course=&batch=&semester=&examYear=

module.exports = router;

