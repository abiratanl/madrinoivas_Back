const request = require('supertest');
const app = require('../src/app');
const RentalModel = require('../src/models/RentalModel');

// =================================================================
// 1. MOCKS
// =================================================================

jest.mock('../src/models/RentalModel');
// Não precisamos do ProductModel aqui pois o RentalModel.returnRental resolve tudo internamente

// Mock Auth: Usuário Attendant da Loja A
jest.mock('../src/middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = { id: 'user-op', role: 'attendant', storeId: 'store-A' };
    next();
  },
  restrictTo: (...roles) => (req, res, next) => next(),
}));

// =================================================================
// 2. SUÍTE DE TESTES (OPERAÇÕES)
// =================================================================
describe('Rental Operations (Return & Cancel)', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- RETURN (DEVOLUÇÃO) ---

  it('POST /api/rentals/:id/return › Should return items successfully', async () => {
    // 1. Mock do Aluguel Atual (Status: Retirado)
    RentalModel.findById.mockResolvedValue({
      id: 'rental-active',
      store_id: 'store-A', // Mesma loja
      status: 'picked_up'
    });

    // 2. Mock da Operação de Banco
    RentalModel.returnRental.mockResolvedValue({ penaltyFee: 0 });

    const res = await request(app).post('/api/rentals/rental-active/return').send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/devolução registrada/i);
    expect(RentalModel.returnRental).toHaveBeenCalledWith('rental-active', 0);
  });

  it('POST /api/rentals/:id/return › Should FAIL if already returned', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-closed',
      store_id: 'store-A',
      status: 'returned' // Já devolvido
    });

    const res = await request(app).post('/api/rentals/rental-closed/return');

    expect(res.statusCode).toBe(400); // Bad Request
    expect(res.body.message).toMatch(/já foi finalizado/i);
    expect(RentalModel.returnRental).not.toHaveBeenCalled();
  });

  it('POST /api/rentals/:id/return › Should DENY return from another store', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-other',
      store_id: 'store-B', // Loja Diferente
      status: 'picked_up'
    });

    const res = await request(app).post('/api/rentals/rental-other/return');

    expect(res.statusCode).toBe(403); // Forbidden
    expect(RentalModel.returnRental).not.toHaveBeenCalled();
  });

  // --- CANCEL (CANCELAMENTO) ---

  it('POST /api/rentals/:id/cancel › Should cancel reservation successfully', async () => {
    // 1. Mock do Aluguel (Status: Reservado, ainda não saiu da loja)
    RentalModel.findById.mockResolvedValue({
      id: 'rental-res',
      store_id: 'store-A',
      status: 'reserved'
    });

    RentalModel.cancelRental.mockResolvedValue(true);

    const res = await request(app).post('/api/rentals/rental-res/cancel');

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/cancelado/i);
    expect(RentalModel.cancelRental).toHaveBeenCalledWith('rental-res');
  });

  it('POST /api/rentals/:id/cancel › Should FAIL if items were already picked up', async () => {
    // Regra de Negócio: Se o cliente já levou (picked_up), não pode cancelar, tem que devolver.
    RentalModel.findById.mockResolvedValue({
      id: 'rental-out',
      store_id: 'store-A',
      status: 'picked_up'
    });

    const res = await request(app).post('/api/rentals/rental-out/cancel');

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/não é possível cancelar/i);
    expect(RentalModel.cancelRental).not.toHaveBeenCalled();
  });

});