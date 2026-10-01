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
  restrictTo: (...roles) => (req, res, next) => next(),
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
      status: 'reserved'
    };

    // 1. Mock do Produto (O Controller busca o preço no banco)
    ProductModel.findById.mockResolvedValue({
      id: 'prod-1',
      name: 'Vestido Azul',
      status: 'available', // Importante: está disponível
      rental_price: 200.00
    });

    // 2. Mock da Transação do Aluguel
    RentalModel.createTransaction.mockResolvedValue({
      id: 'rental-new',
      total_amount: 200.00,
      status: 'reserved'
    });

    const res = await request(app).post('/api/rentals').send(rentalData);

    expect(res.statusCode).toBe(201);
    expect(res.body.data.id).toBe('rental-new');
    
    // Verifica se o controller chamou a transação com os dados enriquecidos (preço)
    expect(RentalModel.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      store_id: 'store-A', // Inserido automaticamente pelo controller
      items: expect.arrayContaining([
        expect.objectContaining({ unit_price: 200.00 }) // Preço veio do mock do produto
      ])
    }));
  });

  it('POST /api/rentals › Should FAIL if product is not available', async () => {
    const rentalData = {
      customer_id: 'cust-1',
      start_date: '2025-12-20',
      end_date_scheduled: '2025-12-25',
      products: [{ id: 'prod-ocupado' }],
      status: 'reserved'
    };

    // Mock: Produto existe, mas está ALUGADO
    ProductModel.findById.mockResolvedValue({
      id: 'prod-ocupado',
      name: 'Terno Ocupado',
      status: 'rented', // <--- O PULO DO GATO
      rental_price: 300.00
    });

    const res = await request(app).post('/api/rentals').send(rentalData);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/não está disponível/i);
    
    // Garante que não tentou criar o aluguel
    expect(RentalModel.createTransaction).not.toHaveBeenCalled();
  });

  it('POST /api/rentals › Should FAIL if product does not exist', async () => {
    ProductModel.findById.mockResolvedValue(null); // Produto não achado

    const res = await request(app).post('/api/rentals').send({
      customer_id: 'c1',
      start_date: '2025-01-01',
      end_date_scheduled: '2025-01-05',
      products: [{ id: 'prod-fantasma' }]
    });

    expect(res.statusCode).toBe(404);
  });

  // --- GET DETAILS (ById) ---

  it('GET /api/rentals/:id › Should return rental details with security check', async () => {
    // Mock do Aluguel pertencente à Loja A (mesma do usuário)
    RentalModel.findById.mockResolvedValue({
      id: 'rental-1',
      store_id: 'store-A',
      total_amount: 500.00,
      items: [],
      installments: []
    });

    const res = await request(app).get('/api/rentals/rental-1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.total_amount).toBe(500.00);
  });

  it('GET /api/rentals/:id › Should DENY access to rental from another store', async () => {
    // Mock do Aluguel pertencente à Loja B (outra loja)
    RentalModel.findById.mockResolvedValue({
      id: 'rental-2',
      store_id: 'store-B', // <--- Invasão de perímetro!
      total_amount: 1000.00
    });

    const res = await request(app).get('/api/rentals/rental-2');

    expect(res.statusCode).toBe(403); // Forbidden
    expect(res.body.message).toMatch(/acesso negado/i);
  });

});