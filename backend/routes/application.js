const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware'); // ADAPT: path to your middleware file
const c = require('../controllers/applicationController');

router.use(protect); // every route needs a valid bearer token

router.get('/options', c.getOptions);
router.get('/', c.getApplication);
router.put('/settings', c.saveSettings);
router.post('/hall-tickets/issue', c.issueHallTickets);

module.exports = router;