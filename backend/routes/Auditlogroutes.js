const express = require('express');
const c = require('../controllers/Auditlogcontroller');

const router = express.Router();

router.get('/filters', c.filters); // dropdown values
router.get('/', c.list);           // paged, newest first

module.exports = router;

/*
 * In server.js / app.js:
 *
 *   app.use(express.json());
 *   app.use(cors());
 *   app.use(require('./middleware/auditLogger'));                 // BEFORE your routes
 *   ...your existing routes...
 *   app.use('/api/audit-logs', require('./routes/auditLogRoutes'));
 *
 * If your cors() call lists allowedHeaders, add 'x-staff-id' to that list.
 */