const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect); // Todas protegidas

// --- Rotas originais (Transfer-centric) ---
router.get('/', transferController.getMyTransfers);
router.post('/request', transferController.requestTransfer);
router.post('/receive', transferController.receiveTransfer);

module.exports = router;