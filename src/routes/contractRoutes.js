const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const { requireStoreScope } = require('../middlewares/storeScopeMiddleware');

router.use(protect);
router.use(restrictTo('admin', 'owner', 'local_manager', 'attendant'));
router.use(requireStoreScope);

// Dual PDF persistence flow: generate the draft, then sign it.
router.post('/generate', contractController.generateContractDraft);
router.post('/:id/sign', contractController.signContract);
router.post(
  '/:id/cancel',
  restrictTo('admin', 'owner', 'local_manager'),
  contractController.cancelContract,
);

router.get('/:id/pdf', contractController.getContractPdf);
router.post('/:id/send-email', contractController.sendContractEmail);
router.post('/:id/send-whatsapp', contractController.sendContractWhatsApp);

module.exports = router;
