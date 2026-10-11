const router = require('express').Router();
const c = require('../controllers/assignmentController');
router.get('/', c.list);
router.post('/', c.create);
router.put('/:cardNo', c.reassign);
router.delete('/:cardNo', c.remove);
module.exports = router;
