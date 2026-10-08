const express = require('express');
const c = require('../controllers/Provisionalcontroller');

const router = express.Router();



router.get('/certificate', c.getCertificate); // ?instCode=&course=&batch=&regNo=
router.post('/issue', c.issue);               // body: { instCode, course, batch, regNo }

module.exports = router;

