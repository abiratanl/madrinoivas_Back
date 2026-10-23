const request = require('supertest');
const app = require('../src/app');
const RentalModel = require('../src/models/RentalModel');
const ContractModel = require('../src/models/ContractModel');
const contractService = require('../src/services/contractService');

// =================================================================
// 1. MOCKS
// =================================================================

jest.mock('../src/models/RentalModel');
jest.mock('../src/models/ContractModel');
jest.mock('../src/services/contractService');

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

const VALID_SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// =================================================================
// 2. API TESTS
// =================================================================
describe('Rental Contracts API', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- GENERATE CONTRACT (POST /api/rentals/:id/contract) ---

  it('POST /api/rentals/:id/contract › Should generate a contract successfully', async () => {
    RentalModel.findById.mockResolvedValue({ id: 'rental-1', status: 'reserved' });
    contractService.issueContract.mockResolvedValue({ contractId: 'contract-1' });

    const res = await request(app)
      .post('/api/rentals/rental-1/contract')
      .send({ lessee_signature: VALID_SIGNATURE });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/contrato gerado/i);
    expect(res.body.data.id).toBe('contract-1');
    expect(res.body.data.pdf_url).toBe('/api/contracts/contract-1/pdf');
    expect(contractService.issueContract).toHaveBeenCalledWith(
      'rental-1',
      'user-caixa',
      VALID_SIGNATURE,
    );
  });

  it('POST /api/rentals/:id/contract › Should FAIL without a signature', async () => {
    const res = await request(app).post('/api/rentals/rental-1/contract').send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/assinatura/i);
    expect(contractService.issueContract).not.toHaveBeenCalled();
  });

  it('POST /api/rentals/:id/contract › Should FAIL with an invalid signature', async () => {
    RentalModel.findById.mockResolvedValue({ id: 'rental-1', status: 'reserved' });
    contractService.issueContract.mockRejectedValue(new Error('INVALID_SIGNATURE'));

    const res = await request(app)
      .post('/api/rentals/rental-1/contract')
      .send({ lessee_signature: 'not-a-data-url' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/assinatura inválida/i);
  });

  it('POST /api/rentals/:id/contract › Should FAIL if rental does not exist', async () => {
    RentalModel.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/rentals/rental-fantasma/contract')
      .send({ lessee_signature: VALID_SIGNATURE });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/aluguel não encontrado/i);
    expect(contractService.issueContract).not.toHaveBeenCalled();
  });

  it('POST /api/rentals/:id/contract › Should FAIL for a cancelled rental', async () => {
    RentalModel.findById.mockResolvedValue({ id: 'rental-1', status: 'cancelled' });

    const res = await request(app)
      .post('/api/rentals/rental-1/contract')
      .send({ lessee_signature: VALID_SIGNATURE });

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/cancelado/i);
    expect(contractService.issueContract).not.toHaveBeenCalled();
  });

  it('POST /api/rentals/:id/contract › Should return 500 when the service fails', async () => {
    RentalModel.findById.mockResolvedValue({ id: 'rental-1', status: 'reserved' });
    contractService.issueContract.mockRejectedValue(new Error('PDF exploded'));

    const res = await request(app)
      .post('/api/rentals/rental-1/contract')
      .send({ lessee_signature: VALID_SIGNATURE });

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toMatch(/erro ao gerar contrato/i);
  });

  // --- DOWNLOAD PDF (GET /api/contracts/:id/pdf) ---

  it('GET /api/contracts/:id/pdf › Should return the signed PDF', async () => {
    ContractModel.findById.mockResolvedValue({ id: 'contract-1' });
    contractService.getContractPdfBuffer.mockResolvedValue(Buffer.from('%PDF-fake'));

    const res = await request(app).get('/api/contracts/contract-1/pdf');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/contrato_contract/);
    expect(contractService.getContractPdfBuffer).toHaveBeenCalledWith('contract-1');
  });

  it('GET /api/contracts/:id/pdf › Should FAIL if contract does not exist', async () => {
    ContractModel.findById.mockResolvedValue(null);

    const res = await request(app).get('/api/contracts/contract-fantasma/pdf');

    expect(res.statusCode).toBe(404);
    expect(contractService.getContractPdfBuffer).not.toHaveBeenCalled();
  });

  // --- DOWNLOAD LATEST PDF BY RENTAL (GET /api/rentals/:id/contract/pdf) ---

  it('GET /api/rentals/:id/contract/pdf › Should return the PDF of the latest contract', async () => {
    ContractModel.findByRentalId.mockResolvedValue([{ id: 'contract-1' }]);
    contractService.getContractPdfBuffer.mockResolvedValue(Buffer.from('%PDF-fake'));

    const res = await request(app).get('/api/rentals/rental-1/contract/pdf');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(ContractModel.findByRentalId).toHaveBeenCalledWith('rental-1');
    expect(contractService.getContractPdfBuffer).toHaveBeenCalledWith('contract-1');
  });

  it('GET /api/rentals/:id/contract/pdf › Should FAIL if rental has no contracts', async () => {
    ContractModel.findByRentalId.mockResolvedValue([]);

    const res = await request(app).get('/api/rentals/rental-1/contract/pdf');

    expect(res.statusCode).toBe(404);
    expect(contractService.getContractPdfBuffer).not.toHaveBeenCalled();
  });

  // --- SEND EMAIL (POST /api/contracts/:id/send-email) ---

  it('POST /api/contracts/:id/send-email › Should send the contract by email', async () => {
    ContractModel.findById.mockResolvedValue({ id: 'contract-1' });
    contractService.sendContractEmail.mockResolvedValue({ deliveryStatus: 'sent' });

    const res = await request(app)
      .post('/api/contracts/contract-1/send-email')
      .send({ email: 'cliente@email.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.emailDeliveryStatus).toBe('sent');
    expect(contractService.sendContractEmail).toHaveBeenCalledWith(
      'contract-1',
      'cliente@email.com',
      'user-caixa',
    );
  });

  it('POST /api/contracts/:id/send-email › Should FAIL without an email', async () => {
    const res = await request(app).post('/api/contracts/contract-1/send-email').send({});

    expect(res.statusCode).toBe(400);
    expect(contractService.sendContractEmail).not.toHaveBeenCalled();
  });

  it('POST /api/contracts/:id/send-email › Should FAIL if contract does not exist', async () => {
    ContractModel.findById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/contracts/contract-fantasma/send-email')
      .send({ email: 'cliente@email.com' });

    expect(res.statusCode).toBe(404);
    expect(contractService.sendContractEmail).not.toHaveBeenCalled();
  });

  it('POST /api/contracts/:id/send-email › Should return 502 when delivery fails', async () => {
    ContractModel.findById.mockResolvedValue({ id: 'contract-1' });
    contractService.sendContractEmail.mockResolvedValue({ deliveryStatus: 'failed' });

    const res = await request(app)
      .post('/api/contracts/contract-1/send-email')
      .send({ email: 'cliente@email.com' });

    expect(res.statusCode).toBe(502);
    expect(res.body.data.emailDeliveryStatus).toBe('failed');
  });

  // --- SEND WHATSAPP (POST /api/contracts/:id/send-whatsapp) ---

  it('POST /api/contracts/:id/send-whatsapp › Should send the contract via WhatsApp', async () => {
    ContractModel.findById.mockResolvedValue({ id: 'contract-1' });
    contractService.sendContractWhatsApp.mockResolvedValue({ deliveryStatus: 'sent' });

    const res = await request(app)
      .post('/api/contracts/contract-1/send-whatsapp')
      .send({ phone: '12999998888' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.whatsappDeliveryStatus).toBe('sent');
    expect(contractService.sendContractWhatsApp).toHaveBeenCalledWith(
      'contract-1',
      '12999998888',
      'user-caixa',
    );
  });

  it('POST /api/contracts/:id/send-whatsapp › Should FAIL without a phone', async () => {
    const res = await request(app).post('/api/contracts/contract-1/send-whatsapp').send({});

    expect(res.statusCode).toBe(400);
    expect(contractService.sendContractWhatsApp).not.toHaveBeenCalled();
  });

  it('POST /api/contracts/:id/send-whatsapp › Should report failed delivery', async () => {
    ContractModel.findById.mockResolvedValue({ id: 'contract-1' });
    contractService.sendContractWhatsApp.mockResolvedValue({ deliveryStatus: 'failed' });

    const res = await request(app)
      .post('/api/contracts/contract-1/send-whatsapp')
      .send({ phone: '12999998888' });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.data.whatsappDeliveryStatus).toBe('failed');
  });
});
