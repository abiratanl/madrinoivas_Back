const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/:id/pdf', contractController.getContractPdf);
router.post('/:id/send-email', contractController.sendContractEmail);
router.post('/:id/send-whatsapp', contractController.sendContractWhatsApp);

module.exports = router;
