const request = require('supertest');
const app = require('../src/app');
const RentalModel = require('../src/models/RentalModel');
const ProductModel = require('../src/models/ProductModel');

// =================================================================
// 1. MOCKS
// =================================================================

jest.mock('../src/models/RentalModel');
jest.mock('../src/models/ProductModel');

// Mock Auth: Usuário Attendant da Loja A
jest.mock('../src/middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = { id: 'user-vendedor', role: 'attendant', storeId: 'store-A' };
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
describe('Rental Management API (Core Business)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- CREATE RENTAL (POST) ---

  it('POST /api/rentals › Should create a rental successfully', async () => {
    // Dados de entrada (Frontend enviando)
    const rentalData = {
      customer_id: 'cust-1',
      start_date: '2025-12-20',
      end_date_scheduled: '2025-12-25',
      products: [{ id: 'prod-1' }], // Apenas IDs
      status: 'reserved',
    };

    // 1. Mock do Produto (O Controller busca o preço no banco)
    ProductModel.findById.mockResolvedValue({
      id: 'prod-1',
      name: 'Vestido Azul',
      status: 'available', // Importante: está disponível
      rental_price: 200.0,
    });

    // 2. Mock da Transação do Aluguel
    RentalModel.createTransaction.mockResolvedValue({
      id: 'rental-new',
      total_amount: 200.0,
      status: 'reserved',
    });

    const res = await request(app).post('/api/rentals').send(rentalData);

    expect(res.statusCode).toBe(201);
    expect(res.body.data.id).toBe('rental-new');

    // Verifica se o controller chamou a transação com os dados enriquecidos (preço)
    expect(RentalModel.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: 'store-A', // Inserido automaticamente pelo controller
        items: expect.arrayContaining([
          expect.objectContaining({ unit_price: 200.0 }), // Preço veio do mock do produto
        ]),
      }),
    );
  });

  it('POST /api/rentals › Should FAIL if product is not available', async () => {
    const rentalData = {
      customer_id: 'cust-1',
      start_date: '2025-12-20',
      end_date_scheduled: '2025-12-25',
      products: [{ id: 'prod-ocupado' }],
      status: 'reserved',
    };

    // Mock: Produto existe, mas está ALUGADO
    ProductModel.findById.mockResolvedValue({
      id: 'prod-ocupado',
      name: 'Terno Ocupado',
      status: 'rented', // <--- O PULO DO GATO
      rental_price: 300.0,
    });

    const res = await request(app).post('/api/rentals').send(rentalData);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/não está disponível/i);

    // Garante que não tentou criar o aluguel
    expect(RentalModel.createTransaction).not.toHaveBeenCalled();
  });

  it('POST /api/rentals › Should FAIL if product does not exist', async () => {
    ProductModel.findById.mockResolvedValue(null); // Produto não achado

    const res = await request(app)
      .post('/api/rentals')
      .send({
        customer_id: 'c1',
        start_date: '2025-01-01',
        end_date_scheduled: '2025-01-05',
        products: [{ id: 'prod-fantasma' }],
      });

    expect(res.statusCode).toBe(404);
  });

  // --- GET DETAILS (ById) ---

  it('GET /api/rentals/:id › Should return rental details with security check', async () => {
    // Mock do Aluguel pertencente à Loja A (mesma do usuário)
    RentalModel.findById.mockResolvedValue({
      id: 'rental-1',
      store_id: 'store-A',
      total_amount: 500.0,
      items: [],
      installments: [],
    });

    const res = await request(app).get('/api/rentals/rental-1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.total_amount).toBe(500.0);
  });

  it('GET /api/rentals/:id › Should DENY access to rental from another store', async () => {
    // Mock do Aluguel pertencente à Loja B (outra loja)
    RentalModel.findById.mockResolvedValue({
      id: 'rental-2',
      store_id: 'store-B', // <--- Invasão de perímetro!
      total_amount: 1000.0,
    });

    const res = await request(app).get('/api/rentals/rental-2');

    expect(res.statusCode).toBe(403); // Forbidden
    expect(res.body.message).toMatch(/acesso negado/i);
  });

  // --- FITTING DATE (prova do traje) ---

  const validBaseRental = {
    customer_id: 'cust-1',
    start_date: '2026-12-20',
    end_date_scheduled: '2026-12-25',
    products: [{ id: 'prod-1' }],
    status: 'reserved',
  };

  beforeEach(() => {
    ProductModel.findById.mockResolvedValue({
      id: 'prod-1',
      name: 'Vestido Azul',
      status: 'available',
      rental_price: 200.0,
    });
    RentalModel.createTransaction.mockResolvedValue({
      id: 'rental-new',
      total_amount: 200.0,
      status: 'reserved',
    });
  });

  it('POST /api/rentals › Should create a rental with a valid fitting date', async () => {
    const res = await request(app)
      .post('/api/rentals')
      .send({ ...validBaseRental, fitting_date: '2026-12-15T14:00:00' });

    expect(res.statusCode).toBe(201);
    expect(RentalModel.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ fitting_date: '2026-12-15T14:00:00' }),
    );
  });

  it('POST /api/rentals › Should FAIL if fitting date is after the pickup date', async () => {
    const res = await request(app)
      .post('/api/rentals')
      .send({ ...validBaseRental, fitting_date: '2026-12-21T10:00:00' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/anterior ou igual à data de retirada/i);
    expect(RentalModel.createTransaction).not.toHaveBeenCalled();
  });

  it('POST /api/rentals › Should FAIL if fitting date is before the creation date', async () => {
    const res = await request(app)
      .post('/api/rentals')
      .send({ ...validBaseRental, fitting_date: '2020-01-01T10:00:00' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/posterior ou igual à data de criação/i);
    expect(RentalModel.createTransaction).not.toHaveBeenCalled();
  });

  it('POST /api/rentals › Should FAIL if fitting date is not a valid date', async () => {
    const res = await request(app)
      .post('/api/rentals')
      .send({ ...validBaseRental, fitting_date: 'not-a-date' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/data da prova inválida/i);
    expect(RentalModel.createTransaction).not.toHaveBeenCalled();
  });

  it('PUT /api/rentals/:id › Should update the fitting date on a reserved rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-1',
      store_id: 'store-A',
      status: 'reserved',
      start_date: '2026-12-20T10:00:00',
      created_at: '2026-01-01T00:00:00',
    });
    RentalModel.updateRental.mockResolvedValue({});

    const res = await request(app)
      .put('/api/rentals/rental-1')
      .send({ fitting_date: '2026-12-18T15:00:00' });

    expect(res.statusCode).toBe(200);
    expect(RentalModel.updateRental).toHaveBeenCalledWith(
      'rental-1',
      expect.objectContaining({ fitting_date: '2026-12-18T15:00:00' }),
    );
  });

  it('PUT /api/rentals/:id › Should FAIL if fitting date is after the pickup date', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-1',
      store_id: 'store-A',
      status: 'reserved',
      start_date: '2026-12-20T10:00:00',
      created_at: '2026-01-01T00:00:00',
    });

    const res = await request(app)
      .put('/api/rentals/rental-1')
      .send({ fitting_date: '2026-12-21T10:00:00' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/anterior ou igual à data de retirada/i);
    expect(RentalModel.updateRental).not.toHaveBeenCalled();
  });

  it('PUT /api/rentals/:id › Should FAIL to change fitting date on a picked-up rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-1',
      store_id: 'store-A',
      status: 'picked_up',
      start_date: '2026-12-20T10:00:00',
      created_at: '2026-01-01T00:00:00',
    });

    const res = await request(app)
      .put('/api/rentals/rental-1')
      .send({ fitting_date: '2026-12-18T15:00:00' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/retirado ou atrasado/i);
    expect(RentalModel.updateRental).not.toHaveBeenCalled();
  });
});
