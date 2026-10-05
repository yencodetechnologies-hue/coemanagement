const express = require('express');
const router = express.Router();
const { upload } = require('../utils/cloudinary');
const { getStudents, createStudent, updateStudent, deleteStudent } = require('../controllers/studentController');

router.route('/')
  .get(getStudents)
  .post(upload.single('photo'), createStudent);

router.route('/:id')
  .put(upload.single('photo'), updateStudent)
  .delete(deleteStudent);

module.exports = router;