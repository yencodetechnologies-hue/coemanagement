const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware'); // ADAPT: path to your middleware file
const c = require('../controllers/theoryTimeTableController');

router.use(protect); // every route needs a valid bearer token

router.get('/options', c.getOptions);
router.get('/subjects', c.getSubjects);
router.get('/saved', c.getSaved);
router.put('/', c.saveTimeTable);
router.delete('/:id', c.deleteTimeTable);

module.exports = router;