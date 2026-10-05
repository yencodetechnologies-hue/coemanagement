const mongoose = require('mongoose');

// One entry per student per subject. The Theory and the Practical sheet each keep their OWN
// attendance %, their own mark and their own "present". `attendance` is the attendance of the
// subject as a whole: the average of the theory and practical attendance (it is what the nominal
// roll, hall ticket, dashboard and reports read).
const attendanceEntrySchema = new mongoose.Schema(
  {
    instCode: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    subCode: { type: String, required: true, trim: true },
    examYear: { type: String, required: true, trim: true },
    studentCategory: { type: String, required: true, trim: true },
    regNo: { type: String, required: true, trim: true },

    attendance: { type: Number, min: 0, max: 100, default: null },           // subject as a whole (average of the two below)
    theoryAttendance: { type: Number, min: 0, max: 100, default: null },     // attendance % of the Theory sheet
    practicalAttendance: { type: Number, min: 0, max: 100, default: null },  // attendance % of the Practical sheet
    theoryPresent: { type: Boolean, default: true },
    practicalPresent: { type: Boolean, default: true },

    internalMark: { type: Number, min: 0, default: null },          // mark of the Internal sheet
    theoryInternalMark: { type: Number, min: 0, default: null },    // mark of the Theory sheet
    practicalInternalMark: { type: Number, min: 0, default: null }  // mark of the Practical sheet
  },
  { timestamps: true }
);

attendanceEntrySchema.index(
  { instCode: 1, course: 1, batch: 1, semester: 1, subCode: 1, examYear: 1, studentCategory: 1, regNo: 1 },
  { unique: true }
);

module.exports = mongoose.model('AttendanceEntry', attendanceEntrySchema);