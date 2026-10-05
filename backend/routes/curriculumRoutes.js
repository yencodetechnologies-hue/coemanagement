const express = require('express');
const router = express.Router();
const { getCurriculum, createCurriculum, updateCurriculum, deleteCurriculum } = require('../controllers/curriculumController');

router.route('/').get(getCurriculum).post(createCurriculum);
router.route('/:id').put(updateCurriculum).delete(deleteCurriculum);

module.exports = router;