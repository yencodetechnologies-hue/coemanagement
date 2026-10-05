const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const c = require('../controllers/BundleController');

const router = express.Router();
router.use(protect);

router.get('/papers', c.listPapers);
router.get('/evaluators', c.listEvaluators);
router.post('/', c.rebundle);
router.get('/:mappingId', c.getDetail);
router.put('/:mappingId/packets/:packetNo/evaluator', c.assignEvaluator);

module.exports = router;