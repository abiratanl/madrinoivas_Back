const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalController');
const contractController = require('../controllers/contractController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);

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

// Hard Delete - Apenas admin/owner e status cancelled
router.delete('/:id', restrictTo('admin', 'owner'), rentalController.deleteRental);

module.exports = router;
