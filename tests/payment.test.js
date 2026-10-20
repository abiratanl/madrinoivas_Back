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
  restrictTo:
    (..._roles) =>
    (req, res, next) =>
      next(),
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
      amount: 100.0,
      payment_method: 'pix',
      type: 'installment',
    };

    // 1. Mock do Aluguel (Deve existir e ser da mesma loja)
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A', // OK: Mesma loja do utilizador
      total_amount: 200.0,
    });

    // 2. Mock do saldo já pago e da parcela vinculada
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(0);
    PaymentModel.findInstallmentById.mockResolvedValue({
      id: 'inst-1',
      rental_id: 'rental-123',
      status: 'pending',
    });

    // 3. Mock do Pagamento
    PaymentModel.create.mockResolvedValue({
      id: 'pay-new',
      ...paymentData,
    });

    const res = await request(app).post('/api/payments').send(paymentData);

    expect(res.statusCode).toBe(201);
    expect(res.body.data.id).toBe('pay-new');
    expect(res.body.data.amount).toBe(100.0);

    // Verifica se o model foi chamado corretamente
    expect(PaymentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100.0,
        type: 'installment',
        user_id: 'user-caixa', // Inserido automaticamente pelo controller
      }),
    );
  });

  it('POST /api/payments › Should DENY payment for rental from another store', async () => {
    const paymentData = {
      rental_id: 'rental-other-store',
      amount: 50.0,
      payment_method: 'cash',
    };

    // Mock: Aluguel existe, mas é da Loja B
    RentalModel.findById.mockResolvedValue({
      id: 'rental-other-store',
      store_id: 'store-B', // <--- Invasão!
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
      payment_method: 'pix',
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /api/payments › Should FAIL if data is missing', async () => {
    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-1',
      // Faltou amount e method
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/payments › Should FAIL if amount exceeds the remaining balance', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });

    // Já foram pagos 150 de 200 → saldo devedor de 50
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(150);

    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-123',
      amount: 100.0,
      payment_method: 'pix',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/saldo devedor/i);
    expect(PaymentModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/payments › Should ALLOW paying the penalty fee on a fully paid rental', async () => {
    // Aluguel de 200 quitado, com multa de 30 já embutida no total (230)
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 230.0,
      penalty_fee: 30.0,
    });
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(200);
    PaymentModel.create.mockResolvedValue({
      id: 'pay-penalty',
      rental_id: 'rental-123',
      amount: 30.0,
      payment_method: 'pix',
      type: 'spontaneous',
    });

    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-123',
      amount: 30.0,
      payment_method: 'pix',
    });

    expect(res.statusCode).toBe(201);
    expect(PaymentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ rental_id: 'rental-123', amount: 30.0 }),
    );
  });

  it('POST /api/payments › Should FAIL if amount exceeds balance plus the penalty fee', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 230.0,
      penalty_fee: 30.0,
    });
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(200);

    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-123',
      amount: 31.0,
      payment_method: 'pix',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/saldo devedor/i);
    expect(PaymentModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/payments › Should FAIL if amount is zero or negative', async () => {
    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-123',
      amount: 0,
      payment_method: 'pix',
    });

    expect(res.statusCode).toBe(400);
    expect(PaymentModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/payments › Should FAIL for an invalid payment method', async () => {
    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-123',
      amount: 50,
      payment_method: 'bitcoin',
    });

    expect(res.statusCode).toBe(400);
    expect(PaymentModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/payments › Should FAIL for an invalid payment type', async () => {
    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-123',
      amount: 50,
      payment_method: 'pix',
      type: 'not_a_type',
    });

    expect(res.statusCode).toBe(400);
    expect(PaymentModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/payments › Should FAIL if installment belongs to another rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(0);
    PaymentModel.findInstallmentById.mockResolvedValue({
      id: 'inst-x',
      rental_id: 'rental-OUTRO', // <--- parcela de outro aluguel
      status: 'pending',
    });

    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-123',
      installment_id: 'inst-x',
      amount: 50,
      payment_method: 'pix',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/parcela/i);
    expect(PaymentModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/payments › Should FAIL if installment is already paid', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(0);
    PaymentModel.findInstallmentById.mockResolvedValue({
      id: 'inst-1',
      rental_id: 'rental-123',
      status: 'paid',
    });

    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-123',
      installment_id: 'inst-1',
      amount: 50,
      payment_method: 'pix',
    });

    expect(res.statusCode).toBe(400);
    expect(PaymentModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/payments › Should default type to "installment" when installment_id is given', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(0);
    PaymentModel.findInstallmentById.mockResolvedValue({
      id: 'inst-1',
      rental_id: 'rental-123',
      status: 'pending',
    });
    PaymentModel.create.mockResolvedValue({ id: 'pay-new' });

    const res = await request(app).post('/api/payments').send({
      rental_id: 'rental-123',
      installment_id: 'inst-1',
      amount: 50,
      payment_method: 'cash',
    });

    expect(res.statusCode).toBe(201);
    expect(PaymentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'installment',
      }),
    );
  });

  // --- GET HISTORY ---

  it('GET /api/payments/rental/:id › Should list payments', async () => {
    const mockPayments = [
      { id: 'p1', amount: 50, paid_at: new Date() },
      { id: 'p2', amount: 50, paid_at: new Date() },
    ];

    PaymentModel.findByRentalId.mockResolvedValue(mockPayments);

    const res = await request(app).get('/api/payments/rental/rental-123');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  // --- UPDATE PAYMENT (PATCH) ---

  it('PATCH /api/payments/:id › Should update a payment successfully', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      installment_id: 'inst-1',
      amount: 50,
      status: 'confirmed',
    });
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(50);
    PaymentModel.update.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 80,
      payment_method: 'cash',
    });

    const res = await request(app).patch('/api/payments/pay-1').send({
      amount: 80,
      payment_method: 'cash',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(PaymentModel.update).toHaveBeenCalledWith(
      'pay-1',
      { amount: 80, payment_method: 'cash' },
      expect.objectContaining({ id: 'pay-1' }),
    );
  });

  it('PATCH /api/payments/:id › Should FAIL if payment does not exist', async () => {
    PaymentModel.findById.mockResolvedValue(null);

    const res = await request(app).patch('/api/payments/pay-fantasma').send({ amount: 10 });

    expect(res.statusCode).toBe(404);
    expect(PaymentModel.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/payments/:id › Should FAIL when editing a cancelled payment', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 50,
      status: 'cancelled',
    });

    const res = await request(app).patch('/api/payments/pay-1').send({ amount: 80 });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cancelado/i);
    expect(PaymentModel.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/payments/:id › Should FAIL if new amount exceeds the remaining balance', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 50,
      status: 'confirmed',
    });
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });
    // 150 paid including this payment of 50 → remaining for the edit is 200 - (150 - 50) = 100
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(150);

    const res = await request(app).patch('/api/payments/pay-1').send({ amount: 150 });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/saldo devedor/i);
    expect(PaymentModel.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/payments/:id › Should FAIL for an invalid payment method', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 50,
      status: 'confirmed',
    });
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });

    const res = await request(app).patch('/api/payments/pay-1').send({ payment_method: 'bitcoin' });

    expect(res.statusCode).toBe(400);
    expect(PaymentModel.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/payments/:id › Should FAIL for an invalid payment type', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 50,
      status: 'confirmed',
    });
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });

    const res = await request(app).patch('/api/payments/pay-1').send({ type: 'not_a_type' });

    expect(res.statusCode).toBe(400);
    expect(PaymentModel.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/payments/:id › Should allow linking to the currently linked paid installment', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      installment_id: 'inst-1',
      amount: 100,
      status: 'confirmed',
    });
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });
    PaymentModel.getTotalPaidByRentalId.mockResolvedValue(100);
    PaymentModel.findInstallmentById.mockResolvedValue({
      id: 'inst-1',
      rental_id: 'rental-123',
      status: 'paid', // paid, but it is the payment's current installment
    });
    PaymentModel.update.mockResolvedValue({ id: 'pay-1', amount: 100, installment_id: 'inst-1' });

    const res = await request(app).patch('/api/payments/pay-1').send({ installment_id: 'inst-1' });

    expect(res.statusCode).toBe(200);
    expect(PaymentModel.update).toHaveBeenCalled();
  });

  // --- CANCEL PAYMENT (POST /:id/cancel) ---

  it('POST /api/payments/:id/cancel › Should cancel a payment successfully', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 50,
      status: 'confirmed',
    });
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });
    PaymentModel.cancel.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/payments/pay-1/cancel')
      .send({ reason: 'Pagamento lançado duplicado' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/cancelado com sucesso/i);
    expect(PaymentModel.cancel).toHaveBeenCalledWith(
      'pay-1',
      'user-caixa',
      'Pagamento lançado duplicado',
    );
  });

  it('POST /api/payments/:id/cancel › Should FAIL if payment does not exist', async () => {
    PaymentModel.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/payments/pay-fantasma/cancel')
      .send({ reason: 'Teste' });

    expect(res.statusCode).toBe(404);
    expect(PaymentModel.cancel).not.toHaveBeenCalled();
  });

  it('POST /api/payments/:id/cancel › Should FAIL if reason is missing', async () => {
    const res = await request(app).post('/api/payments/pay-1/cancel').send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/motivo/i);
    expect(PaymentModel.cancel).not.toHaveBeenCalled();
  });

  it('POST /api/payments/:id/cancel › Should FAIL if payment is already cancelled', async () => {
    PaymentModel.findById.mockResolvedValue({
      id: 'pay-1',
      rental_id: 'rental-123',
      amount: 50,
      status: 'cancelled',
    });
    RentalModel.findById.mockResolvedValue({
      id: 'rental-123',
      store_id: 'store-A',
      total_amount: 200.0,
    });

    const res = await request(app)
      .post('/api/payments/pay-1/cancel')
      .send({ reason: 'Tentativa duplicada' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/já está cancelado/i);
    expect(PaymentModel.cancel).not.toHaveBeenCalled();
  });
});
