const request = require('supertest');
const app = require('../src/app');
const StoreModel = require('../src/models/StoreModel');

jest.mock('../src/services/uploadService', () => ({
  uploadBuffer: jest.fn(),
  getPublicUrl: jest.fn((key) => (key ? `https://cdn.test/${key}` : null)),
  extractKey: jest.fn((value) => value),
  deleteFile: jest.fn(),
}));

const { uploadBuffer } = require('../src/services/uploadService');

// =================================================================
// 1. MOCKS
// =================================================================

// Mock the Model so the real database is never touched
jest.mock('../src/models/StoreModel');

// Mock authentication
jest.mock('../src/middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = { id: 'user-id', role: 'admin', storeId: 'store-A' };
    next();
  },
  restrictTo:
    (..._roles) =>
    (req, res, next) =>
      next(),
}));

// =================================================================
// 2. TEST SUITE
// =================================================================
describe('Store Management API', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- CREATE (POST) ---

  it('POST /api/stores › Should create a store with owner data, contacts and addresses', async () => {
    const newStore = {
      name: 'Madri Noivas - Taubaté',
      cnpj: '12.345.678/0001-90',
      owner_name: 'João da Silva',
      owner_cpf: '123.456.789-00',
      contacts: [{ type: 'whatsapp', value: '11999998888', is_primary: true }],
      addresses: [{ street: 'Rua A', city: 'Taubaté', state: 'SP', zip_code: '12000-000' }],
    };

    StoreModel.create.mockResolvedValue({ id: 'uuid-novo', ...newStore });

    const res = await request(app).post('/api/stores').send(newStore);

    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('success');

    expect(StoreModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Madri Noivas - Taubaté',
        cnpj: '12.345.678/0001-90',
        owner_name: 'João da Silva',
        owner_cpf: '123.456.789-00',
        contacts: [
          expect.objectContaining({ type: 'whatsapp', value: '11999998888', is_primary: 1 }),
        ],
        addresses: expect.any(Array),
      }),
    );
  });

  it('POST /api/stores › Should return 400 when name is missing', async () => {
    const res = await request(app).post('/api/stores').send({ cnpj: '12.345.678/0001-90' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Nome da loja é obrigatório');
    expect(StoreModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/stores › Should return 400 for an invalid CNPJ', async () => {
    const res = await request(app).post('/api/stores').send({ name: 'Loja X', cnpj: '123' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('CNPJ inválido');
    expect(StoreModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/stores › Should return 400 for an invalid owner CPF', async () => {
    const res = await request(app).post('/api/stores').send({ name: 'Loja X', owner_cpf: '111' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('CPF do responsável inválido');
    expect(StoreModel.create).not.toHaveBeenCalled();
  });

  it('POST /api/stores › Should return 400 for an invalid contact type', async () => {
    const res = await request(app)
      .post('/api/stores')
      .send({ name: 'Loja X', contacts: [{ type: 'telegram', value: '@loja' }] });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Tipo de contato inválido');
    expect(StoreModel.create).not.toHaveBeenCalled();
  });

  // --- UPDATE (PUT) ---

  it('PUT /api/stores/:id › Should partially update owner fields without requiring name', async () => {
    StoreModel.update.mockResolvedValue(true);
    StoreModel.findById.mockResolvedValue({ id: 'store-1', owner_name: 'Maria Souza' });

    const res = await request(app)
      .put('/api/stores/store-1')
      .send({ owner_name: 'Maria Souza', cnpj: '98.765.432/0001-10' });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');

    expect(StoreModel.update).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({ owner_name: 'Maria Souza', cnpj: '98.765.432/0001-10' }),
    );
    // Name must not be forced on partial updates
    const updateData = StoreModel.update.mock.calls[0][1];
    expect(updateData).not.toHaveProperty('name');
    expect(updateData).not.toHaveProperty('addresses');
    expect(updateData).not.toHaveProperty('contacts');
  });

  it('PUT /api/stores/:id › Should sync contacts when the array is provided', async () => {
    StoreModel.update.mockResolvedValue(true);
    StoreModel.findById.mockResolvedValue({ id: 'store-1' });

    const res = await request(app)
      .put('/api/stores/store-1')
      .send({ contacts: [{ type: 'email', value: 'loja@madri.com' }] });

    expect(res.statusCode).toBe(200);
    expect(StoreModel.update).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({
        contacts: [expect.objectContaining({ type: 'email', value: 'loja@madri.com' })],
      }),
    );
  });

  it('PUT /api/stores/:id › Should upload the signature to R2 and store only its path', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    StoreModel.findById
      .mockResolvedValueOnce({ id: 'store-1', owner_signature: null })
      .mockResolvedValueOnce({
        id: 'store-1',
        owner_signature: 'stores/signatures/test.png',
      });
    StoreModel.update.mockResolvedValue(true);
    uploadBuffer.mockResolvedValue('stores/signatures/test.png');

    const res = await request(app)
      .put('/api/stores/store-1')
      .field('name', 'Loja com assinatura')
      .field(
        'addresses',
        JSON.stringify([{ street: 'Rua A', city: 'Taubaté', state: 'SP', zip_code: '12000-000' }]),
      )
      .attach('owner_signature', png, { filename: 'assinatura.png', contentType: 'image/png' });

    expect(res.statusCode).toBe(200);
    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringMatching(/^stores\/signatures\/.+\.png$/),
      'image/png',
    );
    expect(StoreModel.update).toHaveBeenCalledWith(
      'store-1',
      expect.objectContaining({
        owner_signature: 'stores/signatures/test.png',
        addresses: expect.any(Array),
      }),
    );
    expect(res.body.data.owner_signature_url).toBe('https://cdn.test/stores/signatures/test.png');
  });

  it('PUT /api/stores/:id › Should return 404 when the store does not exist', async () => {
    StoreModel.update.mockResolvedValue(false);

    const res = await request(app).put('/api/stores/store-x').send({ name: 'Nova Loja' });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toContain('Loja não encontrada');
  });

  // --- READ (GET) ---

  it('GET /api/stores › Should list stores', async () => {
    StoreModel.findAll.mockResolvedValue([
      { id: 'store-1', name: 'Matriz', contacts: [], addresses: [] },
    ]);

    const res = await request(app).get('/api/stores');

    expect(res.statusCode).toBe(200);
    expect(res.body.results).toBe(1);
    expect(StoreModel.findAll).toHaveBeenCalledWith(false);
  });

  it('GET /api/stores/:id › Should return a store with contacts and addresses', async () => {
    StoreModel.findById.mockResolvedValue({
      id: 'store-1',
      name: 'Matriz',
      contacts: [{ type: 'whatsapp', value: '11999998888' }],
      addresses: [{ city: 'Guaratinguetá', state: 'SP' }],
    });

    const res = await request(app).get('/api/stores/store-1');

    expect(res.statusCode).toBe(200);
    expect(res.body.data.contacts).toHaveLength(1);
    expect(res.body.data.addresses).toHaveLength(1);
  });

  it('GET /api/stores/:id › Should return 404 when the store does not exist', async () => {
    StoreModel.findById.mockResolvedValue(null);

    const res = await request(app).get('/api/stores/store-x');

    expect(res.statusCode).toBe(404);
  });

  // --- TOGGLE ACTIVE (PATCH) ---

  it('PATCH /api/stores/:id/active › Should toggle the store status', async () => {
    StoreModel.toggleActive.mockResolvedValue(true);
    StoreModel.findById.mockResolvedValue({ id: 'store-1', is_active: 0 });

    const res = await request(app).patch('/api/stores/store-1/active');

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain('inativada');
  });
});
