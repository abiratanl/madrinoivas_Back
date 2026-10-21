const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const receiptController = require('../controllers/receiptController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);

// Registrar pagamento
router.post('/', paymentController.createPayment);

// Ver histórico de pagamentos de um aluguel
router.get('/rental/:rentalId', paymentController.getPaymentsByRental);

// Edit a confirmed payment (admin/owner only)
router.patch('/:id', restrictTo('admin', 'owner'), paymentController.updatePayment);

// Soft-cancel a payment (admin/owner only)
router.post('/:id/cancel', restrictTo('admin', 'owner'), paymentController.cancelPayment);

// Issue a signed receipt for a confirmed payment
router.post('/:id/receipt', receiptController.issueReceipt);

// List receipts issued for a payment
router.get('/:id/receipts', receiptController.getReceiptsByPayment);

module.exports = router;
