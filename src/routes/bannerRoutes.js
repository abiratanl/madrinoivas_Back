const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);

// Leitura - todos os autenticados
router.get('/', bannerController.getAllBanners);
router.get('/:id', bannerController.getBannerById);

// Escrita - admin, owner, local_manager
router.post('/', restrictTo('admin', 'owner', 'local_manager'), bannerController.createBanner);
router.put('/:id', restrictTo('admin', 'owner', 'local_manager'), bannerController.updateBanner);
router.delete('/:id', restrictTo('admin', 'owner', 'local_manager'), bannerController.deleteBanner);

module.exports = router;
