const mongoose = require('mongoose');

const hallTicketSchema = new mongoose.Schema(
  {
    instCode: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    examYear: { type: String, required: true, trim: true },
    studentCategory: { type: String, required: true, trim: true },
    regNo: { type: String, required: true, trim: true },
    hallTicketNo: { type: String, required: true, unique: true },
    issuedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

hallTicketSchema.index(
  { instCode: 1, course: 1, batch: 1, semester: 1, examYear: 1, studentCategory: 1, regNo: 1 },
  { unique: true }
);

module.exports = mongoose.model('HallTicket', hallTicketSchema);