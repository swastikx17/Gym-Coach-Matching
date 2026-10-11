const router = require('express').Router();
const c = require('../controllers/memberController');
router.get('/', c.list);
router.get('/:cardNo', c.getOne);
router.post('/', c.create);
router.put('/:cardNo', c.update);
router.delete('/:cardNo', c.remove);
module.exports = router;
