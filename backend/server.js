require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const settingsRoutes = require('./routes/Settings');
const institutionRoutes = require('./routes/Institutions');
const coeStaffRoutes = require('./routes/coeStaffRoutes');

const app = express();

connectDB();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));

app.use(express.json());

// Audit logger: must come BEFORE every route, so each create / edit / delete is recorded.
// (It was at the bottom, after the routes, so it never ran.)
app.use(require('./middleware/Auditlogger'));

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/ceostaff', coeStaffRoutes);

const studentRoutes = require('./routes/studentRoutes');
app.use('/api/students', studentRoutes);

const courseRoutes = require('./routes/courseRoutes');
app.use('/api/courses', courseRoutes);

const curriculumRoutes = require('./routes/curriculumRoutes');
app.use('/api/curriculum', curriculumRoutes);

const AttendancemarkRoutes = require('./routes/Attendancemarkroutes');
app.use('/api/attendance-marks', AttendancemarkRoutes);

app.use('/api/nominal-roll', require('./routes/nominalRoll'));
app.use('/api/theory-timetable', require('./routes/theoryTimeTable'));
app.use('/api/application', require('./routes/application'));

app.use('/api/barcode', require('./routes/Barcoderoutes'));
app.use('/api/rebundle', require('./routes/Rebundleroutes'));
app.use('/api/external-marks', require('./routes/markroutes'));
app.use('/api/results', require('./routes/Resultroutes'));
app.use('/api/consolidated', require('./routes/Consolidatedroutes'));
app.use('/api/reports', require('./routes/Reportroutes'));
app.use('/api/provisional', require('./routes/provisionalroutes'));

// read the audit log (the Audit log page)
app.use('/api/audit-logs', require('./routes/Auditlogroutes'));
app.use('/api/roles', require('./routes/Roleroutes'));
   app.use('/api/dashboard', require('./routes/Dashboardroutes'));

   const marksLock = require('./routes/Markslock');
app.use('/api/marks-lock', marksLock);

app.use('/api/attendance-marks', marksLock.guard);        // must be ABOVE the next line
app.use('/api/attendance-marks', AttendancemarkRoutes);   // your existing line

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

app.use((err, req, res, next) => {
  if (!err.status) console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));