let mockUser = { id: 'user-1', role: 'admin', storeId: 'store-A' };

jest.mock('../src/middlewares/authMiddleware', () => {
  const actual = jest.requireActual('../src/middlewares/authMiddleware');

  return {
    ...actual,
    protect: (req, res, next) => {
      req.user = mockUser;
      next();
    },
  };
});

jest.mock('../src/middlewares/imageMiddleware', () => ({
  uploadArray: (req, res, next) => next(),
  optimizeAndUploadImages: (req, res, next) => next(),
}));

jest.mock('../src/models/RentalModel');
jest.mock('../src/models/PaymentModel');
jest.mock('../src/models/ProductModel');
jest.mock('../src/models/CustomerModel');
jest.mock('../src/models/StoreModel');
jest.mock('../src/models/ReceiptModel');
jest.mock('../src/models/ContractModel');
jest.mock('../src/models/TransferModel');
jest.mock('../src/services/contractService');
jest.mock('../src/services/receiptService');

const request = require('supertest');
const app = require('../src/app');
const RentalModel = require('../src/models/RentalModel');
const PaymentModel = require('../src/models/PaymentModel');
const ProductModel = require('../src/models/ProductModel');
const CustomerModel = require('../src/models/CustomerModel');
const StoreModel = require('../src/models/StoreModel');
const ReceiptModel = require('../src/models/ReceiptModel');
const ContractModel = require('../src/models/ContractModel');
const TransferModel = require('../src/models/TransferModel');
const contractService = require('../src/services/contractService');
const receiptService = require('../src/services/receiptService');

describe('Route authorization and store scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1', role: 'admin', storeId: 'store-A' };
  });

  describe('route RBAC', () => {
    it('forbids attendants from permanently deleting rentals', async () => {
      mockUser = { id: 'attendant-1', role: 'attendant', storeId: 'store-A' };

      const res = await request(app).delete('/api/rentals/rental-1');

      expect(res.statusCode).toBe(403);
      expect(RentalModel.findById).not.toHaveBeenCalled();
    });

    it('allows a local manager to permanently delete a cancelled rental from their store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      RentalModel.findById.mockResolvedValue({
        id: 'rental-1',
        store_id: 'store-A',
        status: 'cancelled',
      });
      RentalModel.deleteRental.mockResolvedValue(true);

      const res = await request(app).delete('/api/rentals/rental-1');

      expect(res.statusCode).toBe(200);
      expect(RentalModel.deleteRental).toHaveBeenCalledWith('rental-1');
    });

    it.each([
      ['patch', '/api/payments/pay-1'],
      ['post', '/api/payments/pay-1/cancel'],
    ])('forbids attendants from %s %s', async (method, path) => {
      mockUser = { id: 'attendant-1', role: 'attendant', storeId: 'store-A' };

      const res = await request(app)
        [method](path)
        .send({ amount: 10, reason: 'Tentativa sem permissão' });

      expect(res.statusCode).toBe(403);
      expect(PaymentModel.findById).not.toHaveBeenCalled();
    });

    it('allows a local manager to edit a payment from their store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      PaymentModel.findById.mockResolvedValue({
        id: 'pay-1',
        rental_id: 'rental-1',
        amount: 50,
        status: 'confirmed',
      });
      RentalModel.findById.mockResolvedValue({
        id: 'rental-1',
        store_id: 'store-A',
        total_amount: 200,
      });
      PaymentModel.getTotalPaidByRentalId.mockResolvedValue(50);
      PaymentModel.update.mockResolvedValue({ id: 'pay-1', amount: 60 });

      const res = await request(app).patch('/api/payments/pay-1').send({ amount: 60 });

      expect(res.statusCode).toBe(200);
      expect(PaymentModel.update).toHaveBeenCalled();
    });

    it('forbids attendants from hard-deleting customers but allows local managers', async () => {
      mockUser = { id: 'attendant-1', role: 'attendant', storeId: 'store-A' };

      const denied = await request(app).delete('/api/customers/customer-1/hard');
      expect(denied.statusCode).toBe(403);
      expect(CustomerModel.findById).not.toHaveBeenCalled();

      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      CustomerModel.findById.mockResolvedValue({ id: 'customer-1' });
      CustomerModel.hardDelete.mockResolvedValue(true);

      const allowed = await request(app).delete('/api/customers/customer-1/hard');
      expect(allowed.statusCode).toBe(200);
      expect(CustomerModel.hardDelete).toHaveBeenCalledWith('customer-1');
    });

    it('restricts the store listing to admins and owners', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };

      const denied = await request(app).get('/api/stores');
      expect(denied.statusCode).toBe(403);
      expect(StoreModel.findAll).not.toHaveBeenCalled();

      mockUser = { id: 'admin-1', role: 'admin', storeId: 'store-A' };
      StoreModel.findAll.mockResolvedValue([]);

      const allowed = await request(app).get('/api/stores');
      expect(allowed.statusCode).toBe(200);
      expect(StoreModel.findAll).toHaveBeenCalledWith(false);
    });
  });

  describe('store scoping', () => {
    it('allows a local manager to read their own store but not another store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      StoreModel.findById.mockResolvedValue({
        id: 'store-B',
        owner_signature: null,
      });

      const denied = await request(app).get('/api/stores/store-B');
      expect(denied.statusCode).toBe(403);

      StoreModel.findById.mockResolvedValue({
        id: 'store-A',
        owner_signature: null,
      });

      const allowed = await request(app).get('/api/stores/store-A');
      expect(allowed.statusCode).toBe(200);
      expect(allowed.body.data.id).toBe('store-A');
    });

    it('lists transfer destinations excluding the attendant store', async () => {
      mockUser = { id: 'attendant-1', role: 'attendant', storeId: 'store-A' };
      StoreModel.findAllForTransfer.mockResolvedValue([]);

      const res = await request(app).get('/api/stores/for-transfer');

      expect(res.statusCode).toBe(200);
      expect(StoreModel.findAllForTransfer).toHaveBeenCalledWith('store-A');
    });

    it('forbids a local manager from reading a product from another store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      ProductModel.findById.mockResolvedValue({
        id: 'product-B',
        store_id: 'store-B',
      });

      const denied = await request(app).get('/api/products/product-B');
      expect(denied.statusCode).toBe(403);
      expect(ProductModel.getImagesByProductId).not.toHaveBeenCalled();

      ProductModel.findById.mockResolvedValue({
        id: 'product-A',
        store_id: 'store-A',
      });
      ProductModel.getImagesByProductId.mockResolvedValue([]);

      const allowed = await request(app).get('/api/products/product-A');
      expect(allowed.statusCode).toBe(200);
    });

    it('ignores a store_id override when a local manager lists products', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      ProductModel.findAll.mockResolvedValue([]);

      const res = await request(app).get('/api/products?store_id=store-B');

      expect(res.statusCode).toBe(200);
      expect(ProductModel.findAll).toHaveBeenCalledWith({ store_id: 'store-A' });
    });

    it('forces the local manager store when creating a product', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      ProductModel.create.mockResolvedValue('new-product');

      const res = await request(app).post('/api/products').send({
        name: 'Vestido Teste',
        code: 'TEST-1',
        rental_price: 100,
        store_id: 'store-B',
      });

      expect(res.statusCode).toBe(201);
      expect(ProductModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ store_id: 'store-A' }),
      );
    });

    it('ignores a store_id override when a local manager lists rentals', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      RentalModel.findAll.mockResolvedValue([]);

      const res = await request(app).get('/api/rentals?store_id=store-B');

      expect(res.statusCode).toBe(200);
      expect(RentalModel.findAll).toHaveBeenCalledWith({ store_id: 'store-A' });
    });

    it('forbids a local manager from creating a rental with a product from another store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      ProductModel.findById.mockResolvedValue({
        id: 'product-B',
        name: 'Vestido de outra loja',
        store_id: 'store-B',
        status: 'available',
        rental_price: 100,
      });

      const res = await request(app)
        .post('/api/rentals')
        .send({
          customer_id: 'customer-1',
          start_date: '2026-11-01',
          end_date_scheduled: '2026-11-05',
          products: [{ id: 'product-B' }],
        });

      expect(res.statusCode).toBe(403);
      expect(RentalModel.createTransaction).not.toHaveBeenCalled();
    });

    it.each([
      ['get', '/api/rentals/rental-B'],
      ['put', '/api/rentals/rental-B'],
      ['post', '/api/rentals/rental-B/pickup'],
      ['post', '/api/rentals/rental-B/extend'],
      ['post', '/api/rentals/rental-B/return'],
      ['post', '/api/rentals/rental-B/cancel'],
      ['delete', '/api/rentals/rental-B'],
    ])('forbids a local manager from %s %s', async (method, path) => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      RentalModel.findById.mockResolvedValue({
        id: 'rental-B',
        store_id: 'store-B',
        status: 'reserved',
      });

      const res = await request(app)[method](path);

      expect(res.statusCode).toBe(403);
    });

    it('forbids reading payments from a rental in another store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      RentalModel.findById.mockResolvedValue({
        id: 'rental-B',
        store_id: 'store-B',
      });

      const res = await request(app).get('/api/payments/rental/rental-B');

      expect(res.statusCode).toBe(403);
      expect(PaymentModel.findByRentalId).not.toHaveBeenCalled();
    });

    it.each([
      ['patch', '/api/payments/pay-B'],
      ['post', '/api/payments/pay-B/cancel'],
    ])('forbids a local manager from %s %s on another store', async (method, path) => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      PaymentModel.findById.mockResolvedValue({
        id: 'pay-B',
        rental_id: 'rental-B',
        amount: 50,
        status: 'confirmed',
      });
      RentalModel.findById.mockResolvedValue({
        id: 'rental-B',
        store_id: 'store-B',
        total_amount: 200,
      });

      const res = await request(app)
        [method](path)
        .send({ amount: 60, reason: 'Tentativa cross-store' });

      expect(res.statusCode).toBe(403);
      expect(PaymentModel.update).not.toHaveBeenCalled();
      expect(PaymentModel.cancel).not.toHaveBeenCalled();
    });

    it('forbids issuing or listing receipts from another store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      PaymentModel.findById.mockResolvedValue({
        id: 'pay-B',
        rental_id: 'rental-B',
        status: 'confirmed',
      });
      RentalModel.findById.mockResolvedValue({
        id: 'rental-B',
        store_id: 'store-B',
      });

      const issue = await request(app).post('/api/payments/pay-B/receipt');
      expect(issue.statusCode).toBe(403);
      expect(receiptService.issueReceipt).not.toHaveBeenCalled();

      const list = await request(app).get('/api/payments/pay-B/receipts');
      expect(list.statusCode).toBe(403);
      expect(ReceiptModel.findByPaymentId).not.toHaveBeenCalled();
    });

    it('forbids cancelling a contract from another store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      ContractModel.findById.mockResolvedValue({
        id: 'contract-B',
        rental_id: 'rental-B',
      });
      RentalModel.findById.mockResolvedValue({
        id: 'rental-B',
        store_id: 'store-B',
      });

      const res = await request(app)
        .post('/api/contracts/contract-B/cancel')
        .send({ notes: 'Tentativa cross-store' });

      expect(res.statusCode).toBe(403);
      expect(contractService.cancelContract).not.toHaveBeenCalled();
    });

    it('forbids receiving a transfer destined for another store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      TransferModel.findById.mockResolvedValue({
        id: 'transfer-B',
        product_id: 'product-B',
        to_store_id: 'store-B',
        status: 'active',
      });

      const res = await request(app)
        .post('/api/transfers/receive')
        .send({ transfer_id: 'transfer-B' });

      expect(res.statusCode).toBe(403);
      expect(ProductModel.update).not.toHaveBeenCalled();
      expect(TransferModel.updateStatus).not.toHaveBeenCalled();
    });

    it('filters transfer listings by the local manager store', async () => {
      mockUser = { id: 'manager-1', role: 'local_manager', storeId: 'store-A' };
      TransferModel.findAll.mockResolvedValue([]);

      const res = await request(app).get('/api/transfers?store_id=store-B');

      expect(res.statusCode).toBe(200);
      expect(TransferModel.findAll).toHaveBeenCalledWith({ store_id: 'store-A' });
    });

    it('filters transfer listings by destination for attendants', async () => {
      mockUser = { id: 'attendant-1', role: 'attendant', storeId: 'store-A' };
      TransferModel.findAll.mockResolvedValue([]);

      const res = await request(app).get('/api/transfers');

      expect(res.statusCode).toBe(200);
      expect(TransferModel.findAll).toHaveBeenCalledWith({ to_store_id: 'store-A' });
    });
  });
});
