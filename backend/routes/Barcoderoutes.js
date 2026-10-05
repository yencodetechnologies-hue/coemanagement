const express = require('express');
const { protect } = require('../middleware/authMiddleware'); // your bearer-token middleware
const c = require('../controllers/Barcodecontroller');

const router = express.Router();
router.use(protect);

router.get('/options', c.getOptions);
router.get('/mapping', c.getMapping);
router.post('/generate', c.generate);
router.put('/:id/verify', c.verify);
router.delete('/:id', c.remove);

module.exports = router;