const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

// --- Rota pública para atendentes: lojas para transferência ---
// Permite que atendentes vejam para quais lojas podem transferir (todas exceto a própria)
router.get('/for-transfer', protect, storeController.getStoresForTransfer);

// --- Rotas admin/owner ---
router.use(protect);
router.use(restrictTo('admin', 'owner'));

// Lista todas as lojas
router.get('/', storeController.getAllStores);

// Busca uma loja específica
router.get('/:id', storeController.getStoreById);

// Cria nova loja
router.post('/', storeController.createStore);

// Atualiza loja
router.put('/:id', storeController.updateStore);

// Alterna status ativo/inativo
router.patch('/:id/active', storeController.toggleStoreActive);

module.exports = router;
