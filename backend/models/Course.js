const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  instCode: { type: String, required: true, trim: true },
  degree: { type: String, required: true, default: 'UG' },
  mode: { type: String, required: true, default: 'REGULAR' },
  courseCode: { type: String, required: true, unique: true, trim: true },
  courseName: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  attendancePercentage: { type: Number, required: true, default: 75 },
  examPattern: { type: String, required: true, default: 'SEMESTER' },
  noOfTerms: { type: Number, required: true, default: 8 },
  regulation: { type: String, required: true, default: '2022' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);