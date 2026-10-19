const express = require('express');
const router = express.Router();
const collectionController = require('../controllers/collectionController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);

// Leitura - todos os autenticados
router.get('/', collectionController.getAllCollections);
router.get('/slug/:slug', collectionController.getCollectionBySlug);
router.get('/:id', collectionController.getCollectionById);

// Escrita - admin, owner, local_manager
router.post(
  '/',
  restrictTo('admin', 'owner', 'local_manager'),
  collectionController.createCollection,
);
router.put(
  '/:id',
  restrictTo('admin', 'owner', 'local_manager'),
  collectionController.updateCollection,
);
router.delete(
  '/:id',
  restrictTo('admin', 'owner', 'local_manager'),
  collectionController.deleteCollection,
);

module.exports = router;
