const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');
const {
  uploadStoreSignature,
  processStoreSignature,
} = require('../middlewares/storeSignatureMiddleware');

// --- Rota pública para atendentes: lojas para transferência ---
// Permite que atendentes vejam para quais lojas podem transferir (todas exceto a própria)
router.get('/for-transfer', protect, storeController.getStoresForTransfer);

// --- Busca de uma loja específica (admin/owner e usuários da própria loja) ---
router.get(
  '/:id',
  protect,
  restrictTo('admin', 'owner', 'local_manager', 'attendant'),
  storeController.getStoreById,
);

// --- Rotas admin/owner ---
router.use(protect);
router.use(restrictTo('admin', 'owner'));

// Lista todas as lojas
router.get('/', storeController.getAllStores);

// Cria nova loja
router.post('/', uploadStoreSignature, processStoreSignature, storeController.createStore);

// Atualiza loja
router.put('/:id', uploadStoreSignature, processStoreSignature, storeController.updateStore);

// Alterna status ativo/inativo
router.patch('/:id/active', storeController.toggleStoreActive);

module.exports = router;
