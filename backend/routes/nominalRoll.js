const router = require('express').Router();
const { getFilterOptions, getNominalRoll } = require('../controllers/nominalRollController');

router.get('/filters', getFilterOptions);
router.get('/', getNominalRoll);

module.exports = router;