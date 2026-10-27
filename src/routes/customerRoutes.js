const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);
router.use(restrictTo('admin', 'owner', 'local_manager', 'attendant'));

router.get('/', customerController.getAllCustomers);
router.get('/:id', customerController.getCustomerById);
router.post('/', customerController.createCustomer);
router.put('/:id', customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer); // Esta chamará o softDelete no Model
router.delete(
  '/:id/hard',
  restrictTo('admin', 'owner', 'local_manager'),
  customerController.hardDeleteCustomer,
);

// Futuramente: Adicionar rotas para adicionar/remover endereços específicos
// router.post('/:id/addresses', customerController.addAddress);
// router.delete('/addresses/:addressId', customerController.removeAddress);

module.exports = router;
