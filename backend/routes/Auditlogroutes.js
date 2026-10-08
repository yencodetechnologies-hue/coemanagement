const express = require('express');
const c = require('../controllers/Auditlogcontroller');

const router = express.Router();

router.get('/filters', c.filters); // dropdown values
router.get('/', c.list);           // paged, newest first

module.exports = router;
