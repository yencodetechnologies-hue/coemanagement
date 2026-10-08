const express = require('express');
const c = require('../controllers/Consolidatedcontroller');

const router = express.Router();



router.get('/options', c.getOptions);     // ?instCode=&course=&batch=   dropdown lists + candidates
router.get('/statement', c.getStatement); // ?instCode=&course=&batch=&regNo=
router.post('/issue', c.issue);           // body: { instCode, course, batch, regNo }  -> serial number

module.exports = router;

