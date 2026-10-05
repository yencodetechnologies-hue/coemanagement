const express = require('express');
const c = require('../controllers/Rolecontroller');

const router = express.Router();

router.get('/', c.list);                               // modules, actions, roles
router.get('/me', c.me);                               // permissions of the selected staff
router.post('/', c.create);                            // { name }
router.patch('/:id/permissions', c.updatePermissions); // { changes: [{ module, action, value }] }
router.delete('/:id', c.remove);

module.exports = router;

/*
 * In server.js, with your other routes:
 *
 *   app.use('/api/roles', require('./routes/roleRoutes'));
 */