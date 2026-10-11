const router = require('express').Router();
const c = require('../controllers/coachController');
router.get('/', c.list);
router.get('/:coachId/members', c.members);
router.get('/:coachId', c.getOne);
router.post('/', c.create);
router.put('/:coachId', c.update);
router.delete('/:coachId', c.remove);
module.exports = router;
