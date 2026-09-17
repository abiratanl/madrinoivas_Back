const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalController');
const { protect } = require('../middlewares/authMiddleware');

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

module.exports = router;