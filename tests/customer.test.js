const request = require('supertest');
const app = require('../src/app');
const CustomerModel = require('../src/models/CustomerModel');

// =================================================================
// 1. MOCKS
// =================================================================

// Mock do Model para não tocar no banco real
jest.mock('../src/models/CustomerModel');

// Mock da Autenticação
jest.mock('../src/middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = { id: 'user-id', role: 'attendant', storeId: 'store-A' };
    next();
  },
  restrictTo: (...roles) => (req, res, next) => next(),
}));

// =================================================================
// 2. SUÍTE DE TESTES
// =================================================================
describe('Customer Management API', () => {
  
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- CREATE (POST) ---
  
  it('POST /api/customers › Should create a customer successfully', async () => {
    const newCustomer = {
      name: 'Maria Silva',
      cpf: '123.456.789-00',
      birth_date: '1990-05-20',
      contacts: [{ type: 'whatsapp', value: '11999998888', is_primary: true }],
      addresses: [{ street: 'Rua A', city: 'Lorena', state: 'SP', zip_code: '12600000' }]
    };

    // 1. Simula que o CPF não existe (não é duplicado)
    CustomerModel.findByCpf.mockResolvedValue(null);

    // 2. Simula a criação com sucesso
    CustomerModel.create.mockResolvedValue({
      id: 'uuid-novo',
      ...newCustomer
    });

    const res = await request(app).post('/api/customers').send(newCustomer);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Maria Silva');
    
    // Verifica se o Model foi chamado com os dados certos
    expect(CustomerModel.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Maria Silva',
      contacts: expect.any(Array)
    }));
  });

  it('POST /api/customers › Should fail if Name or Contacts are missing', async () => {
    const invalidCustomer = { cpf: '123' }; // Faltou nome e contatos

    const res = await request(app).post('/api/customers').send(invalidCustomer);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/obrigatórios/i);
    
    // Garante que nem tentou chamar o banco
    expect(CustomerModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/customers › Should fail if CPF already exists', async () => {
    const dupeCustomer = {
      name: 'Joana Duplicada',
      cpf: '111.222.333-44',
      contacts: [{ type: 'mobile', value: '123' }]
    };

    // Simula que JÁ EXISTE alguém com esse CPF
    CustomerModel.findByCpf.mockResolvedValue({ id: 'old-user', name: 'Alguem' });

    const res = await request(app).post('/api/customers').send(dupeCustomer);

    expect(res.statusCode).toBe(409); // Conflict
    expect(res.body.message).toMatch(/CPF já cadastrado/i);
  });

  // --- LIST (GET) ---

  it('GET /api/customers › Should return a list of customers', async () => {
    const mockList = [
      { id: '1', name: 'Ana', main_phone: '999', city: 'Cruzeiro' },
      { id: '2', name: 'Bia', main_phone: '888', city: 'Guará' }
    ];

    CustomerModel.findAll.mockResolvedValue(mockList);

    const res = await request(app).get('/api/customers');

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].city).toBe('Cruzeiro');
  });

  // --- DETAILS (GET BY ID) ---

  it('GET /api/customers/:id › Should return full customer details', async () => {
    const mockDetails = {
      id: 'uuid-10',
      name: 'Carlos',
      addresses: [{ street: 'Rua B' }],
      contacts: [{ value: 'zap' }]
    };

    CustomerModel.findById.mockResolvedValue(mockDetails);

    const res = await request(app).get('/api/customers/uuid-10');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.addresses).toHaveLength(1);
    expect(res.body.data.contacts).toHaveLength(1);
  });

  it('GET /api/customers/:id › Should return 404 if not found', async () => {
    CustomerModel.findById.mockResolvedValue(null);

    const res = await request(app).get('/api/customers/uuid-inexistente');

    expect(res.statusCode).toBe(404);
  });

});