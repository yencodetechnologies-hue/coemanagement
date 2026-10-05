const router = require('express').Router();
const c = require('../controllers/Settingscontroller');

router.get('/', c.getSettings);
router.put('/university', c.updateUniversity);
router.put('/grading-scale', c.updateGradingScale);
router.put('/serial', c.updateSerial);
router.post('/sessions', c.addSession);
router.patch('/sessions/:name/activate', c.activateSession);
router.delete('/sessions/:name', c.deleteSession);

module.exports = router;