const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalController');
const contractController = require('../controllers/contractController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const { requireStoreScope } = require('../middlewares/storeScopeMiddleware');

router.use(protect);
router.use(restrictTo('admin', 'owner', 'local_manager', 'attendant'));
router.use(requireStoreScope);

// Listagem e Cadastro
router.get('/', rentalController.getAllRentals);
router.post('/', rentalController.createRental);

// Operações Individuais
router.get('/:id', rentalController.getRentalById);
router.put('/:id', rentalController.updateRental);
router.post('/:id/pickup', rentalController.pickUpRental);
router.post('/:id/extend', rentalController.extendRental);
router.post('/:id/return', rentalController.returnRental);
router.post('/:id/cancel', rentalController.cancelRental);
router.post('/:id/contract', contractController.generateContract);
router.get('/:id/contract', contractController.getContractByRental);
router.post('/:id/contract/send-email', contractController.sendContractPreviewEmail);
router.post('/:id/contract/send-whatsapp', contractController.sendContractPreviewWhatsApp);
router.get('/:id/contract/preview/pdf', contractController.getContractPreviewPdfByRental);
router.get('/:id/contract/pdf', contractController.getContractPdfByRental);

// Hard Delete - Apenas admin/owner/local_manager e status cancelled
router.delete('/:id', restrictTo('admin', 'owner', 'local_manager'), rentalController.deleteRental);

module.exports = router;
