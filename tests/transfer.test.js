const request = require('supertest');
const app = require('../src/app');
const TransferModel = require('../src/models/TransferModel');
const ProductModel = require('../src/models/ProductModel');

// MOCKS
jest.mock('../src/models/TransferModel');
jest.mock('../src/models/ProductModel');
jest.mock('../src/middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    // Simulando attendant da Loja DESTINO (store-B)
    req.user = { id: 'user-2', role: 'attendant', storeId: 'store-B' };
    next();
  },
  restrictTo: (...roles) => (req, res, next) => next(),
}));

describe('Product Transfer Flow (Logistics)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- CENÁRIO 1: SOLICITAR TRANSFERÊNCIA ---
  it('POST /api/transfers/request › Should start transfer successfully', async () => {
    // 1. Mock do Produto: Está na Loja A e disponível
    ProductModel.findById.mockResolvedValue({
      id: 'prod-1',
      store_id: 'store-A',
      status: 'available',
      name: 'Terno Slim'
    });

    // 2. Mocks de Sucesso nas gravações
    ProductModel.update.mockResolvedValue(true);
    TransferModel.create.mockResolvedValue({ id: 'transf-1', status: 'active' });

    // 3. Atendente da Loja B pede o produto para a Loja B
    const res = await request(app).post('/api/transfers/request').send({
      product_id: 'prod-1',
      to_store_id: 'store-B'
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/trânsito/i);

    // VERIFICAÇÕES CRITICAS:
    // O produto deve ter mudado o status para 'transferring'
    expect(ProductModel.update).toHaveBeenCalledWith('prod-1', { status: 'transferring' });
  });

  it('POST /api/transfers/request › Should fail if product is already in the same store', async () => {
    ProductModel.findById.mockResolvedValue({
      id: 'prod-2',
      store_id: 'store-B', // Já está na loja B
      status: 'available'
    });

    const res = await request(app).post('/api/transfers/request').send({
      product_id: 'prod-2',
      to_store_id: 'store-B'
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/já se encontra/i);
  });

  // --- CENÁRIO 2: RECEBER PRODUTO ---
  it('POST /api/transfers/receive › Should complete transfer and move product to new store', async () => {
    // 1. Mock da Transferência: Está em trânsito para a Loja B
    TransferModel.findById.mockResolvedValue({
      id: 'transf-1',
      product_id: 'prod-1',
      to_store_id: 'store-B', // Destino bate com o usuário logado (store-B)
      status: 'active'
    });

    ProductModel.update.mockResolvedValue(true);
    TransferModel.updateStatus.mockResolvedValue(true);

    const res = await request(app).post('/api/transfers/receive').send({
      transfer_id: 'transf-1'
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/sucesso/i);

    // VERIFICAÇÃO FINAL (A MÁGICA):
    // O produto deve mudar para store-B e ficar 'available'
    expect(ProductModel.update).toHaveBeenCalledWith('prod-1', {
      store_id: 'store-B',
      status: 'available'
    });
    
    // A transferência deve ser finalizada
    expect(TransferModel.updateStatus).toHaveBeenCalledWith('transf-1', 'completed', expect.any(Date), 'user-2');
  });
});