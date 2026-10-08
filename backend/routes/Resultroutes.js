const express = require('express');
const c = require('../controllers/Resultcontroller');

const router = express.Router();

// ADAPT: protect these routes with the SAME auth middleware your barcode routes use, e.g.
//   const { protect } = require('../middleware/auth');
//   router.use(protect);

router.get('/options', c.getOptions);  // dropdown lists (cascading)
router.get('/', c.getResults);         // ?instCode=&course=&batch=&semester=&examYear=
router.post('/publish', c.publish);    // body: the five filters
router.post('/withdraw', c.withdraw);  // body: the five filters

module.exports = router;

