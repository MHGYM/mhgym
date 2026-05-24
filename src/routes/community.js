const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/communityController');

router.get('/',               authenticate, ctrl.getPosts);
router.post('/',              authenticate, ctrl.createPost);
router.delete('/:id',         authenticate, ctrl.deletePost);
router.post('/:id/like',      authenticate, ctrl.toggleLike);
router.get('/:id/comments',   authenticate, ctrl.getComments);
router.post('/:id/comments',  authenticate, ctrl.addComment);
router.delete('/:id/comments/:cid', authenticate, ctrl.deleteComment);
router.put('/:id/pin',        authenticate, requireAdmin, ctrl.pinPost);

module.exports = router;
