const request = require('supertest');
const app = require('../src/app');
const PaymentModel = require('../src/models/PaymentModel');
const RentalModel = require('../src/models/RentalModel');

// =================================================================
// 1. MOCKS
// =================================================================

jest.mock('../src/models/PaymentModel');
jest.mock('../src/models/RentalModel');

// Simulando utilizador da Loja A
jest.mock('../src/middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = { id: 'user-caixa', role: 'attendant', storeId: 'store-A' };
    next();
  },
  restrictTo: (...roles) => (req, res, next) => next(),
}));

// =================================================================
// 2. SUÍTE DE TESTES
// =================================================================
describe('Financial & Payments API', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- CREATE PAYMENT (POST) ---

  it('POST /api/payments › Should register a payment successfully', async () => {
    const paymentData = {
      rental_id: 'rental-123',
      installment_id: 'inst-1',
      amount: 100.00,
      payment_method: 'pix'
    };

    // 1. Mock do Aluguel (Deve existir e ser da mesma loja)
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A', // OK: Mesma loja do utilizador
      total_amount: 200.00
    });

    // 2. Mock do Pagamento
    PaymentModel.create.mockResolvedValue({
      id: 'pay-new',
      ...paymentData
    });

    const res = await request(app).post('/api/payments').send(paymentData);

    expect(res.statusCode).toBe(201);
    expect(res.body.data.id).toBe('pay-new');
    expect(res.body.data.amount).toBe(100.00);

    // Verifica se o model foi chamado corretamente
    expect(PaymentModel.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 100.00,
      user_id: 'user-caixa' // Inserido automaticamente pelo controller
    }));
  });

  it('POST /api/payments › Should DENY payment for rental from another store', async () => {
    const paymentData = {
      rental_id: 'rental-other-store',
      amount: 50.00,
      payment_method: 'cash'
    };

    // Mock: Aluguel existe, mas é da Loja B
    RentalModel.findById.mockResolvedValue({
      id: 'rental-other-store',
      store_id: 'store-B' // <--- Invasão!
    });

    const res = await request(app).post('/api/payments').send(paymentData);

    expect(res.statusCode).toBe(403); // Forbidden
    expect(res.body.message).toMatch(/não é possível receber/i);
    
    // Garante que não registou nada no banco
    expect(PaymentModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/payments › Should FAIL if rental does not exist', async () => {
    RentalModel.findById.mockResolvedValue(null);

    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-fantasma',
      amount: 10,
      payment_method: 'pix'
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /api/payments › Should FAIL if data is missing', async () => {
    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-1'
      // Faltou amount e method
    });

    expect(res.statusCode).toBe(400);
  });

  // --- GET HISTORY ---

  it('GET /api/payments/rental/:id › Should list payments', async () => {
    const mockPayments = [
      { id: 'p1', amount: 50, paid_at: new Date() },
      { id: 'p2', amount: 50, paid_at: new Date() }
    ];

    PaymentModel.findByRentalId.mockResolvedValue(mockPayments);

    const res = await request(app).get('/api/payments/rental/rental-123');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

});