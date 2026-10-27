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
  restrictTo:
    (..._roles) =>
    (req, res, next) =>
      next(),
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
      status: 'picked_up',
    });

    // 2. Mock da Operação de Banco
    RentalModel.returnRental.mockResolvedValue({ penaltyFee: 0 });

    const res = await request(app).post('/api/rentals/rental-active/return').send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/devolução registrada/i);
    expect(RentalModel.returnRental).toHaveBeenCalledWith('rental-active', 0, false);
  });

  it('POST /api/rentals/:id/return › Should FAIL if already returned', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-closed',
      store_id: 'store-A',
      status: 'returned', // Já devolvido
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
      status: 'picked_up',
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
      status: 'reserved',
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
      status: 'picked_up',
    });

    const res = await request(app).post('/api/rentals/rental-out/cancel');

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/não é possível cancelar/i);
    expect(RentalModel.cancelRental).not.toHaveBeenCalled();
  });

  // --- UPDATE (EDIÇÃO) ---

  it('PUT /api/rentals/:id › Should ALLOW editing penalty_fee on a picked_up rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-out',
      store_id: 'store-A',
      status: 'picked_up',
    });
    RentalModel.updateRental.mockResolvedValue(true);

    const res = await request(app)
      .put('/api/rentals/rental-out')
      .send({ penalty_fee: 50, discount: 0, notes: 'Multa por atraso' });

    expect(res.statusCode).toBe(200);
    expect(RentalModel.updateRental).toHaveBeenCalledWith(
      'rental-out',
      expect.objectContaining({ penalty_fee: 50, notes: 'Multa por atraso' }),
    );
  });

  it('PUT /api/rentals/:id › Should ALLOW editing penalty_fee on a late rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-late',
      store_id: 'store-A',
      status: 'late',
    });
    RentalModel.updateRental.mockResolvedValue(true);

    const res = await request(app).put('/api/rentals/rental-late').send({ penalty_fee: 80 });

    expect(res.statusCode).toBe(200);
    expect(RentalModel.updateRental).toHaveBeenCalled();
  });

  it('PUT /api/rentals/:id › Should FAIL when changing locked fields on a picked_up rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-out',
      store_id: 'store-A',
      status: 'picked_up',
    });

    const res = await request(app)
      .put('/api/rentals/rental-out')
      .send({ penalty_fee: 50, products: [{ id: 'prod-1', quantity: 1 }] });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/retirado ou atrasado/i);
    expect(RentalModel.updateRental).not.toHaveBeenCalled();
  });

  it('PUT /api/rentals/:id › Should FAIL when changing status on a late rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-late',
      store_id: 'store-A',
      status: 'late',
    });

    const res = await request(app)
      .put('/api/rentals/rental-late')
      .send({ penalty_fee: 50, status: 'returned' });

    expect(res.statusCode).toBe(400);
    expect(RentalModel.updateRental).not.toHaveBeenCalled();
  });

  it('PUT /api/rentals/:id › Should FAIL to edit a returned rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-closed',
      store_id: 'store-A',
      status: 'returned',
    });

    const res = await request(app).put('/api/rentals/rental-closed').send({ penalty_fee: 50 });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/finalizado ou cancelado/i);
    expect(RentalModel.updateRental).not.toHaveBeenCalled();
  });

  // --- PICKUP (RETIRADA) ---

  it('POST /api/rentals/:id/pickup › Should confirm pickup of a reserved rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-reserved',
      store_id: 'store-A',
      status: 'reserved',
    });
    RentalModel.pickUp.mockResolvedValue(true);

    const res = await request(app).post('/api/rentals/rental-reserved/pickup');

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/retirada confirmada/i);
    expect(RentalModel.pickUp).toHaveBeenCalledWith('rental-reserved');
  });

  it('POST /api/rentals/:id/pickup › Should FAIL when status does not allow pickup', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-picked',
      store_id: 'store-A',
      status: 'picked_up',
    });

    const res = await request(app).post('/api/rentals/rental-picked/pickup');

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/não permite retirada/i);
    expect(RentalModel.pickUp).not.toHaveBeenCalled();
  });

  it('POST /api/rentals/:id/pickup › Should DENY pickup from another store', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-other',
      store_id: 'store-B',
      status: 'reserved',
    });

    const res = await request(app).post('/api/rentals/rental-other/pickup');

    expect(res.statusCode).toBe(403);
    expect(RentalModel.pickUp).not.toHaveBeenCalled();
  });

  // --- EXTEND (PRORROGAÇÃO) ---

  it('POST /api/rentals/:id/extend › Should extend a picked up rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-active',
      store_id: 'store-A',
      status: 'picked_up',
    });
    RentalModel.extendRental.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/rentals/rental-active/extend')
      .send({ new_end_date: '2026-12-30', extra_amount: 150 });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/prorrogado/i);
    expect(RentalModel.extendRental).toHaveBeenCalledWith('rental-active', '2026-12-30', 150);
  });

  it('POST /api/rentals/:id/extend › Should require the new end date', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-active',
      store_id: 'store-A',
      status: 'picked_up',
    });

    const res = await request(app).post('/api/rentals/rental-active/extend').send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/nova data/i);
    expect(RentalModel.extendRental).not.toHaveBeenCalled();
  });

  it('POST /api/rentals/:id/extend › Should FAIL when the rental was not picked up', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-reserved',
      store_id: 'store-A',
      status: 'reserved',
    });

    const res = await request(app)
      .post('/api/rentals/rental-reserved/extend')
      .send({ new_end_date: '2026-12-30' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/já foram retirados/i);
    expect(RentalModel.extendRental).not.toHaveBeenCalled();
  });

  // --- RETURN OPTIONS ---

  it('POST /api/rentals/:id/return › Should forward the penalty and makeAvailable flag', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-active',
      store_id: 'store-A',
      status: 'picked_up',
    });
    RentalModel.returnRental.mockResolvedValue({ penaltyFee: 25 });

    const res = await request(app)
      .post('/api/rentals/rental-active/return')
      .send({ penalty_fee: 25, makeAvailable: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/disponíveis/i);
    expect(RentalModel.returnRental).toHaveBeenCalledWith('rental-active', 25, true);
  });

  // --- DELETE (EXCLUSÃO PERMANENTE) ---

  it('DELETE /api/rentals/:id › Should permanently delete a cancelled rental', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-cancelled',
      store_id: 'store-A',
      status: 'cancelled',
    });
    RentalModel.deleteRental.mockResolvedValue(true);

    const res = await request(app).delete('/api/rentals/rental-cancelled');

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/excluído permanentemente/i);
    expect(RentalModel.deleteRental).toHaveBeenCalledWith('rental-cancelled');
  });

  it('DELETE /api/rentals/:id › Should FAIL to delete a rental that is not cancelled', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-reserved',
      store_id: 'store-A',
      status: 'reserved',
    });

    const res = await request(app).delete('/api/rentals/rental-reserved');

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Apenas itens cancelados/i);
    expect(RentalModel.deleteRental).not.toHaveBeenCalled();
  });

  it('DELETE /api/rentals/:id › Should DENY deleting a rental from another store', async () => {
    RentalModel.findById.mockResolvedValue({
      id: 'rental-other',
      store_id: 'store-B',
      status: 'cancelled',
    });

    const res = await request(app).delete('/api/rentals/rental-other');

    expect(res.statusCode).toBe(403);
    expect(RentalModel.deleteRental).not.toHaveBeenCalled();
  });
});
